import { BadGatewayException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderSnapshotInput, TrackingPoint, TrackingProvider, TrackingSnapshot, TrackingStatus } from '../types';

@Injectable()
export class MarineTrafficProvider implements TrackingProvider {
  readonly provider = 'MARINETRAFFIC' as const;
  readonly mode = 'SEA' as const;

  private readonly logger = new Logger(MarineTrafficProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async fetchSnapshot(input: ProviderSnapshotInput): Promise<TrackingSnapshot> {
    const baseUrl = (this.configService.get<string>('MT_BASE_URL') ?? '').trim();
    const vesselEndpoint = (this.configService.get<string>('MT_VESSEL_ENDPOINT') ?? '').trim();
    const routeEndpoint = (this.configService.get<string>('MT_ROUTE_ENDPOINT') ?? '').trim();

    if (!baseUrl || !vesselEndpoint) {
      throw new InternalServerErrorException('MarineTraffic endpoint configuration is missing.');
    }

    const vesselUrl = this.buildUrl(baseUrl, vesselEndpoint, input.externalId);
    const vesselPayload = await this.requestJson(vesselUrl, input.apiKey);

    let routePayload: any = null;
    if (routeEndpoint) {
      try {
        const routeUrl = this.buildUrl(baseUrl, routeEndpoint, input.externalId);
        routePayload = await this.requestJson(routeUrl, input.apiKey);
      } catch (error) {
        this.logger.warn(`MarineTraffic route endpoint failed. Falling back to vessel payload: ${(error as Error).message}`);
      }
    }

    const current = this.extractCurrentPoint(vesselPayload);
    const route = this.extractRoutePoints(routePayload ?? vesselPayload, 'MT');

    return {
      mode: 'SEA',
      status: this.mapStatus(vesselPayload),
      current: current ?? route[route.length - 1],
      route: route.length > 0 ? route : undefined,
      eta: this.extractEta(vesselPayload),
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
      throw new BadGatewayException(`MarineTraffic request failed with status ${response.status}.`);
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
      payload?.status ??
        payload?.navigation_status ??
        payload?.vessel_status ??
        payload?.state ??
        payload?.data?.status ??
        '',
    )
      .trim()
      .toUpperCase();

    if (!raw) return 'UNKNOWN';
    if (raw.includes('CANCEL')) return 'CANCELLED';
    if (raw.includes('DELAY')) return 'DELAYED';
    if (raw.includes('ARRIV')) return 'ARRIVED';
    if (raw.includes('MOORED')) return 'ARRIVED';
    if (raw.includes('UNDER_WAY')) return 'IN_TRANSIT';
    if (raw.includes('UNDERWAY')) return 'IN_TRANSIT';
    if (raw.includes('IN_TRANSIT')) return 'IN_TRANSIT';
    return 'UNKNOWN';
  }

  private extractCurrentPoint(payload: any): TrackingPoint | undefined {
    const current = payload?.current_position ?? payload?.position ?? payload?.data?.position ?? payload;
    const lat = this.pickNumber(current, ['lat', 'latitude', 'LAT', 'position.lat', 'position.latitude']);
    const lon = this.pickNumber(current, ['lon', 'lng', 'longitude', 'LON', 'position.lon', 'position.lng']);

    if (lat == null || lon == null) return undefined;

    return {
      lat,
      lon,
      timestamp: this.toIsoTimestamp(this.pickUnknown(current, ['timestamp', 'ts', 'time', 'TIMESTAMP'])),
      speedKts: this.pickNumber(current, ['speed', 'speedKts', 'sog', 'SPEED']),
      headingDeg: this.pickNumber(current, ['heading', 'cog', 'course', 'HEADING']),
      source: 'MT',
    };
  }

  private extractRoutePoints(payload: any, source: 'FR24' | 'MT'): TrackingPoint[] {
    const candidates = [payload?.route, payload?.track, payload?.positions, payload?.history, payload?.data?.positions];
    const list = candidates.find((item) => Array.isArray(item)) as any[] | undefined;
    if (!list) return [];

    return list
      .map((item) => {
        const lat = this.pickNumber(item, ['lat', 'latitude', 'LAT', 'position.lat', 'position.latitude']);
        const lon = this.pickNumber(item, ['lon', 'lng', 'longitude', 'LON', 'position.lon', 'position.lng']);
        if (lat == null || lon == null) return null;

        return {
          lat,
          lon,
          timestamp: this.toIsoTimestamp(this.pickUnknown(item, ['timestamp', 'ts', 'time', 'TIMESTAMP'])),
          speedKts: this.pickNumber(item, ['speed', 'speedKts', 'sog', 'SPEED']),
          headingDeg: this.pickNumber(item, ['heading', 'cog', 'course', 'HEADING']),
          source,
        } as TrackingPoint;
      })
      .filter((item): item is TrackingPoint => item !== null);
  }

  private extractEta(payload: any): string | undefined {
    const rawEta = this.pickUnknown(payload, ['eta', 'ETA', 'estimated_arrival', 'arrival.eta', 'data.eta']);
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
