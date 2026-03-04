import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import OpenAI from 'openai';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingAreaEntityConfigService } from '../billing-plans/billing-area-entity-config.service';
import { ModuleAreaKey } from '../billing-plans/module-areas';
import { TenantModulesResolverService } from '../billing-plans/tenant-modules-resolver.service';
import {
  CreateEmailIntegrationDto,
  GenerateLandingPageAiDto,
  PutLandingPageContentDto,
  PutLandingPageSettingsDto,
  CreateOptionSetDto,
  CreateOptionSetOptionDto,
  PutMenuConfigDto,
  PutThemeSettingsDto,
  TestEmailIntegrationDto,
  ToggleEmailIntegrationDto,
  ToggleOptionActiveDto,
  UpdateEmailIntegrationDto,
  UpdateOptionSetOptionDto,
} from './dto/admin-config.dto';
import { ENTITY_REGISTRY, getEntityRegistryItem } from './entity-registry';

type AuthUser = {
  id: string;
  tenant_id: string;
  role?: string;
};

type ThemeSettings = {
  primary_color: string;
  nav_bg_color: string;
  nav_text_color: string;
  topbar_bg_color: string;
  layout_mode: 'LIGHT' | 'DARK';
  logo_url: string | null;
  favicon_url: string | null;
};

type LandingPageSettings = {
  landing_page_url: string | null;
  draft_html: string | null;
  draft_css: string | null;
  draft_project_json: Record<string, any> | null;
  published_html: string | null;
  published_css: string | null;
  published_project_json: Record<string, any> | null;
  updated_at: Date | null;
  published_at: Date | null;
};

type OptionSetSeedRow = {
  value: string;
  label: string;
  color: string | null;
  sort_order: number;
  is_active: boolean;
};

type OptionSetLookupBridgeConfig = {
  codeMaxLength: number;
  labelMaxLength: number;
};

@Injectable()
export class AdminConfigService {
  private readonly optionSetCache = new Map<string, any>();
  private readonly menuConfigVersion = 2;
  private readonly moduleAreaIds: ModuleAreaKey[] = ['service', 'sales', 'finance', 'hr', 'po'];
  private readonly defaultAreaLabels: Record<string, string> = {
    home: 'Home',
    service: 'Servicos',
    sales: 'Sales',
    finance: 'Financeiro',
    hr: 'RH',
    po: 'Project & Operations',
    settings: 'Configuracoes',
  };
  private readonly fixedHomeEntities = new Set<string>(['ai_hub']);
  private readonly defaultSettingsEntities = ['settings_center', 'status_configs', 'notifications'];
  private readonly fixedSettingsEntities = new Set<string>(['settings_center']);
  private readonly fixedAreaIds = new Set<string>(['service', 'sales', 'finance', 'hr', 'po', 'settings']);
  private readonly reservedAreaAliases = new Set<string>([
    'service',
    'services',
    'servico',
    'servicos',
    'sales',
    'vendas',
    'comercial',
    'finance',
    'financeiro',
    'financial',
    'hr',
    'rh',
    'po',
    'projectoperations',
    'project_operations',
    'project-and-operations',
    'settings',
    'configuracoes',
    'configuracao',
    'config',
  ]);
  private readonly hiddenLegacyAreaIds = new Set<string>([
    'cadastro',
    'cadastros',
    'operacao',
    'operacoes',
    'operation',
    'operations',
  ]);

  private readonly defaultTheme: ThemeSettings = {
    primary_color: '#1ab394',
    nav_bg_color: '#2f4050',
    nav_text_color: '#a7b1c2',
    topbar_bg_color: '#ffffff',
    layout_mode: 'LIGHT',
    logo_url: null,
    favicon_url: null,
  };
  private readonly optionSetLookupBridges = new Map<string, OptionSetLookupBridgeConfig>([
    ['hr_employees::employment_status_id', { codeMaxLength: 40, labelMaxLength: 120 }],
    ['hr_employees::marital_status_id', { codeMaxLength: 40, labelMaxLength: 120 }],
    ['hr_employees::document_type_id', { codeMaxLength: 40, labelMaxLength: 120 }],
  ]);
  private readonly landingAiModel: string;
  private readonly landingAiClient: OpenAI | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantModulesResolverService: TenantModulesResolverService,
    private readonly billingAreaEntityConfigService: BillingAreaEntityConfigService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.normalizeText(this.configService.get<string>('OPENAI_API_KEY'));
    this.landingAiModel = this.normalizeText(this.configService.get<string>('OPENAI_MODEL_LANDING')) || 'gpt-5-mini';
    this.landingAiClient = apiKey ? new OpenAI({ apiKey }) : null;
  }

  private get db(): any {
    return this.prisma.raw;
  }

  private getRole(user: AuthUser): string {
    return String(user?.role || '').trim().toUpperCase();
  }

  private assertAdmin(user: AuthUser): void {
    if (this.getRole(user) !== 'ADMIN') {
      throw new ForbiddenException('Somente usuarios ADMIN podem alterar configuracoes.');
    }
  }

  private toInt(value: unknown, fallback = 0): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.trunc(n);
  }

  private toBool(value: unknown, fallback = true): boolean {
    if (typeof value === 'boolean') return value;
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return fallback;
    if (['1', 'true', 'yes', 'y', 'sim', 's'].includes(raw)) return true;
    if (['0', 'false', 'no', 'n', 'nao'].includes(raw)) return false;
    return fallback;
  }

  private normalizeText(value: unknown): string {
    return String(value ?? '').trim();
  }

  private slugify(value: unknown, fallback = 'area'): string {
    const normalized = String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();

    return normalized || fallback;
  }

  private normalizeColor(value: unknown, fallback: string): string {
    const raw = this.normalizeText(value);
    if (!raw) return fallback;
    if (!/^#[0-9a-fA-F]{6}$/.test(raw)) {
      throw new BadRequestException(`Cor invalida: ${raw}. Use formato #RRGGBB.`);
    }
    return raw.toUpperCase();
  }

  private normalizeUrl(value: unknown): string | null {
    const raw = this.normalizeText(value);
    if (!raw) return null;
    if (raw.length > 500) throw new BadRequestException('URL muito grande.');
    return raw;
  }

  private maskSecret(value: unknown): string | null {
    const raw = this.normalizeText(value);
    if (!raw) return null;
    return '****';
  }

  private toJson(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (value === undefined) return undefined;
    if (value === null) return Prisma.JsonNull;
    return value as Prisma.InputJsonValue;
  }

  private async audit(
    user: AuthUser,
    action: string,
    entity: string,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    try {
      await this.db.admin_audit_log.create({
        data: {
          tenant_id: user.tenant_id,
          user_id: user.id,
          action,
          entity,
          before_json: this.toJson(before),
          after_json: this.toJson(after),
        },
      });
    } catch (error) {
      console.error('[AdminConfig] Failed to write audit log:', error);
    }
  }

  private async getEnabledAreaSet(tenantId: string): Promise<Set<string>> {
    const areas = await this.tenantModulesResolverService.getEnabledAreas(tenantId);
    return new Set((areas || []).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean));
  }

  private isEntityAllowedForAreaSet(
    entity: string,
    enabledAreaSet: Set<string>,
    entityAreaMap?: Map<string, ModuleAreaKey> | null,
  ): boolean {
    return this.billingAreaEntityConfigService.isEntityAllowedWithMap(entity, enabledAreaSet, entityAreaMap);
  }

  async listMetadataEntities(user: AuthUser) {
    const [enabledAreaSet, entityAreaMap] = await Promise.all([
      this.getEnabledAreaSet(user.tenant_id),
      this.billingAreaEntityConfigService.getEntityAreaMapSnapshot(),
    ]);
    return ENTITY_REGISTRY.filter((item) =>
      this.isEntityAllowedForAreaSet(item.entity, enabledAreaSet, entityAreaMap),
    );
  }

  private defaultAreaLabel(areaId: string): string {
    return this.defaultAreaLabels[areaId] || areaId;
  }

  private shouldIncludeMenuEntity(
    entity: string,
    enabledAreaSet: Set<string>,
    entityAreaMap?: Map<string, ModuleAreaKey> | null,
  ): boolean {
    if (this.fixedHomeEntities.has(entity) || this.fixedSettingsEntities.has(entity)) return true;
    return this.isEntityAllowedForAreaSet(entity, enabledAreaSet, entityAreaMap);
  }

  private buildDefaultAreaItems(
    areaId: string,
    enabledAreaSet: Set<string>,
    entityAreaMap?: Map<string, ModuleAreaKey> | null,
  ): Array<{ entity: string; label: string; icon: string; route: string; order: number }> {
    const targetArea = this.normalizeText(areaId).toLowerCase();
    const seen = new Set<string>();
    const orderedEntities: string[] = [];

    const add = (entity: string) => {
      const normalized = this.normalizeText(entity).toLowerCase();
      if (!normalized || normalized === 'users') return;
      if (seen.has(normalized)) return;
      const meta = getEntityRegistryItem(normalized);
      if (!meta) return;
      if (!this.shouldIncludeMenuEntity(meta.entity, enabledAreaSet, entityAreaMap)) return;
      seen.add(meta.entity);
      orderedEntities.push(meta.entity);
    };

    if (targetArea === 'home') {
      this.fixedHomeEntities.forEach((entity) => add(entity));
      ENTITY_REGISTRY.forEach((item) => add(item.entity));
    } else if (targetArea === 'settings') {
      this.defaultSettingsEntities.forEach((entity) => add(entity));
    } else {
      ENTITY_REGISTRY.forEach((item) => {
        const resolved = this.billingAreaEntityConfigService.resolveEntityArea(item.entity, entityAreaMap);
        if (resolved !== targetArea) return;
        add(item.entity);
      });
    }

    return orderedEntities.map((entity, idx) => {
      const meta = getEntityRegistryItem(entity)!;
      return {
        entity: meta.entity,
        label: meta.label,
        icon: meta.icon,
        route: meta.route,
        order: (idx + 1) * 10,
      };
    });
  }

  private buildDefaultMenuConfig(
    enabledAreaSet?: Set<string>,
    entityAreaMap?: Map<string, ModuleAreaKey> | null,
  ): Record<string, any> {
    const areaSet = enabledAreaSet || new Set(this.moduleAreaIds);
    const areas: Array<{ id: string; label: string; order: number; items: any[] }> = [];

    areas.push({
      id: 'home',
      label: 'Home',
      order: 10,
      items: this.buildDefaultAreaItems('home', areaSet, entityAreaMap),
    });

    this.moduleAreaIds.forEach((areaId) => {
      if (!areaSet.has(areaId)) return;
      areas.push({
        id: areaId,
        label: this.defaultAreaLabel(areaId),
        order: (areas.length + 1) * 10,
        items: this.buildDefaultAreaItems(areaId, areaSet, entityAreaMap),
      });
    });

    areas.push({
      id: 'settings',
      label: this.defaultAreaLabel('settings'),
      order: (areas.length + 1) * 10,
      items: this.buildDefaultAreaItems('settings', areaSet, entityAreaMap),
    });

    return {
      config_version: this.menuConfigVersion,
      default_area: 'home',
      areas,
    };
  }

  private isReservedAreaId(areaId: string): boolean {
    const normalized = this.slugify(areaId);
    return this.fixedAreaIds.has(normalized) || this.reservedAreaAliases.has(normalized);
  }

  private async normalizeMenuConfig(
    user: AuthUser,
    rawConfig: any,
    strict: boolean,
  ): Promise<Record<string, any>> {
    const source = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
    const rawAreas = Array.isArray(source.areas) ? source.areas : [];
    const sourceVersion = this.toInt((source as any)?.config_version, 0);
    const shouldBootstrapHomeDefaults = !strict && sourceVersion < this.menuConfigVersion;
    const [enabledAreaSet, entityAreaMap] = await Promise.all([
      this.getEnabledAreaSet(user.tenant_id),
      this.billingAreaEntityConfigService.getEntityAreaMapSnapshot(),
    ]);
    const seenAreaIds = new Set<string>();
    const migrateToHomeRawItems: any[] = [];

    const normalizeItems = (rawItems: any[]) =>
      rawItems
        .map((item: any, itemIndex: number) => {
          const entity = this.normalizeText(item?.entity);
          const meta = getEntityRegistryItem(entity);
          if (!meta) {
            if (strict) throw new BadRequestException(`Entidade invalida no menu: ${entity || '(vazio)'}`);
            return null;
          }
          if (!this.isEntityAllowedForAreaSet(meta.entity, enabledAreaSet, entityAreaMap)) {
            if (strict) {
              throw new ForbiddenException(`Entidade ${meta.entity} nao habilitada para os modulos do tenant.`);
            }
            return null;
          }

          return {
            entity: meta.entity,
            label: this.normalizeText(item?.label) || meta.label,
            icon: this.normalizeText(item?.icon) || meta.icon,
            route: this.normalizeText(item?.route) || meta.route,
            order: this.toInt(item?.order, (itemIndex + 1) * 10),
          };
        })
        .filter((item): item is { entity: string; label: string; icon: string; route: string; order: number } => !!item)
        .sort((a, b) => a.order - b.order)
        .map((item, itemIndex) => ({ ...item, order: (itemIndex + 1) * 10 }));

    const areas = rawAreas
      .map((area: any, areaIndex: number) => {
        const areaLabel = this.normalizeText(area?.label) || `Area ${areaIndex + 1}`;
        const areaId = this.slugify(area?.id || areaLabel, `area_${areaIndex + 1}`);
        const areaOrder = this.toInt(area?.order, (areaIndex + 1) * 10);
        const isHome = areaId === 'home';
        const rawItems = Array.isArray(area?.items) ? area.items : [];

        if (!isHome && this.hiddenLegacyAreaIds.has(areaId)) {
          migrateToHomeRawItems.push(...rawItems);
          return null;
        }

        if (seenAreaIds.has(areaId)) {
          if (strict) throw new BadRequestException(`ID de area duplicado: ${areaId}.`);
          return null;
        }
        seenAreaIds.add(areaId);

        const items = normalizeItems(rawItems);

        return {
          id: areaId,
          label: isHome ? 'Home' : areaLabel,
          order: areaOrder,
          items,
        };
      })
      .filter((area): area is { id: string; label: string; order: number; items: any[] } => !!area)
      .sort((a, b) => a.order - b.order)
      .map((area, areaIndex) => ({ ...area, order: (areaIndex + 1) * 10 }));

    let homeArea = areas.find((area) => area.id === 'home');
    if (!homeArea) {
      homeArea = { id: 'home', label: 'Home', order: 0, items: [] };
      areas.unshift(homeArea);
    }

    if (migrateToHomeRawItems.length) {
      const usedEntities = new Set((homeArea.items || []).map((item) => String(item?.entity || '')));
      const migratedItems = normalizeItems(migrateToHomeRawItems).filter((item) => {
        if (usedEntities.has(item.entity)) return false;
        usedEntities.add(item.entity);
        return true;
      });
      homeArea.items = [...(homeArea.items || []), ...migratedItems]
        .sort((a, b) => a.order - b.order)
        .map((item, itemIndex) => ({ ...item, order: (itemIndex + 1) * 10 }));
    }

    if (!Array.isArray(homeArea.items) || !homeArea.items.length) {
      homeArea.items = this.buildDefaultAreaItems('home', enabledAreaSet, entityAreaMap);
    }

    if (shouldBootstrapHomeDefaults) {
      const baselineHomeItems = this.buildDefaultAreaItems('home', enabledAreaSet, entityAreaMap);

      const usedEntities = new Set((homeArea.items || []).map((item) => String(item?.entity || '')));
      const toAppend = baselineHomeItems.filter((item) => {
        if (usedEntities.has(item.entity)) return false;
        usedEntities.add(item.entity);
        return true;
      });

      if (toAppend.length) {
        homeArea.items = [...(homeArea.items || []), ...toAppend]
          .sort((a, b) => a.order - b.order)
          .map((item, itemIndex) => ({ ...item, order: (itemIndex + 1) * 10 }));
      }
    }

    const appendMissingItems = (
      area: { id: string; label: string; order: number; items: any[] },
      defaults: Array<{ entity: string; label: string; icon: string; route: string; order: number }>,
    ) => {
      const used = new Set((area.items || []).map((item) => String(item?.entity || '').trim().toLowerCase()));
      const toAppend = defaults.filter((item) => {
        const entity = String(item.entity || '').trim().toLowerCase();
        if (!entity || used.has(entity)) return false;
        used.add(entity);
        return true;
      });
      if (!toAppend.length) return;
      area.items = [...(area.items || []), ...toAppend]
        .sort((a, b) => a.order - b.order)
        .map((item, idx) => ({ ...item, order: (idx + 1) * 10 }));
    };

    const ensureArea = (
      areaId: string,
      label: string,
      defaults: Array<{ entity: string; label: string; icon: string; route: string; order: number }>,
    ) => {
      let area = areas.find((item) => item.id === areaId);
      if (!area) {
        area = {
          id: areaId,
          label: areaId === 'home' ? 'Home' : label,
          order: (areas.length + 1) * 10,
          items: defaults.map((item, idx) => ({ ...item, order: (idx + 1) * 10 })),
        };
        areas.push(area);
        return area;
      }
      if (!Array.isArray(area.items)) area.items = [];
      if (areaId === 'home') area.label = 'Home';
      if (!area.items.length && defaults.length) {
        area.items = defaults.map((item, idx) => ({ ...item, order: (idx + 1) * 10 }));
      } else {
        appendMissingItems(area, defaults);
      }
      if (areaId !== 'home' && !this.normalizeText(area.label)) area.label = label;
      return area;
    };

    const pinnedHomeDefaults = this.buildDefaultAreaItems('home', enabledAreaSet, entityAreaMap).filter((item) =>
      this.fixedHomeEntities.has(item.entity),
    );
    if (pinnedHomeDefaults.length) {
      const pinnedSet = new Set(pinnedHomeDefaults.map((item) => item.entity));
      const existing = Array.isArray(homeArea.items) ? homeArea.items.slice() : [];
      const map = new Map(existing.map((item) => [String(item?.entity || ''), item]));
      const pinnedItems = pinnedHomeDefaults.map((item) => map.get(item.entity) || item);
      const rest = existing.filter((item) => !pinnedSet.has(String(item?.entity || '')));
      homeArea.items = [...pinnedItems, ...rest].map((item, idx) => ({ ...item, order: (idx + 1) * 10 }));
    }

    const settingsDefaults = this.buildDefaultAreaItems('settings', enabledAreaSet, entityAreaMap);
    ensureArea('settings', this.defaultAreaLabel('settings'), settingsDefaults);

    if (!strict) {
      this.moduleAreaIds
        .filter((areaId) => enabledAreaSet.has(areaId))
        .forEach((areaId) => {
          const defaults = this.buildDefaultAreaItems(areaId, enabledAreaSet, entityAreaMap);
          ensureArea(areaId, this.defaultAreaLabel(areaId), defaults);
        });
    }

    const normalizedAreas = areas
      .sort((a, b) => a.order - b.order)
      .map((area, areaIndex) => ({ ...area, order: (areaIndex + 1) * 10 }));

    if (!normalizedAreas.length) return this.buildDefaultMenuConfig(enabledAreaSet, entityAreaMap);
    const allowedAreaIds = new Set(normalizedAreas.map((area) => String(area.id || '').trim().toLowerCase()));
    let defaultArea = this.slugify((source as any)?.default_area || 'home', 'home');
    if (!allowedAreaIds.has(defaultArea)) defaultArea = 'home';
    return { config_version: this.menuConfigVersion, default_area: defaultArea, areas: normalizedAreas };
  }

  async getMenu(user: AuthUser) {
    const row = await this.db.tenant_menu_config.findFirst({
      where: { tenant_id: user.tenant_id },
    });

    const config_json = await this.normalizeMenuConfig(user, row?.config_json || {}, false);
    return {
      config_json,
      updated_at: row?.updated_at || null,
    };
  }

  async updateMenu(user: AuthUser, dto: PutMenuConfigDto) {
    this.assertAdmin(user);

    const current = await this.db.tenant_menu_config.findFirst({
      where: { tenant_id: user.tenant_id },
    });

    const normalized = await this.normalizeMenuConfig(user, dto?.config_json || {}, true);

    const saved = await this.db.tenant_menu_config.upsert({
      where: { tenant_id: user.tenant_id },
      update: {
        config_json: normalized,
        updated_at: new Date(),
      },
      create: {
        tenant_id: user.tenant_id,
        config_json: normalized,
      },
    });

    await this.audit(user, 'MENU_UPDATED', 'tenant_menu_config', current?.config_json || null, saved.config_json || null);

    return {
      config_json: await this.normalizeMenuConfig(user, saved.config_json, false),
      updated_at: saved.updated_at,
    };
  }

  private normalizeThemeInput(input: Partial<PutThemeSettingsDto>): ThemeSettings {
    const payload = input || {};
    const layoutMode = this.normalizeText(payload.layout_mode).toUpperCase();

    return {
      primary_color: this.normalizeColor(payload.primary_color, this.defaultTheme.primary_color),
      nav_bg_color: this.normalizeColor(payload.nav_bg_color, this.defaultTheme.nav_bg_color),
      nav_text_color: this.normalizeColor(payload.nav_text_color, this.defaultTheme.nav_text_color),
      topbar_bg_color: this.normalizeColor(payload.topbar_bg_color, this.defaultTheme.topbar_bg_color),
      layout_mode: layoutMode === 'DARK' ? 'DARK' : 'LIGHT',
      logo_url: this.normalizeUrl(payload.logo_url),
      favicon_url: this.normalizeUrl(payload.favicon_url),
    };
  }

  async getTheme(user: AuthUser) {
    const row = await this.db.tenant_theme_settings.findFirst({
      where: { tenant_id: user.tenant_id },
    });

    if (!row) return this.defaultTheme;

    return {
      primary_color: this.normalizeColor(row.primary_color, this.defaultTheme.primary_color),
      nav_bg_color: this.normalizeColor(row.nav_bg_color, this.defaultTheme.nav_bg_color),
      nav_text_color: this.normalizeColor(row.nav_text_color, this.defaultTheme.nav_text_color),
      topbar_bg_color: this.normalizeColor(row.topbar_bg_color, this.defaultTheme.topbar_bg_color),
      layout_mode: String(row.layout_mode || 'LIGHT').toUpperCase() === 'DARK' ? 'DARK' : 'LIGHT',
      logo_url: this.normalizeUrl(row.logo_url),
      favicon_url: this.normalizeUrl(row.favicon_url),
    } satisfies ThemeSettings;
  }

  async updateTheme(user: AuthUser, dto: PutThemeSettingsDto) {
    this.assertAdmin(user);

    const current = await this.db.tenant_theme_settings.findFirst({
      where: { tenant_id: user.tenant_id },
    });

    const normalized = this.normalizeThemeInput(dto || {});

    const saved = await this.db.tenant_theme_settings.upsert({
      where: { tenant_id: user.tenant_id },
      update: {
        ...normalized,
        updated_at: new Date(),
      },
      create: {
        tenant_id: user.tenant_id,
        ...normalized,
      },
    });

    await this.audit(user, 'THEME_UPDATED', 'tenant_theme_settings', current || null, saved || null);

    return this.getTheme(user);
  }

  private normalizeLandingPageMarkupField(value: unknown, fieldName: string, maxLength = 12 * 1024 * 1024): string | null {
    if (value === undefined || value === null) return null;
    const raw = String(value);
    if (!raw.trim()) return null;
    if (raw.length > maxLength) {
      throw new BadRequestException(`${fieldName} excede o limite de ${maxLength} caracteres.`);
    }
    return raw;
  }

  private normalizeLandingPageProjectJson(value: unknown): Record<string, any> | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('project_json invalido. Envie um objeto JSON.');
    }
    const serialized = JSON.stringify(value);
    if (serialized.length > 12 * 1024 * 1024) {
      throw new BadRequestException('project_json excede o limite de 12MB.');
    }
    return value as Record<string, any>;
  }

  private normalizeLandingPageRecord(row: any): LandingPageSettings {
    const draftProject =
      row?.draft_project_json && typeof row.draft_project_json === 'object' && !Array.isArray(row.draft_project_json)
        ? (row.draft_project_json as Record<string, any>)
        : null;
    const publishedProject =
      row?.published_project_json &&
      typeof row.published_project_json === 'object' &&
      !Array.isArray(row.published_project_json)
        ? (row.published_project_json as Record<string, any>)
        : null;

    return {
      landing_page_url: this.normalizeUrl(row?.landing_page_url),
      draft_html: this.normalizeLandingPageMarkupField(row?.draft_html, 'draft_html'),
      draft_css: this.normalizeLandingPageMarkupField(row?.draft_css, 'draft_css'),
      draft_project_json: draftProject,
      published_html: this.normalizeLandingPageMarkupField(row?.published_html, 'published_html'),
      published_css: this.normalizeLandingPageMarkupField(row?.published_css, 'published_css'),
      published_project_json: publishedProject,
      updated_at: row?.updated_at || null,
      published_at: row?.published_at || null,
    };
  }

  private emptyLandingPageSettings(): LandingPageSettings {
    return {
      landing_page_url: null,
      draft_html: null,
      draft_css: null,
      draft_project_json: null,
      published_html: null,
      published_css: null,
      published_project_json: null,
      updated_at: null,
      published_at: null,
    };
  }

  async getLandingPage(user: AuthUser) {
    this.assertAdmin(user);

    const row = await this.db.tenant_landing_page_settings.findFirst({
      where: { tenant_id: user.tenant_id },
    });

    if (!row) return this.emptyLandingPageSettings();
    return this.normalizeLandingPageRecord(row);
  }

  async updateLandingPageSettings(user: AuthUser, dto: PutLandingPageSettingsDto) {
    this.assertAdmin(user);

    const current = await this.db.tenant_landing_page_settings.findFirst({
      where: { tenant_id: user.tenant_id },
    });

    const landingPageUrl = this.normalizeUrl(dto?.landing_page_url);
    const saved = await this.db.tenant_landing_page_settings.upsert({
      where: { tenant_id: user.tenant_id },
      update: {
        landing_page_url: landingPageUrl,
        updated_at: new Date(),
      },
      create: {
        tenant_id: user.tenant_id,
        landing_page_url: landingPageUrl,
      },
    });

    await this.audit(
      user,
      'LANDING_PAGE_SETTINGS_UPDATED',
      'tenant_landing_page_settings',
      current || null,
      saved || null,
    );

    return this.normalizeLandingPageRecord(saved);
  }

  private async upsertLandingPageContent(
    user: AuthUser,
    dto: PutLandingPageContentDto,
    action: 'LANDING_PAGE_CONTENT_SAVED' | 'LANDING_PAGE_PUBLISHED',
  ) {
    const current = await this.db.tenant_landing_page_settings.findFirst({
      where: { tenant_id: user.tenant_id },
    });

    const html =
      this.normalizeLandingPageMarkupField(dto?.html, 'html') ||
      this.normalizeLandingPageMarkupField(current?.draft_html, 'draft_html') ||
      this.normalizeLandingPageMarkupField(current?.published_html, 'published_html');
    if (!html) {
      throw new BadRequestException('html da landing page e obrigatorio.');
    }

    const css =
      this.normalizeLandingPageMarkupField(dto?.css, 'css') ||
      this.normalizeLandingPageMarkupField(current?.draft_css, 'draft_css') ||
      this.normalizeLandingPageMarkupField(current?.published_css, 'published_css') ||
      '';

    const draftProject =
      dto?.project_json === undefined
        ? this.normalizeLandingPageProjectJson(current?.draft_project_json)
        : this.normalizeLandingPageProjectJson(dto?.project_json);

    const now = new Date();
    const saved = await this.db.tenant_landing_page_settings.upsert({
      where: { tenant_id: user.tenant_id },
      update: {
        draft_html: html,
        draft_css: css,
        draft_project_json: draftProject,
        published_html: html,
        published_css: css,
        published_project_json: draftProject,
        published_at: now,
        updated_at: now,
      },
      create: {
        tenant_id: user.tenant_id,
        landing_page_url: this.normalizeUrl(current?.landing_page_url),
        draft_html: html,
        draft_css: css,
        draft_project_json: draftProject,
        published_html: html,
        published_css: css,
        published_project_json: draftProject,
        published_at: now,
      },
    });

    await this.audit(user, action, 'tenant_landing_page_settings', current || null, saved || null);
    return this.normalizeLandingPageRecord(saved);
  }

  async saveLandingPageContent(user: AuthUser, dto: PutLandingPageContentDto) {
    this.assertAdmin(user);
    return this.upsertLandingPageContent(user, dto, 'LANDING_PAGE_CONTENT_SAVED');
  }

  async publishLandingPage(user: AuthUser, dto: PutLandingPageContentDto) {
    this.assertAdmin(user);
    return this.upsertLandingPageContent(user, dto, 'LANDING_PAGE_PUBLISHED');
  }

  private getLandingAiClientOrThrow(): OpenAI {
    if (this.landingAiClient) return this.landingAiClient;
    throw new BadRequestException('IA nao configurada no backend (OPENAI_API_KEY ausente).');
  }

  private parseLandingAiJsonText(text: string): any {
    const normalized = String(text || '')
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    if (!normalized) {
      throw new BadRequestException('A IA nao retornou conteudo para a landing page.');
    }

    try {
      return JSON.parse(normalized);
    } catch {
      const firstBrace = normalized.indexOf('{');
      const lastBrace = normalized.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        const sliced = normalized.slice(firstBrace, lastBrace + 1);
        return JSON.parse(sliced);
      }
      const firstBracket = normalized.indexOf('[');
      const lastBracket = normalized.lastIndexOf(']');
      if (firstBracket >= 0 && lastBracket > firstBracket) {
        const sliced = normalized.slice(firstBracket, lastBracket + 1);
        return JSON.parse(sliced);
      }
      throw new BadRequestException('Resposta da IA nao esta em JSON valido.');
    }
  }

  private parseLandingAiResponse(response: any): any {
    if (response?.output_text && typeof response.output_text === 'string') {
      return this.parseLandingAiJsonText(response.output_text);
    }

    const segments: string[] = [];
    const outputs = Array.isArray(response?.output) ? response.output : [];
    for (const output of outputs) {
      const contentList = Array.isArray(output?.content) ? output.content : [];
      for (const content of contentList) {
        if (typeof content?.text === 'string') segments.push(content.text);
      }
    }

    if (!segments.length) {
      throw new BadRequestException('A IA nao retornou resposta para a landing page.');
    }

    return this.parseLandingAiJsonText(segments.join('\n'));
  }

  private normalizeLandingAiVersion(raw: any, fallbackIndex: number) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const extractedHtml = this.extractLandingBodyHtml(this.stripLandingScripts(String(source?.html || source?.body || '')));
    const normalizedHtml = this.normalizeLandingPageMarkupField(extractedHtml, 'html');
    if (!normalizedHtml) return null;

    const normalizedCss = this.normalizeLandingPageMarkupField(String(source?.css || ''), 'css') || '';
    const normalizedTitle =
      this.normalizeText(source?.title) ||
      this.normalizeText(source?.name) ||
      this.normalizeText(source?.label) ||
      `Versao ${fallbackIndex + 1}`;

    return {
      title: normalizedTitle,
      html: normalizedHtml,
      css: normalizedCss,
    };
  }

  private stripLandingScripts(html: string): string {
    return String(html || '')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gim, '')
      .trim();
  }

  private extractLandingBodyHtml(html: string): string {
    const raw = String(html || '').trim();
    if (!raw) return '';
    const bodyMatch = raw.match(/<body[^>]*>([\s\S]*)<\/body>/im);
    if (!bodyMatch?.[1]) return raw;
    return String(bodyMatch[1]).trim();
  }

  async generateLandingPageWithAi(user: AuthUser, dto: GenerateLandingPageAiDto) {
    this.assertAdmin(user);

    const prompt = this.normalizeText(dto?.prompt);
    if (!prompt) {
      throw new BadRequestException('Prompt da landing page e obrigatorio.');
    }

    const current = await this.db.tenant_landing_page_settings.findFirst({
      where: { tenant_id: user.tenant_id },
    });

    const referenceHtml =
      this.normalizeLandingPageMarkupField(current?.draft_html, 'draft_html') ||
      this.normalizeLandingPageMarkupField(current?.published_html, 'published_html') ||
      '';
    const landingUrl = this.normalizeUrl(current?.landing_page_url);

    const systemPrompt = [
      'Voce e um especialista em criacao de landing pages modernas e responsivas.',
      'Responda SOMENTE em JSON valido.',
      'Formato obrigatorio da resposta (EXATAMENTE 3 versoes):',
      '{',
      '  "versions": [',
      '    {',
      '      "title": "nome da versao 1",',
      '      "html": "markup HTML da landing (apenas conteudo do body, sem tags html/head/body)",',
      '      "css": "css complementar sem tag style"',
      '    },',
      '    { "title": "...", "html": "...", "css": "..." },',
      '    { "title": "...", "html": "...", "css": "..." }',
      '  ]',
      '}',
      'Regras:',
      '- nao incluir scripts, iframes, ou codigo malicioso',
      '- usar texto em pt-BR',
      '- incluir secoes com titulos, descricao e CTA',
      '- html pronto para renderizacao em pagina publica',
      '- css deve complementar o html sem reset global agressivo',
      '- as 3 versoes devem ter propostas visuais diferentes entre si',
    ].join('\n');

    const userPrompt = [
      `PROMPT_DO_USUARIO:\n${prompt}`,
      landingUrl ? `\nLANDING_PAGE_URL_CONFIGURADA:\n${landingUrl}` : '',
      referenceHtml
        ? `\nHTML_REFERENCIA_ATUAL (use apenas como contexto, pode melhorar):\n${referenceHtml.slice(0, 15000)}`
        : '',
    ].join('\n');

    const client = this.getLandingAiClientOrThrow();
    const response = await client.responses.create({
      model: this.landingAiModel,
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    } as any);

    const aiPayload = this.parseLandingAiResponse(response);
    const rawVersions = Array.isArray(aiPayload?.versions)
      ? aiPayload.versions
      : Array.isArray(aiPayload)
        ? aiPayload
        : [aiPayload];
    const versions = rawVersions
      .map((item: any, idx: number) => this.normalizeLandingAiVersion(item, idx))
      .filter((item): item is { title: string; html: string; css: string } => !!item)
      .slice(0, 3);
    if (!versions.length) {
      throw new BadRequestException('A IA nao retornou HTML valido para a landing page.');
    }
    while (versions.length < 3) {
      const base = versions[versions.length - 1] || versions[0];
      versions.push({
        title: `Versao ${versions.length + 1}`,
        html: base.html,
        css: base.css,
      });
    }
    const selectedVersion = versions[0];

    return {
      title: selectedVersion.title || null,
      html: selectedVersion.html,
      css: selectedVersion.css,
      versions,
      selected_version_index: 0,
      prompt,
      model: this.landingAiModel,
      generated_at: new Date().toISOString(),
    };
  }

  async getPublishedLandingPage(user: AuthUser) {
    const row = await this.db.tenant_landing_page_settings.findFirst({
      where: { tenant_id: user.tenant_id },
    });

    const normalized = row ? this.normalizeLandingPageRecord(row) : this.emptyLandingPageSettings();
    return {
      landing_page_url: normalized.landing_page_url,
      published_html: normalized.published_html,
      published_css: normalized.published_css,
      published_project_json: normalized.published_project_json,
      updated_at: normalized.updated_at,
      published_at: normalized.published_at,
    };
  }

  private async ensureOptionSetPermission(
    user: AuthUser,
    entity: string,
    field?: string,
    enabledAreaSet?: Set<string>,
    entityAreaMap?: Map<string, ModuleAreaKey>,
  ): Promise<void> {
    const meta = getEntityRegistryItem(entity);
    if (!meta) throw new BadRequestException('Entidade invalida para option set.');
    if (!meta.allowOptionSetEditing) {
      throw new ForbiddenException('Esta entidade nao permite editar option sets.');
    }
    const areaSet = enabledAreaSet || (await this.getEnabledAreaSet(user.tenant_id));
    const map = entityAreaMap || (await this.billingAreaEntityConfigService.getEntityAreaMapSnapshot());
    if (!this.isEntityAllowedForAreaSet(meta.entity, areaSet, map)) {
      throw new ForbiddenException(`Entidade ${meta.entity} nao habilitada para os modulos do tenant.`);
    }
    if (!field) return;

    const allowedFields = Array.isArray(meta.optionSetFields) ? meta.optionSetFields.map((item) => item.field) : [];
    if (!allowedFields.includes(field)) {
      throw new BadRequestException(`Campo ${field} nao permitido para option set da entidade ${entity}.`);
    }
  }

  private normalizeOptionSetKey(entity: string, field: string): string {
    return `${entity}::${field}`;
  }

  private getOptionSetLookupBridge(entity: string, field: string): OptionSetLookupBridgeConfig | null {
    const key = this.normalizeOptionSetKey(this.normalizeText(entity), this.normalizeText(field));
    return this.optionSetLookupBridges.get(key) || null;
  }

  private validateOptionSetBridgeValueAndLabel(
    entity: string,
    field: string,
    value: string,
    label: string,
  ): void {
    const bridge = this.getOptionSetLookupBridge(entity, field);
    if (!bridge) return;
    if (value.length > bridge.codeMaxLength) {
      throw new BadRequestException(
        `Para ${entity}.${field}, o value deve ter no maximo ${bridge.codeMaxLength} caracteres.`,
      );
    }
    if (label.length > bridge.labelMaxLength) {
      throw new BadRequestException(
        `Para ${entity}.${field}, o label deve ter no maximo ${bridge.labelMaxLength} caracteres.`,
      );
    }
  }

  private normalizeOptionValue(value: unknown): string {
    const raw = this.normalizeText(value)
      .toUpperCase()
      .replace(/\s+/g, '_')
      .replace(/[^A-Z0-9_]/g, '');

    if (!raw) throw new BadRequestException('Valor da opcao e obrigatorio.');
    if (raw.length > 60) throw new BadRequestException('Valor da opcao deve ter no maximo 60 caracteres.');
    return raw;
  }

  private normalizeOptionLabel(value: unknown): string {
    const raw = this.normalizeText(value);
    if (!raw) throw new BadRequestException('Label da opcao e obrigatoria.');
    if (raw.length > 160) throw new BadRequestException('Label da opcao deve ter no maximo 160 caracteres.');
    return raw;
  }

  private optionSetCacheKey(tenantId: string, entity: string, field: string): string {
    return `${tenantId}::${entity}::${field}`;
  }

  private invalidateOptionSetCache(tenantId: string, entity?: string, field?: string): void {
    if (!entity) {
      for (const key of Array.from(this.optionSetCache.keys())) {
        if (key.startsWith(`${tenantId}::`)) this.optionSetCache.delete(key);
      }
      return;
    }

    if (!field) {
      for (const key of Array.from(this.optionSetCache.keys())) {
        if (key.startsWith(`${tenantId}::${entity}::`)) this.optionSetCache.delete(key);
      }
      return;
    }

    this.optionSetCache.delete(this.optionSetCacheKey(tenantId, entity, field));
  }

  private isSafeDbIdentifier(value: unknown): boolean {
    const raw = this.normalizeText(value);
    return /^[a-z_][a-z0-9_]*$/.test(raw);
  }

  private buildOptionLabelFromRaw(value: string): string {
    const raw = this.normalizeText(value);
    if (!raw) return raw;
    const normalized = raw.replace(/[_\s]+/g, ' ').trim().toLowerCase();
    if (!normalized) return raw;
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  private async getSeedValuesForOptionSet(entity: string, field: string): Promise<string[]> {
    if (!this.isSafeDbIdentifier(entity) || !this.isSafeDbIdentifier(field)) return [];

    const columnRows = (await this.db.$queryRaw(Prisma.sql`
      SELECT data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${entity}
        AND column_name = ${field}
      LIMIT 1
    `)) as Array<{ data_type: string; udt_name: string }>;

    if (!columnRows.length) return [];

    const dataType = String(columnRows[0]?.data_type || '').toUpperCase();
    const udtName = this.normalizeText(columnRows[0]?.udt_name);
    let values: string[] = [];

    if (dataType === 'USER-DEFINED' && this.isSafeDbIdentifier(udtName)) {
      const enumRows = (await this.db.$queryRaw(Prisma.sql`
        SELECT e.enumlabel AS value
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = ${udtName}
        ORDER BY e.enumsortorder
      `)) as Array<{ value: string }>;
      values = enumRows.map((row) => this.normalizeText(row?.value)).filter(Boolean);
    } else {
      const tableId = Prisma.raw(`"${entity}"`);
      const fieldId = Prisma.raw(`"${field}"`);
      const rows = (await this.db.$queryRaw(Prisma.sql`
        SELECT DISTINCT ${fieldId}::text AS value
        FROM ${tableId}
        WHERE ${fieldId} IS NOT NULL
          AND BTRIM(${fieldId}::text) <> ''
        ORDER BY 1
        LIMIT 200
      `)) as Array<{ value: string }>;
      values = rows.map((row) => this.normalizeText(row?.value)).filter(Boolean);
    }

    return Array.from(new Set(values));
  }

  private async getHrEmploymentStatusSeedRows(user: AuthUser): Promise<OptionSetSeedRow[]> {
    const rows = await this.db.hr_employment_statuses.findMany({
      where: { tenant_id: user.tenant_id, deleted_at: null },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      select: {
        code: true,
        name: true,
        color: true,
        sort_order: true,
        is_active: true,
      },
    });

    return rows
      .map((row: any, idx: number) => {
        const rawCode = this.normalizeText(row?.code).toUpperCase();
        const rawName = this.normalizeText(row?.name);
        if (!rawCode || !rawName) return null;
        return {
          value: this.normalizeOptionValue(rawCode),
          label: this.normalizeOptionLabel(rawName),
          color: this.normalizeText(row?.color) || null,
          sort_order: this.toInt(row?.sort_order, (idx + 1) * 10),
          is_active: this.toBool(row?.is_active, true),
        } satisfies OptionSetSeedRow;
      })
      .filter((item: OptionSetSeedRow | null): item is OptionSetSeedRow => !!item);
  }

  private async getHrSimpleLookupSeedRows(
    user: AuthUser,
    delegate: 'hr_document_types' | 'hr_marital_statuses',
  ): Promise<OptionSetSeedRow[]> {
    const rows = await this.db[delegate].findMany({
      where: { tenant_id: user.tenant_id, deleted_at: null },
      orderBy: [{ name: 'asc' }],
      select: {
        code: true,
        name: true,
        is_active: true,
      },
    });

    return rows
      .map((row: any, idx: number) => {
        const rawCode = this.normalizeText(row?.code).toUpperCase();
        const rawName = this.normalizeText(row?.name);
        if (!rawCode || !rawName) return null;
        return {
          value: this.normalizeOptionValue(rawCode),
          label: this.normalizeOptionLabel(rawName),
          color: null,
          sort_order: (idx + 1) * 10,
          is_active: this.toBool(row?.is_active, true),
        } satisfies OptionSetSeedRow;
      })
      .filter((item: OptionSetSeedRow | null): item is OptionSetSeedRow => !!item);
  }

  private async getSeedRowsForOptionSet(user: AuthUser, entity: string, field: string): Promise<OptionSetSeedRow[]> {
    const key = this.normalizeOptionSetKey(entity, field);
    if (key === 'hr_employees::employment_status_id') {
      return this.getHrEmploymentStatusSeedRows(user);
    }
    if (key === 'hr_employees::marital_status_id') {
      return this.getHrSimpleLookupSeedRows(user, 'hr_marital_statuses');
    }
    if (key === 'hr_employees::document_type_id') {
      return this.getHrSimpleLookupSeedRows(user, 'hr_document_types');
    }

    const seedValues = await this.getSeedValuesForOptionSet(entity, field);
    const usedValues = new Set<string>();
    const rows: OptionSetSeedRow[] = [];
    seedValues.forEach((rawValue, idx) => {
        const value = this.normalizeOptionValue(rawValue);
        if (usedValues.has(value)) return;
        usedValues.add(value);
        rows.push({
          value,
          label: this.normalizeOptionLabel(this.buildOptionLabelFromRaw(rawValue) || rawValue),
          color: null,
          sort_order: (idx + 1) * 10,
          is_active: true,
        });
      });
    return rows;
  }

  private async ensureOptionSetSeeded(user: AuthUser, entity: string, field: string): Promise<void> {
    if (!entity || !field) return;
    if (!this.isSafeDbIdentifier(entity) || !this.isSafeDbIdentifier(field)) return;

    const current = await this.db.option_sets.findFirst({
      where: { tenant_id: user.tenant_id, entity, field },
      include: { options: true },
    });

    const hasOptions = Array.isArray(current?.options) && current.options.length > 0;
    if (hasOptions) return;

    const seedRows = await this.getSeedRowsForOptionSet(user, entity, field);

    let optionSet = current;
    if (!optionSet) {
      optionSet = await this.db.option_sets.create({
        data: { tenant_id: user.tenant_id, entity, field },
      });
      this.invalidateOptionSetCache(user.tenant_id, entity, field);
    }

    if (!seedRows.length) return;
    if (hasOptions) return;

    const rows = seedRows.map((seed) => ({
      option_set_id: optionSet.id,
      value: seed.value,
      label: seed.label,
      color: seed.color,
      sort_order: seed.sort_order,
      is_active: seed.is_active,
    }));

    if (!rows.length) return;

    await this.db.option_set_options.createMany({
      data: rows,
      skipDuplicates: true,
    });
    this.invalidateOptionSetCache(user.tenant_id, entity, field);
  }

  private async syncHrEmploymentStatusesFromOptionSet(user: AuthUser, options: any[]): Promise<void> {
    const existingRows = await this.db.hr_employment_statuses.findMany({
      where: { tenant_id: user.tenant_id },
      select: {
        id: true,
        code: true,
        name: true,
        color: true,
        sort_order: true,
        is_active: true,
        deleted_at: true,
      },
    });

    const existingByCode = new Map<string, any>(
      existingRows
        .map((row: any) => [this.normalizeText(row?.code).toUpperCase(), row] as const)
        .filter(([code]) => !!code),
    );

    for (let idx = 0; idx < options.length; idx += 1) {
      const option = options[idx];
      const code = this.normalizeText(option?.value).toUpperCase();
      const name = this.normalizeText(option?.label);
      if (!code || !name) continue;
      if (code.length > 40) continue;
      const normalizedColor = this.normalizeText(option?.color);
      const data: Record<string, any> = {
        name: name.slice(0, 120),
        code,
        color: normalizedColor ? normalizedColor.slice(0, 20) : null,
        sort_order: this.toInt(option?.sort_order, (idx + 1) * 10),
        is_active: this.toBool(option?.is_active, true),
        deleted_at: null,
        updated_at: new Date(),
      };

      const existing = existingByCode.get(code);
      if (existing?.id) {
        await this.db.hr_employment_statuses.update({
          where: { id: existing.id },
          data,
        });
        continue;
      }

      await this.db.hr_employment_statuses.create({
        data: {
          tenant_id: user.tenant_id,
          ...data,
          is_default: false,
        },
      });
    }
  }

  private async syncHrSimpleLookupFromOptionSet(
    user: AuthUser,
    delegate: 'hr_document_types' | 'hr_marital_statuses',
    options: any[],
  ): Promise<void> {
    const existingRows = await this.db[delegate].findMany({
      where: { tenant_id: user.tenant_id },
      select: {
        id: true,
        code: true,
      },
    });

    const existingByCode = new Map<string, any>(
      existingRows
        .map((row: any) => [this.normalizeText(row?.code).toUpperCase(), row] as const)
        .filter(([code]) => !!code),
    );

    for (const option of options) {
      const code = this.normalizeText(option?.value).toUpperCase();
      const name = this.normalizeText(option?.label);
      if (!code || !name) continue;
      if (code.length > 40) continue;
      const data: Record<string, any> = {
        name: name.slice(0, 120),
        code,
        is_active: this.toBool(option?.is_active, true),
        deleted_at: null,
        updated_at: new Date(),
      };

      const existing = existingByCode.get(code);
      if (existing?.id) {
        await this.db[delegate].update({
          where: { id: existing.id },
          data,
        });
        continue;
      }

      await this.db[delegate].create({
        data: {
          tenant_id: user.tenant_id,
          ...data,
        },
      });
    }
  }

  private async syncLookupBridgeForOptionSet(user: AuthUser, optionSet: any): Promise<void> {
    const entity = this.normalizeText(optionSet?.entity);
    const field = this.normalizeText(optionSet?.field);
    const key = this.normalizeOptionSetKey(entity, field);
    if (!this.getOptionSetLookupBridge(entity, field)) return;

    const options = Array.isArray(optionSet?.options)
      ? optionSet.options
      : await this.db.option_set_options.findMany({
          where: { option_set_id: optionSet?.id },
          orderBy: [{ sort_order: 'asc' }, { label: 'asc' }],
        });

    if (key === 'hr_employees::employment_status_id') {
      await this.syncHrEmploymentStatusesFromOptionSet(user, options);
      return;
    }
    if (key === 'hr_employees::marital_status_id') {
      await this.syncHrSimpleLookupFromOptionSet(user, 'hr_marital_statuses', options);
      return;
    }
    if (key === 'hr_employees::document_type_id') {
      await this.syncHrSimpleLookupFromOptionSet(user, 'hr_document_types', options);
    }
  }

  private async syncLookupBridgeForEntityField(user: AuthUser, entity: string, field: string): Promise<void> {
    if (!this.getOptionSetLookupBridge(entity, field)) return;
    const optionSet = await this.db.option_sets.findFirst({
      where: { tenant_id: user.tenant_id, entity, field },
      include: {
        options: {
          orderBy: [{ sort_order: 'asc' }, { label: 'asc' }],
        },
      },
    });
    if (!optionSet) return;
    await this.syncLookupBridgeForOptionSet(user, optionSet);
  }

  async listOptionSets(user: AuthUser, entity?: string, field?: string) {
    const normalizedEntity = this.normalizeText(entity);
    const normalizedField = this.normalizeText(field);
    const [enabledAreaSet, entityAreaMap] = await Promise.all([
      this.getEnabledAreaSet(user.tenant_id),
      this.billingAreaEntityConfigService.getEntityAreaMapSnapshot(),
    ]);

    if (normalizedEntity) {
      await this.ensureOptionSetPermission(
        user,
        normalizedEntity,
        normalizedField || undefined,
        enabledAreaSet,
        entityAreaMap,
      );
    }

    if (normalizedEntity && normalizedField) {
      await this.ensureOptionSetSeeded(user, normalizedEntity, normalizedField);
      await this.syncLookupBridgeForEntityField(user, normalizedEntity, normalizedField);
    }

    if (normalizedEntity && normalizedField) {
      const cacheKey = this.optionSetCacheKey(user.tenant_id, normalizedEntity, normalizedField);
      const cached = this.optionSetCache.get(cacheKey);
      if (cached) return { items: [cached] };
    }

    const items = await this.db.option_sets.findMany({
      where: {
        tenant_id: user.tenant_id,
        ...(normalizedEntity ? { entity: normalizedEntity } : {}),
        ...(normalizedField ? { field: normalizedField } : {}),
      },
      include: {
        options: {
          orderBy: [{ sort_order: 'asc' }, { label: 'asc' }],
        },
      },
      orderBy: [{ entity: 'asc' }, { field: 'asc' }],
    });

    const filtered = items.filter((item: any) => {
      const meta = getEntityRegistryItem(item.entity);
      if (!meta?.allowOptionSetEditing) return false;
      return this.isEntityAllowedForAreaSet(item.entity, enabledAreaSet, entityAreaMap);
    });

    for (const item of filtered) {
      this.optionSetCache.set(this.optionSetCacheKey(user.tenant_id, item.entity, item.field), item);
    }

    return { items: filtered };
  }

  async createOptionSet(user: AuthUser, dto: CreateOptionSetDto) {
    this.assertAdmin(user);
    const entity = this.normalizeText(dto.entity);
    const field = this.normalizeText(dto.field);

    if (!entity || !field) {
      throw new BadRequestException('entity e field sao obrigatorios.');
    }

    await this.ensureOptionSetPermission(user, entity, field);

    const existing = await this.db.option_sets.findFirst({
      where: {
        tenant_id: user.tenant_id,
        entity,
        field,
      },
    });
    if (existing) throw new BadRequestException('Option set ja existe para entidade/campo informado.');

    const created = await this.db.option_sets.create({
      data: {
        tenant_id: user.tenant_id,
        entity,
        field,
      },
      include: { options: true },
    });

    await this.audit(user, 'OPTION_SET_CREATED', 'option_sets', null, created);
    this.invalidateOptionSetCache(user.tenant_id, entity, field);
    return created;
  }

  private async getOptionSetOrThrow(user: AuthUser, optionSetId: string) {
    const set = await this.db.option_sets.findFirst({
      where: { id: optionSetId, tenant_id: user.tenant_id },
    });
    if (!set) throw new NotFoundException('Option set nao encontrado.');
    await this.ensureOptionSetPermission(user, set.entity, set.field);
    return set;
  }

  async listOptionSetOptions(user: AuthUser, optionSetId: string) {
    await this.getOptionSetOrThrow(user, optionSetId);

    const items = await this.db.option_set_options.findMany({
      where: { option_set_id: optionSetId },
      orderBy: [{ sort_order: 'asc' }, { label: 'asc' }],
    });

    return { items };
  }

  async createOptionSetOption(user: AuthUser, optionSetId: string, dto: CreateOptionSetOptionDto) {
    this.assertAdmin(user);
    const set = await this.getOptionSetOrThrow(user, optionSetId);

    const value = this.normalizeOptionValue(dto.value);
    const label = this.normalizeOptionLabel(dto.label);
    this.validateOptionSetBridgeValueAndLabel(set.entity, set.field, value, label);

    const existing = await this.db.option_set_options.findFirst({
      where: {
        option_set_id: optionSetId,
        value,
      },
    });
    if (existing) throw new BadRequestException('Ja existe opcao com esse valor.');

    const created = await this.db.option_set_options.create({
      data: {
        option_set_id: optionSetId,
        value,
        label,
        color: this.normalizeText(dto.color) || null,
        sort_order: this.toInt(dto.sort_order, 0),
        is_active: this.toBool(dto.is_active, true),
      },
    });

    await this.audit(user, 'OPTION_SET_OPTION_CREATED', 'option_set_options', null, created);
    await this.syncLookupBridgeForOptionSet(user, { ...set, options: [created] });
    this.invalidateOptionSetCache(user.tenant_id, set.entity, set.field);
    return created;
  }

  async updateOption(user: AuthUser, optionId: string, dto: UpdateOptionSetOptionDto) {
    this.assertAdmin(user);

    const current = await this.db.option_set_options.findFirst({
      where: { id: optionId },
      include: { option_set: true },
    });

    if (!current || current.option_set?.tenant_id !== user.tenant_id) {
      throw new NotFoundException('Opcao nao encontrada.');
    }

    await this.ensureOptionSetPermission(user, current.option_set.entity, current.option_set.field);

    const nextValue = dto.value !== undefined ? this.normalizeOptionValue(dto.value) : current.value;
    if (nextValue !== current.value) {
      throw new BadRequestException('Campo value e imutavel apos criacao.');
    }
    const nextLabel = dto.label !== undefined ? this.normalizeOptionLabel(dto.label) : current.label;
    this.validateOptionSetBridgeValueAndLabel(
      current.option_set.entity,
      current.option_set.field,
      nextValue,
      nextLabel,
    );

    const payload: Record<string, any> = {
      updated_at: new Date(),
    };

    if (dto.label !== undefined) payload.label = nextLabel;
    if (dto.color !== undefined) payload.color = this.normalizeText(dto.color) || null;
    if (dto.sort_order !== undefined) payload.sort_order = this.toInt(dto.sort_order, 0);
    if (dto.is_active !== undefined) payload.is_active = this.toBool(dto.is_active, current.is_active);

    const updated = await this.db.option_set_options.update({
      where: { id: optionId },
      data: payload,
    });

    await this.audit(user, 'OPTION_SET_OPTION_UPDATED', 'option_set_options', current, updated);
    await this.syncLookupBridgeForEntityField(user, current.option_set.entity, current.option_set.field);
    this.invalidateOptionSetCache(user.tenant_id, current.option_set.entity, current.option_set.field);
    return updated;
  }

  async toggleOptionActive(user: AuthUser, optionId: string, dto: ToggleOptionActiveDto) {
    this.assertAdmin(user);

    const current = await this.db.option_set_options.findFirst({
      where: { id: optionId },
      include: { option_set: true },
    });

    if (!current || current.option_set?.tenant_id !== user.tenant_id) {
      throw new NotFoundException('Opcao nao encontrada.');
    }

    await this.ensureOptionSetPermission(user, current.option_set.entity, current.option_set.field);

    const nextActive = dto?.is_active === undefined ? !Boolean(current.is_active) : this.toBool(dto.is_active, true);

    const updated = await this.db.option_set_options.update({
      where: { id: optionId },
      data: {
        is_active: nextActive,
        updated_at: new Date(),
      },
    });

    await this.audit(user, 'OPTION_SET_OPTION_TOGGLED', 'option_set_options', current, updated);
    await this.syncLookupBridgeForEntityField(user, current.option_set.entity, current.option_set.field);
    this.invalidateOptionSetCache(user.tenant_id, current.option_set.entity, current.option_set.field);
    return updated;
  }

  private sanitizeEmailIntegrationPayload(
    dto: Partial<CreateEmailIntegrationDto & UpdateEmailIntegrationDto>,
    current?: any,
  ): Record<string, any> {
    const out: Record<string, any> = {};

    if (dto.provider !== undefined) out.provider = this.normalizeText(dto.provider).toUpperCase();
    if (dto.display_name !== undefined) out.display_name = this.normalizeText(dto.display_name);
    if (dto.sender_email !== undefined) out.sender_email = this.normalizeText(dto.sender_email).toLowerCase();
    if (dto.client_id !== undefined) out.client_id = this.normalizeText(dto.client_id) || null;

    if (dto.client_secret !== undefined) {
      const secret = this.normalizeText(dto.client_secret);
      out.client_secret = secret && secret !== '****' ? secret : current?.client_secret ?? null;
    }

    if (dto.tenant_domain !== undefined) out.tenant_domain = this.normalizeText(dto.tenant_domain) || null;
    if (dto.smtp_host !== undefined) out.smtp_host = this.normalizeText(dto.smtp_host) || null;
    if (dto.smtp_port !== undefined) out.smtp_port = this.toInt(dto.smtp_port, 587);
    if (dto.smtp_user !== undefined) out.smtp_user = this.normalizeText(dto.smtp_user) || null;

    if (dto.smtp_password !== undefined) {
      const password = this.normalizeText(dto.smtp_password);
      out.smtp_password = password && password !== '****' ? password : current?.smtp_password ?? null;
    }

    if (dto.is_active !== undefined) out.is_active = this.toBool(dto.is_active, false);

    return out;
  }

  private ensureEmailProvider(provider: unknown): string {
    const normalized = this.normalizeText(provider).toUpperCase();
    if (!['GMAIL', 'OUTLOOK', 'SMTP'].includes(normalized)) {
      throw new BadRequestException('Provider invalido. Use GMAIL, OUTLOOK ou SMTP.');
    }
    return normalized;
  }

  private maskEmailIntegration(row: any) {
    return {
      ...row,
      client_secret: this.maskSecret(row?.client_secret),
      smtp_password: this.maskSecret(row?.smtp_password),
    };
  }

  async listEmailIntegrations(user: AuthUser) {
    const items = await this.db.email_integrations.findMany({
      where: { tenant_id: user.tenant_id },
      orderBy: [{ updated_at: 'desc' }],
    });

    return { items: items.map((item: any) => this.maskEmailIntegration(item)) };
  }

  async createEmailIntegration(user: AuthUser, dto: CreateEmailIntegrationDto) {
    this.assertAdmin(user);

    const payload = this.sanitizeEmailIntegrationPayload(dto || {});
    payload.provider = this.ensureEmailProvider(payload.provider);

    if (!payload.display_name) throw new BadRequestException('display_name e obrigatorio.');
    if (!payload.sender_email) throw new BadRequestException('sender_email e obrigatorio.');

    const created = await this.db.email_integrations.create({
      data: {
        tenant_id: user.tenant_id,
        ...payload,
      },
    });

    await this.audit(user, 'EMAIL_INTEGRATION_CREATED', 'email_integrations', null, created);
    return this.maskEmailIntegration(created);
  }

  private async getEmailIntegrationOrThrow(user: AuthUser, id: string) {
    const current = await this.db.email_integrations.findFirst({
      where: {
        id,
        tenant_id: user.tenant_id,
      },
    });

    if (!current) throw new NotFoundException('Integracao de email nao encontrada.');
    return current;
  }

  async updateEmailIntegration(user: AuthUser, id: string, dto: UpdateEmailIntegrationDto) {
    this.assertAdmin(user);

    const current = await this.getEmailIntegrationOrThrow(user, id);
    const payload = this.sanitizeEmailIntegrationPayload(dto || {}, current);

    if (payload.provider !== undefined) {
      payload.provider = this.ensureEmailProvider(payload.provider);
    }

    const updated = await this.db.email_integrations.update({
      where: { id },
      data: {
        ...payload,
        updated_at: new Date(),
      },
    });

    await this.audit(user, 'EMAIL_INTEGRATION_UPDATED', 'email_integrations', current, updated);
    return this.maskEmailIntegration(updated);
  }

  async toggleEmailIntegration(user: AuthUser, id: string, dto: ToggleEmailIntegrationDto) {
    this.assertAdmin(user);

    const current = await this.getEmailIntegrationOrThrow(user, id);
    const nextActive = dto?.is_active === undefined ? !Boolean(current.is_active) : this.toBool(dto.is_active, false);

    const updated = await this.db.email_integrations.update({
      where: { id },
      data: {
        is_active: nextActive,
        updated_at: new Date(),
      },
    });

    await this.audit(user, 'EMAIL_INTEGRATION_TOGGLED', 'email_integrations', current, updated);
    return this.maskEmailIntegration(updated);
  }

  async testEmailIntegration(user: AuthUser, dto: TestEmailIntegrationDto) {
    this.assertAdmin(user);

    let settings: {
      smtp_host: string;
      smtp_port: number;
      smtp_user?: string | null;
      smtp_password?: string | null;
    } | null = null;

    const integrationId = this.normalizeText(dto?.integration_id);
    if (integrationId) {
      const integration = await this.getEmailIntegrationOrThrow(user, integrationId);
      settings = {
        smtp_host: this.normalizeText(integration.smtp_host),
        smtp_port: this.toInt(integration.smtp_port, 587),
        smtp_user: this.normalizeText(integration.smtp_user) || null,
        smtp_password: this.normalizeText(integration.smtp_password) || null,
      };
    } else {
      settings = {
        smtp_host: this.normalizeText(dto?.smtp_host),
        smtp_port: this.toInt(dto?.smtp_port, 587),
        smtp_user: this.normalizeText(dto?.smtp_user) || null,
        smtp_password: this.normalizeText(dto?.smtp_password) || null,
      };
    }

    if (!settings.smtp_host) {
      throw new BadRequestException('smtp_host e obrigatorio para teste SMTP.');
    }

    if (!settings.smtp_port || settings.smtp_port < 1 || settings.smtp_port > 65535) {
      throw new BadRequestException('smtp_port invalido.');
    }

    const secure = Number(settings.smtp_port) === 465;

    const transport = nodemailer.createTransport({
      host: settings.smtp_host,
      port: settings.smtp_port,
      secure,
      auth: settings.smtp_user
        ? {
            user: settings.smtp_user,
            pass: settings.smtp_password || '',
          }
        : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
      tls: {
        rejectUnauthorized: false,
      },
    });

    await transport.verify();

    return {
      ok: true,
      message: 'Conexao SMTP validada com sucesso.',
    };
  }
}

