import { BadGatewayException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderSnapshotInput, TrackingPoint, TrackingProvider, TrackingSnapshot, TrackingStatus } from '../types';

@Injectable()
export class FlightradarProvider implements TrackingProvider {
  readonly provider = 'FR24' as const;
  readonly mode = 'AIR' as const;

  private readonly logger = new Logger(FlightradarProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async fetchSnapshot(input: ProviderSnapshotInput): Promise<TrackingSnapshot> {
    const baseUrl = (this.configService.get<string>('FR24_BASE_URL') ?? '').trim();
    const snapshotEndpoint = (this.configService.get<string>('FR24_SNAPSHOT_ENDPOINT') ?? '').trim();
    const routeEndpoint = (this.configService.get<string>('FR24_ROUTE_ENDPOINT') ?? '').trim();

    if (!baseUrl || !snapshotEndpoint) {
      throw new InternalServerErrorException('FR24 endpoint configuration is missing.');
    }

    const snapshotUrl = this.buildUrl(baseUrl, snapshotEndpoint, input.externalId);
    const snapshotPayload = await this.requestJson(snapshotUrl, input.apiKey);

    let routePayload: any = null;
    if (routeEndpoint) {
      try {
        const routeUrl = this.buildUrl(baseUrl, routeEndpoint, input.externalId);
        routePayload = await this.requestJson(routeUrl, input.apiKey);
      } catch (error) {
        this.logger.warn(`FR24 route endpoint failed. Falling back to snapshot payload: ${(error as Error).message}`);
      }
    }

    const current = this.extractCurrentPoint(snapshotPayload);
    const route = this.extractRoutePoints(routePayload ?? snapshotPayload, 'FR24');

    return {
      mode: 'AIR',
      status: this.mapStatus(snapshotPayload),
      current: current ?? route[route.length - 1],
      route: route.length > 0 ? route : undefined,
      eta: this.extractEta(snapshotPayload),
      meta: {
        provider: this.provider,
        externalId: input.externalId,
      },
    };
  }

  private async requestJson(url: string, apiKey: string): Promise<any> {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'x-api-key': apiKey,
      },
    });

    if (!response.ok) {
      throw new BadGatewayException(`FR24 request failed with status ${response.status}.`);
    }

    return response.json();
  }

  private buildUrl(baseUrl: string, endpoint: string, externalId: string): string {
    const trimmedBase = baseUrl.replace(/\/+$/g, '');
    const endpointWithId = endpoint.includes('{externalId}')
      ? endpoint.replace('{externalId}', encodeURIComponent(externalId))
      : endpoint;

    const absolute = endpointWithId.startsWith('http://') || endpointWithId.startsWith('https://');
    const url = new URL(absolute ? endpointWithId : `${trimmedBase}/${endpointWithId.replace(/^\/+/g, '')}`);

    if (!endpoint.includes('{externalId}') && !url.searchParams.has('externalId')) {
      url.searchParams.set('externalId', externalId);
    }

    return url.toString();
  }

  private mapStatus(payload: any): TrackingStatus {
    const raw = String(
      payload?.status ?? payload?.flight_status ?? payload?.state ?? payload?.flight?.status ?? payload?.data?.status ?? '',
    )
      .trim()
      .toUpperCase();

    if (!raw) return 'UNKNOWN';
    if (raw.includes('CANCEL')) return 'CANCELLED';
    if (raw.includes('DELAY')) return 'DELAYED';
    if (raw.includes('ARRIV')) return 'ARRIVED';
    if (raw.includes('LANDED')) return 'ARRIVED';
    if (raw.includes('ENROUTE')) return 'IN_TRANSIT';
    if (raw.includes('IN_AIR')) return 'IN_TRANSIT';
    if (raw.includes('DEPART')) return 'IN_TRANSIT';
    return 'UNKNOWN';
  }

  private extractCurrentPoint(payload: any): TrackingPoint | undefined {
    const current = payload?.current_position ?? payload?.position ?? payload?.data?.position ?? payload;
    const lat = this.pickNumber(current, ['lat', 'latitude', 'position.lat', 'position.latitude']);
    const lon = this.pickNumber(current, ['lon', 'lng', 'longitude', 'position.lon', 'position.lng', 'position.longitude']);

    if (lat == null || lon == null) return undefined;

    return {
      lat,
      lon,
      timestamp: this.toIsoTimestamp(this.pickUnknown(current, ['timestamp', 'ts', 'time', 'position.timestamp'])),
      speedKts: this.pickNumber(current, ['speed', 'speedKts', 'ground_speed', 'groundSpeed']),
      altitudeFt: this.pickNumber(current, ['altitude', 'altitudeFt', 'altitude_feet']),
      headingDeg: this.pickNumber(current, ['heading', 'track', 'course']),
      source: 'FR24',
    };
  }

  private extractRoutePoints(payload: any, source: 'FR24' | 'MT'): TrackingPoint[] {
    const candidates = [payload?.route, payload?.trail, payload?.track, payload?.positions, payload?.history, payload?.data?.route];
    const list = candidates.find((item) => Array.isArray(item)) as any[] | undefined;
    if (!list) return [];

    return list
      .map((item) => {
        const lat = this.pickNumber(item, ['lat', 'latitude', 'position.lat', 'position.latitude']);
        const lon = this.pickNumber(item, ['lon', 'lng', 'longitude', 'position.lon', 'position.lng', 'position.longitude']);
        if (lat == null || lon == null) return null;

        return {
          lat,
          lon,
          timestamp: this.toIsoTimestamp(this.pickUnknown(item, ['timestamp', 'ts', 'time', 'position.timestamp'])),
          speedKts: this.pickNumber(item, ['speed', 'speedKts', 'sog', 'ground_speed']),
          altitudeFt: this.pickNumber(item, ['altitude', 'altitudeFt', 'altitude_feet']),
          headingDeg: this.pickNumber(item, ['heading', 'track', 'cog', 'course']),
          source,
        } as TrackingPoint;
      })
      .filter((item): item is TrackingPoint => item !== null);
  }

  private extractEta(payload: any): string | undefined {
    const rawEta = this.pickUnknown(payload, ['eta', 'estimated_arrival', 'arrival.eta', 'flight.eta', 'data.eta']);
    if (rawEta == null) return undefined;
    return this.toIsoTimestamp(rawEta);
  }

  private pickUnknown(obj: any, paths: string[]): unknown {
    for (const path of paths) {
      const value = this.readPath(obj, path);
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }
    return undefined;
  }

  private pickNumber(obj: any, paths: string[]): number | undefined {
    const value = this.pickUnknown(obj, paths);
    if (value == null) return undefined;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return undefined;
    return numeric;
  }

  private readPath(obj: any, path: string): unknown {
    if (!obj || typeof obj !== 'object') return undefined;
    return path.split('.').reduce((acc: any, key: string) => (acc != null ? acc[key] : undefined), obj);
  }

  private toIsoTimestamp(raw: unknown): string {
    if (raw instanceof Date) return raw.toISOString();

    if (typeof raw === 'number') {
      const millis = raw > 1_000_000_000_000 ? raw : raw * 1000;
      const date = new Date(millis);
      return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
    }

    const text = String(raw ?? '').trim();
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString();
    }
    return parsed.toISOString();
  }
}
