import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';
import { isEntityAllowedByModuleAreas } from '../billing-plans/module-areas';
import { TenantModulesResolverService } from '../billing-plans/tenant-modules-resolver.service';
import {
  CreateEmailIntegrationDto,
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

@Injectable()
export class AdminConfigService {
  private readonly optionSetCache = new Map<string, any>();
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

  private readonly defaultTheme: ThemeSettings = {
    primary_color: '#1ab394',
    nav_bg_color: '#2f4050',
    nav_text_color: '#a7b1c2',
    topbar_bg_color: '#ffffff',
    layout_mode: 'LIGHT',
    logo_url: null,
    favicon_url: null,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantModulesResolverService: TenantModulesResolverService,
  ) {}

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

  private isEntityAllowedForAreaSet(entity: string, enabledAreaSet: Set<string>): boolean {
    return isEntityAllowedByModuleAreas(entity, enabledAreaSet);
  }

  async listMetadataEntities(user: AuthUser) {
    const enabledAreaSet = await this.getEnabledAreaSet(user.tenant_id);
    return ENTITY_REGISTRY.filter((item) => this.isEntityAllowedForAreaSet(item.entity, enabledAreaSet));
  }

  private buildDefaultMenuConfig(): Record<string, any> {
    return {
      areas: [
        {
          id: 'home',
          label: 'Home',
          order: 10,
          items: [
            { entity: 'companies', label: 'Empresas', icon: 'fa-building', route: '/Clientes', order: 10 },
            { entity: 'processes', label: 'Processos', icon: 'fa-file', route: '/Processos', order: 20 },
            { entity: 'products', label: 'Produtos', icon: 'fa-cube', route: '/Products', order: 30 },
            { entity: 'invoices', label: 'Faturas', icon: 'fa-money', route: '/Invoices', order: 40 },
          ],
        },
      ],
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
    const enabledAreaSet = await this.getEnabledAreaSet(user.tenant_id);
    const seenAreaIds = new Set<string>();

    const areas = rawAreas
      .map((area: any, areaIndex: number) => {
        const areaLabel = this.normalizeText(area?.label) || `Area ${areaIndex + 1}`;
        const areaId = this.slugify(area?.id || areaLabel, `area_${areaIndex + 1}`);
        const areaOrder = this.toInt(area?.order, (areaIndex + 1) * 10);
        const isHome = areaId === 'home';

        if (this.isReservedAreaId(areaId) && !isHome) {
          if (strict) {
            throw new BadRequestException(
              `A area "${areaId}" e fixa do sistema e nao pode ser alterada por configuracao de tenant.`,
            );
          }
          return null;
        }

        if (seenAreaIds.has(areaId)) {
          if (strict) throw new BadRequestException(`ID de area duplicado: ${areaId}.`);
          return null;
        }
        seenAreaIds.add(areaId);

        const rawItems = Array.isArray(area?.items) ? area.items : [];
        const items = rawItems
          .map((item: any, itemIndex: number) => {
            const entity = this.normalizeText(item?.entity);
            const meta = getEntityRegistryItem(entity);
            if (!meta) {
              if (strict) throw new BadRequestException(`Entidade invalida no menu: ${entity || '(vazio)'}`);
              return null;
            }
            if (!this.isEntityAllowedForAreaSet(meta.entity, enabledAreaSet)) {
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

    if (!areas.length) return this.buildDefaultMenuConfig();
    return { areas };
  }

  async getMenu(user: AuthUser) {
    const row = await this.db.tenant_menu_config.findFirst({
      where: { tenant_id: user.tenant_id },
    });

    const config_json = await this.normalizeMenuConfig(user, row?.config_json || this.buildDefaultMenuConfig(), false);
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

  private async ensureOptionSetPermission(
    user: AuthUser,
    entity: string,
    field?: string,
    enabledAreaSet?: Set<string>,
  ): Promise<void> {
    const meta = getEntityRegistryItem(entity);
    if (!meta) throw new BadRequestException('Entidade invalida para option set.');
    if (!meta.allowOptionSetEditing) {
      throw new ForbiddenException('Esta entidade nao permite editar option sets.');
    }
    const areaSet = enabledAreaSet || (await this.getEnabledAreaSet(user.tenant_id));
    if (!this.isEntityAllowedForAreaSet(meta.entity, areaSet)) {
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

  async listOptionSets(user: AuthUser, entity?: string, field?: string) {
    const normalizedEntity = this.normalizeText(entity);
    const normalizedField = this.normalizeText(field);
    const enabledAreaSet = await this.getEnabledAreaSet(user.tenant_id);

    if (normalizedEntity) {
      await this.ensureOptionSetPermission(user, normalizedEntity, normalizedField || undefined, enabledAreaSet);
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
      return this.isEntityAllowedForAreaSet(item.entity, enabledAreaSet);
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

    const payload: Record<string, any> = {
      updated_at: new Date(),
    };

    if (dto.label !== undefined) payload.label = this.normalizeOptionLabel(dto.label);
    if (dto.color !== undefined) payload.color = this.normalizeText(dto.color) || null;
    if (dto.sort_order !== undefined) payload.sort_order = this.toInt(dto.sort_order, 0);
    if (dto.is_active !== undefined) payload.is_active = this.toBool(dto.is_active, current.is_active);

    const updated = await this.db.option_set_options.update({
      where: { id: optionId },
      data: payload,
    });

    await this.audit(user, 'OPTION_SET_OPTION_UPDATED', 'option_set_options', current, updated);
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
