import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateAreaEntityConfigDto } from './dto/update-area-entity-config.dto';
import {
  MODULE_AREA_KEYS,
  ModuleAreaKey,
  defaultModuleAreaLabel,
  inferEntityModuleArea,
  isEntityAllowedByModuleAreas,
  normalizeModuleAreaKey,
  resolveEntityModuleArea,
} from './module-areas';

type BillingAreaEntityConfigArea = {
  id: ModuleAreaKey;
  label: string;
  order: number;
  entities: string[];
};

type BillingAreaEntityConfigJson = {
  areas: BillingAreaEntityConfigArea[];
};

type BillingAreaEntityConfigResponse = {
  config_json: BillingAreaEntityConfigJson;
  updated_at: string | null;
};

type BillingAreaEntityOption = {
  name: string;
  label: string;
  area: ModuleAreaKey | null;
  source: 'CONFIG' | 'DEFAULT' | 'UNASSIGNED';
};

type CacheEntry = {
  expires_at: number;
  updated_at: string | null;
  config: BillingAreaEntityConfigJson;
  entity_area_map: Map<string, ModuleAreaKey>;
};

type RawConfigRow = {
  config_json: unknown;
  updated_at: Date | string | null;
};

type RawEntityRow = {
  table_name: string;
};

@Injectable()
export class BillingAreaEntityConfigService {
  private readonly configKey = 'default';
  private readonly cacheTtlMs = this.resolveCacheTtlMs();
  private cache: CacheEntry | null = null;

  private readonly excludedEntities = new Set<string>([
    'automations',
    'automation_executions',
    'migrations',
    'sessions',
    'password_resets',
    'notification_reads',
    'user_default_views',
    'tenant_module_overrides',
    'plan_modules',
    'tenant_menu_config',
    'tenant_theme_settings',
    'option_sets',
    'option_set_options',
    'email_integrations',
    'admin_audit_log',
    'billing_area_entity_config',
  ]);

  constructor(private readonly prisma: PrismaService) {}

  async getConfig(): Promise<BillingAreaEntityConfigResponse> {
    const cached = await this.getCachedConfig();
    return {
      config_json: this.cloneConfig(cached.config),
      updated_at: cached.updated_at,
    };
  }

  async updateConfig(dto: UpdateAreaEntityConfigDto): Promise<BillingAreaEntityConfigResponse> {
    const normalized = this.normalizeConfig(dto?.areas);
    const updatedAt = await this.persistConfig(normalized);
    this.invalidateCache();

    return {
      config_json: this.cloneConfig(normalized),
      updated_at: updatedAt,
    };
  }

  async listAvailableEntities(): Promise<BillingAreaEntityOption[]> {
    const [entityNames, entityAreaMap] = await Promise.all([
      this.listTenantEntities(),
      this.getEntityAreaMapSnapshot(),
    ]);

    return entityNames.map((entityName) => {
      const explicitArea = normalizeModuleAreaKey(entityAreaMap.get(entityName));
      const fallbackArea = explicitArea || inferEntityModuleArea(entityName);
      return {
        name: entityName,
        label: this.toPtBrLabel(entityName),
        area: fallbackArea,
        source: explicitArea ? 'CONFIG' : fallbackArea ? 'DEFAULT' : 'UNASSIGNED',
      };
    });
  }

  async getEntityAreaMapSnapshot(): Promise<Map<string, ModuleAreaKey>> {
    const cached = await this.getCachedConfig();
    return new Map<string, ModuleAreaKey>(cached.entity_area_map);
  }

  isEntityAllowedWithMap(
    entityName: string,
    enabledAreas: Set<string>,
    entityAreaMap?: Map<string, ModuleAreaKey> | Record<string, string> | null,
  ): boolean {
    return isEntityAllowedByModuleAreas(entityName, enabledAreas, entityAreaMap);
  }

  resolveEntityArea(
    entityName: string,
    entityAreaMap?: Map<string, ModuleAreaKey> | Record<string, string> | null,
  ): ModuleAreaKey | null {
    return resolveEntityModuleArea(entityName, entityAreaMap);
  }

  private resolveCacheTtlMs(): number {
    const raw = Number(process.env.BILLING_AREA_CONFIG_CACHE_TTL_MS ?? 120000);
    if (!Number.isFinite(raw) || raw <= 0) return 120000;
    return Math.trunc(raw);
  }

  private invalidateCache(): void {
    this.cache = null;
  }

  private async getCachedConfig(forceRefresh = false): Promise<CacheEntry> {
    const now = Date.now();
    if (!forceRefresh && this.cache && this.cache.expires_at > now) {
      return this.cache;
    }

    const loaded = await this.loadConfigFromDatabase();
    const entityAreaMap = this.buildEntityAreaMap(loaded.config);

    const cacheEntry: CacheEntry = {
      expires_at: now + this.cacheTtlMs,
      updated_at: loaded.updated_at,
      config: loaded.config,
      entity_area_map: entityAreaMap,
    };
    this.cache = cacheEntry;
    return cacheEntry;
  }

  private async loadConfigFromDatabase(): Promise<{
    config: BillingAreaEntityConfigJson;
    updated_at: string | null;
  }> {
    const rows = await this.prisma.raw.$queryRaw<RawConfigRow[]>(Prisma.sql`
      SELECT config_json, updated_at
      FROM billing_area_entity_config
      WHERE config_key = ${this.configKey}
      ORDER BY updated_at DESC
      LIMIT 1
    `);

    const row = rows[0];
    if (row) {
      const configJson =
        row?.config_json && typeof row.config_json === 'object' ? (row.config_json as any) : {};

      const normalized = this.normalizeConfig(configJson?.areas);
      return {
        config: normalized,
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      };
    }

    const defaults = await this.buildDefaultConfig();
    const updatedAt = await this.persistConfig(defaults);
    return {
      config: defaults,
      updated_at: updatedAt,
    };
  }

  private async persistConfig(config: BillingAreaEntityConfigJson): Promise<string> {
    const payload = JSON.stringify(config);
    const rows = await this.prisma.raw.$queryRaw<Array<{ updated_at: Date | string }>>(Prisma.sql`
      INSERT INTO billing_area_entity_config (config_key, config_json, created_at, updated_at)
      VALUES (${this.configKey}, ${payload}::jsonb, now(), now())
      ON CONFLICT (config_key)
      DO UPDATE
      SET config_json = EXCLUDED.config_json,
          updated_at = now()
      RETURNING updated_at
    `);

    const updatedAt = rows[0]?.updated_at;
    return updatedAt ? new Date(updatedAt).toISOString() : new Date().toISOString();
  }

  private async buildDefaultConfig(): Promise<BillingAreaEntityConfigJson> {
    const entities = await this.listTenantEntities();
    const byArea = new Map<ModuleAreaKey, string[]>();
    MODULE_AREA_KEYS.forEach((area) => byArea.set(area, []));

    entities.forEach((entityName) => {
      const inferred = inferEntityModuleArea(entityName);
      if (!inferred) return;
      const list = byArea.get(inferred);
      if (!list) return;
      if (!list.includes(entityName)) list.push(entityName);
    });

    const areas = MODULE_AREA_KEYS.map((area, idx) => ({
      id: area,
      label: defaultModuleAreaLabel(area),
      order: (idx + 1) * 10,
      entities: (byArea.get(area) || []).sort((a, b) => a.localeCompare(b)),
    }));

    return { areas };
  }

  private normalizeConfig(inputAreas: unknown): BillingAreaEntityConfigJson {
    const sourceAreas = Array.isArray(inputAreas) ? inputAreas : [];
    const sourceById = new Map<ModuleAreaKey, any>();

    sourceAreas.forEach((row) => {
      const normalizedId = normalizeModuleAreaKey(row?.id);
      if (!normalizedId) return;
      sourceById.set(normalizedId, row);
    });

    const seenEntities = new Set<string>();

    const areas = MODULE_AREA_KEYS.map((area, idx) => {
      const source = sourceById.get(area);
      const rawEntities = Array.isArray(source?.entities) ? source.entities : [];

      const entities = rawEntities
        .map((entity) => this.normalizeEntityName(entity))
        .filter((entity): entity is string => !!entity)
        .filter((entity) => !this.excludedEntities.has(entity))
        .filter((entity) => {
          if (seenEntities.has(entity)) return false;
          seenEntities.add(entity);
          return true;
        });

      const rawOrder = Number(source?.order);
      const order = Number.isFinite(rawOrder) ? Math.max(0, Math.trunc(rawOrder)) : (idx + 1) * 10;

      return {
        id: area,
        label: this.normalizeAreaLabel(source?.label, area),
        order,
        entities,
      } satisfies BillingAreaEntityConfigArea;
    }).sort((a, b) => a.order - b.order);

    return { areas };
  }

  private normalizeAreaLabel(value: unknown, area: ModuleAreaKey): string {
    const raw = String(value ?? '').trim();
    if (!raw) return defaultModuleAreaLabel(area);
    return raw.slice(0, 80);
  }

  private normalizeEntityName(value: unknown): string | null {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) return null;
    if (!/^[a-z_][a-z0-9_]*$/.test(normalized)) return null;
    return normalized;
  }

  private buildEntityAreaMap(config: BillingAreaEntityConfigJson): Map<string, ModuleAreaKey> {
    const out = new Map<string, ModuleAreaKey>();

    (config?.areas || []).forEach((area) => {
      const areaId = normalizeModuleAreaKey(area?.id);
      if (!areaId) return;

      const entities = Array.isArray(area?.entities) ? area.entities : [];
      entities.forEach((entityName) => {
        const normalizedEntity = this.normalizeEntityName(entityName);
        if (!normalizedEntity) return;
        if (!out.has(normalizedEntity)) out.set(normalizedEntity, areaId);
      });
    });

    return out;
  }

  private cloneConfig(config: BillingAreaEntityConfigJson): BillingAreaEntityConfigJson {
    return {
      areas: (config?.areas || []).map((area) => ({
        id: area.id,
        label: area.label,
        order: area.order,
        entities: Array.isArray(area.entities) ? [...area.entities] : [],
      })),
    };
  }

  private async listTenantEntities(): Promise<string[]> {
    const rows = await this.prisma.raw.$queryRaw<RawEntityRow[]>(Prisma.sql`
      SELECT c.table_name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
      GROUP BY c.table_name
      HAVING SUM(CASE WHEN c.column_name = 'tenant_id' THEN 1 ELSE 0 END) > 0
         AND SUM(CASE WHEN c.column_name = 'id' THEN 1 ELSE 0 END) > 0
      ORDER BY c.table_name ASC
    `);

    return rows
      .map((row) => String(row.table_name || '').trim().toLowerCase())
      .filter((name) => !!name)
      .filter((name) => !this.excludedEntities.has(name));
  }

  private toPtBrLabel(value: string): string {
    return String(value || '')
      .split('_')
      .filter((part) => !!part)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
