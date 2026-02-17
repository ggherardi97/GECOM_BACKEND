import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, tracking_mode_enum, tracking_provider_enum } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertTrackingLinkDto } from './dto/upsert-tracking-link.dto';
import { FlightradarProvider } from './providers/flightradar.provider';
import { MarineTrafficProvider } from './providers/marinetraffic.provider';
import { TrackingMode, TrackingProvider, TrackingProviderName, TrackingSnapshot, TrackingStatus } from './types';

class TtlLruCache<T> {
  private readonly store = new Map<string, { value: T; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    if (this.store.size <= this.maxEntries) return;

    const oldestKey = this.store.keys().next().value;
    if (oldestKey) this.store.delete(oldestKey);
  }

  delete(key: string): void {
    this.store.delete(key);
  }
}

class TrackingRateLimitException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

@Injectable()
export class FeatureFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async hasTrackingPremium(tenantId: string): Promise<boolean> {
    try {
      const rows = await this.prisma.raw.$queryRaw<Array<{ enabled: boolean }>>`
        SELECT enabled
        FROM tenant_features
        WHERE tenant_id = ${tenantId}
          AND feature_key = 'tracking_premium'
        LIMIT 1
      `;
      if (rows.length > 0) {
        return Boolean(rows[0].enabled);
      }
    } catch {
      // optional table not present yet
    }

    const list = String(this.configService.get<string>('TRACKING_PREMIUM_TENANTS') ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    if (list.length > 0) {
      return list.includes(tenantId);
    }

    const defaultEnabled = String(this.configService.get<string>('TRACKING_PREMIUM_DEFAULT_ENABLED') ?? 'true')
      .trim()
      .toLowerCase();

    return defaultEnabled === 'true' || defaultEnabled === '1' || defaultEnabled === 'yes';
  }
}

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);
  private readonly cache: TtlLruCache<TrackingSnapshot>;
  private readonly providerMinIntervalMs: number;
  private readonly providerLastHit = new Map<string, number>();
  private readonly providers = new Map<TrackingProviderName, TrackingProvider>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly featureFlagsService: FeatureFlagsService,
    private readonly fr24Provider: FlightradarProvider,
    private readonly marineTrafficProvider: MarineTrafficProvider,
  ) {
    const ttlMs = Number(this.configService.get<string>('TRACKING_CACHE_TTL_MS') ?? 60_000);
    const maxEntries = Number(this.configService.get<string>('TRACKING_CACHE_MAX_ENTRIES') ?? 500);
    this.providerMinIntervalMs = Number(this.configService.get<string>('TRACKING_PROVIDER_MIN_INTERVAL_MS') ?? 1000);
    this.cache = new TtlLruCache(Math.max(ttlMs, 1000), Math.max(maxEntries, 50));

    this.providers.set(this.fr24Provider.provider, this.fr24Provider);
    this.providers.set(this.marineTrafficProvider.provider, this.marineTrafficProvider);
  }

  async getTrackingSnapshot(params: { tenantId: string; processId: string; forceRefresh?: boolean }): Promise<TrackingSnapshot> {
    await this.assertPremiumEnabled(params.tenantId);
    await this.assertProcessExists(params.tenantId, params.processId);

    const link = await this.prisma.tracking_links.findFirst({
      where: {
        tenant_id: params.tenantId,
        process_id: params.processId,
      },
    });

    if (!link) {
      throw new NotFoundException('Tracking link not found for this process.');
    }

    const cacheKey = this.getCacheKey(params.tenantId, params.processId);
    if (!params.forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    const refreshed = await this.refreshLink({
      tenantId: params.tenantId,
      processId: params.processId,
      link,
      allowFallback: true,
    });

    this.cache.set(cacheKey, refreshed);
    return refreshed;
  }

  async upsertTrackingLink(params: { tenantId: string; processId: string; dto: UpsertTrackingLinkDto }) {
    await this.assertPremiumEnabled(params.tenantId);
    await this.assertProcessExists(params.tenantId, params.processId);
    this.assertModeProviderCompatibility(params.dto.mode as TrackingMode, params.dto.provider as TrackingProviderName);

    const existing = await this.prisma.tracking_links.findFirst({
      where: {
        tenant_id: params.tenantId,
        process_id: params.processId,
      },
    });

    const now = new Date();

    const link = existing
      ? await this.prisma.tracking_links.update({
          where: { id: existing.id },
          data: {
            mode: params.dto.mode as tracking_mode_enum,
            provider: params.dto.provider as tracking_provider_enum,
            external_id: params.dto.externalId,
            last_snapshot_json: Prisma.JsonNull,
            last_synced_at: null,
            updated_at: now,
          },
        })
      : await this.prisma.tracking_links.create({
          data: {
            tenant_id: params.tenantId,
            process_id: params.processId,
            mode: params.dto.mode as tracking_mode_enum,
            provider: params.dto.provider as tracking_provider_enum,
            external_id: params.dto.externalId,
            created_at: now,
            updated_at: now,
          },
        });

    this.cache.delete(this.getCacheKey(params.tenantId, params.processId));

    return {
      id: link.id,
      processId: link.process_id,
      mode: link.mode,
      provider: link.provider,
      externalId: link.external_id,
      lastSyncedAt: link.last_synced_at ? link.last_synced_at.toISOString() : null,
    };
  }

  async deleteTrackingLink(params: { tenantId: string; processId: string }) {
    await this.assertPremiumEnabled(params.tenantId);
    await this.assertProcessExists(params.tenantId, params.processId);

    await this.prisma.tracking_links.deleteMany({
      where: {
        tenant_id: params.tenantId,
        process_id: params.processId,
      },
    });

    this.cache.delete(this.getCacheKey(params.tenantId, params.processId));
    return { ok: true };
  }

  // Prepared for future cron scheduling.
  async refreshTrackedProcess(tenantId: string, processId: string): Promise<TrackingSnapshot> {
    return this.getTrackingSnapshot({ tenantId, processId, forceRefresh: true });
  }

  private async refreshLink(params: {
    tenantId: string;
    processId: string;
    link: {
      id: string;
      mode: tracking_mode_enum;
      provider: tracking_provider_enum;
      external_id: string;
      last_snapshot_json: Prisma.JsonValue | null;
      process_id: string;
    };
    allowFallback: boolean;
  }): Promise<TrackingSnapshot> {
    const providerName = params.link.provider as TrackingProviderName;
    const mode = params.link.mode as TrackingMode;
    const provider = this.resolveProvider(providerName);
    this.assertModeProviderCompatibility(mode, providerName);

    const config = await this.prisma.tracking_configs.findFirst({
      where: {
        tenant_id: params.tenantId,
        provider: params.link.provider,
        is_enabled: true,
      },
    });

    if (!config) {
      throw new BadRequestException('Tracking provider is not configured for this tenant.');
    }

    try {
      this.enforceProviderRateLimit(params.tenantId, providerName);
      const snapshot = await provider.fetchSnapshot({
        tenantId: params.tenantId,
        processId: params.processId,
        externalId: params.link.external_id,
        apiKey: config.api_key,
      });

      const normalized = this.normalizeSnapshot(snapshot, mode);

      await this.prisma.tracking_links.update({
        where: { id: params.link.id },
        data: {
          last_snapshot_json: normalized as unknown as Prisma.InputJsonValue,
          last_synced_at: new Date(),
          updated_at: new Date(),
        },
      });

      return normalized;
    } catch (error) {
      if (params.allowFallback && params.link.last_snapshot_json) {
        const fallback = this.normalizeSnapshot(params.link.last_snapshot_json as any, mode, {
          stale: true,
          fallbackReason: (error as Error).message,
        });
        this.logger.warn(
          `Tracking refresh fallback to stale snapshot for tenant=${params.tenantId} process=${params.processId} provider=${providerName}`,
        );
        return fallback;
      }

      if (error instanceof TrackingRateLimitException) {
        throw error;
      }

      throw new BadGatewayException('Failed to fetch tracking snapshot from provider.');
    }
  }

  private async assertPremiumEnabled(tenantId: string): Promise<void> {
    const enabled = await this.featureFlagsService.hasTrackingPremium(tenantId);
    if (!enabled) {
      throw new ForbiddenException('Tracking premium feature is not enabled for this tenant.');
    }
  }

  private async assertProcessExists(tenantId: string, processId: string): Promise<void> {
    const process = await this.prisma.processes.findFirst({
      where: { tenant_id: tenantId, id: processId },
      select: { id: true },
    });

    if (!process) {
      throw new NotFoundException('Process not found.');
    }
  }

  private assertModeProviderCompatibility(mode: TrackingMode, provider: TrackingProviderName): void {
    if (mode === 'AIR' && provider !== 'FR24') {
      throw new BadRequestException('AIR mode requires FR24 provider.');
    }
    if (mode === 'SEA' && provider !== 'MARINETRAFFIC') {
      throw new BadRequestException('SEA mode requires MARINETRAFFIC provider.');
    }
  }

  private resolveProvider(provider: TrackingProviderName): TrackingProvider {
    const resolved = this.providers.get(provider);
    if (!resolved) {
      throw new BadRequestException(`Tracking provider ${provider} is not available.`);
    }
    return resolved;
  }

  private enforceProviderRateLimit(tenantId: string, provider: TrackingProviderName): void {
    const key = `${tenantId}:${provider}`;
    const now = Date.now();
    const last = this.providerLastHit.get(key) ?? 0;
    if (now - last < this.providerMinIntervalMs) {
      throw new TrackingRateLimitException('Tracking provider rate limit reached. Try again shortly.');
    }
    this.providerLastHit.set(key, now);
  }

  private normalizeSnapshot(
    snapshot: Partial<TrackingSnapshot> | Record<string, any>,
    fallbackMode: TrackingMode,
    extraMeta?: Record<string, unknown>,
  ): TrackingSnapshot {
    const allowedStatuses = new Set<TrackingStatus>(['UNKNOWN', 'IN_TRANSIT', 'ARRIVED', 'DELAYED', 'CANCELLED']);
    const normalizedStatus = String(snapshot?.status ?? 'UNKNOWN').toUpperCase() as TrackingStatus;
    const mode = String(snapshot?.mode ?? fallbackMode).toUpperCase() as TrackingMode;

    const toPoint = (input: any) => {
      if (!input || typeof input !== 'object') return undefined;
      const lat = Number(input.lat);
      const lon = Number(input.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;

      const point = {
        lat,
        lon,
        timestamp: this.toIsoTimestamp(input.timestamp),
        source: input.source === 'MT' ? 'MT' : 'FR24',
      } as any;

      if (Number.isFinite(Number(input.speedKts))) point.speedKts = Number(input.speedKts);
      if (Number.isFinite(Number(input.altitudeFt))) point.altitudeFt = Number(input.altitudeFt);
      if (Number.isFinite(Number(input.headingDeg))) point.headingDeg = Number(input.headingDeg);
      return point;
    };

    const route = Array.isArray(snapshot?.route)
      ? snapshot.route.map((item) => toPoint(item)).filter((item): item is NonNullable<typeof item> => !!item)
      : undefined;

    const current = toPoint(snapshot?.current) ?? route?.[route.length - 1];
    const eta = snapshot?.eta ? this.toIsoTimestamp(snapshot.eta) : undefined;
    const outputMode: TrackingMode = mode === 'SEA' ? 'SEA' : 'AIR';

    return {
      mode: outputMode,
      status: allowedStatuses.has(normalizedStatus) ? normalizedStatus : 'UNKNOWN',
      current,
      route: route && route.length > 0 ? route : undefined,
      eta,
      meta: {
        ...(typeof snapshot?.meta === 'object' && snapshot?.meta ? (snapshot.meta as Record<string, unknown>) : {}),
        ...(extraMeta ?? {}),
      },
    };
  }

  private toIsoTimestamp(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'number') {
      const millis = value > 1_000_000_000_000 ? value : value * 1000;
      const date = new Date(millis);
      return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
    }

    const text = String(value ?? '').trim();
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
    return parsed.toISOString();
  }

  private getCacheKey(tenantId: string, processId: string): string {
    return `${tenantId}:${processId}`;
  }
}
