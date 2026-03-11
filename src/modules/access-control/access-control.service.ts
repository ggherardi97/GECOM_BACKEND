import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingAreaEntityConfigService } from '../billing-plans/billing-area-entity-config.service';
import { isEntityAllowedByModuleAreas } from '../billing-plans/module-areas';
import { TenantModulesResolverService } from '../billing-plans/tenant-modules-resolver.service';
import { ENTITY_REGISTRY, type EntityRegistryItem } from '../admin-config/entity-registry';
import {
  CreateAccessRoleDto,
  ListAccessUsersQueryDto,
  UpdateAccessRoleDto,
  UpdateRolePermissionsDto,
  UpdateUserRolesDto,
} from './dto/access-control.dto';

type CrudAction = 'READ' | 'CREATE' | 'UPDATE' | 'DELETE';

type CrudPermission = {
  can_read: boolean;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
};

type AccessUserContext = {
  tenantId: string;
  userId: string;
  legacyRole: string;
};

type EffectiveRole = {
  id: string;
  code: string;
  name: string;
  is_system: boolean;
};

type EffectiveAccess = {
  roles: EffectiveRole[];
  permissions: Array<{ entity: string } & CrudPermission>;
  permission_map: Record<string, CrudPermission>;
  entities: EntityRegistryItem[];
};

type SystemRoleTemplate = {
  code: 'ADMIN' | 'MANAGER' | 'USER' | 'CUSTOMER';
  name: string;
  description: string;
  defaultPermission: CrudPermission;
  lockPermissions: boolean;
};

@Injectable()
export class AccessControlService {
  private readonly bootstrapCache = new Map<string, number>();
  private readonly bootstrapCacheTtlMs = 30_000;
  private readonly externalReadOnlyResources = new Set<string>([
    'processes',
    'documents',
    'calendar_activities',
    'calendar-activities',
    'invoices',
    'notifications',
    'process_types',
    'transport_types',
    'transport_statuses',
  ]);

  private readonly systemRoleTemplates: SystemRoleTemplate[] = [
    {
      code: 'ADMIN',
      name: 'Administrador',
      description: 'Acesso total ao tenant (CRUD completo nas entidades habilitadas pelo plano).',
      defaultPermission: { can_read: true, can_create: true, can_update: true, can_delete: true },
      lockPermissions: true,
    },
    {
      code: 'MANAGER',
      name: 'Gestor',
      description: 'Pode consultar, criar e editar registros nas entidades habilitadas.',
      defaultPermission: { can_read: true, can_create: true, can_update: true, can_delete: false },
      lockPermissions: false,
    },
    {
      code: 'USER',
      name: 'Usuário',
      description: 'Pode consultar dados nas entidades habilitadas.',
      defaultPermission: { can_read: true, can_create: false, can_update: false, can_delete: false },
      lockPermissions: false,
    },
    {
      code: 'CUSTOMER',
      name: 'Cliente',
      description: 'Acesso básico de leitura nas entidades habilitadas.',
      defaultPermission: { can_read: true, can_create: false, can_update: false, can_delete: false },
      lockPermissions: false,
    },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantModulesResolverService: TenantModulesResolverService,
    private readonly billingAreaEntityConfigService: BillingAreaEntityConfigService,
  ) {}

  private get db(): any {
    return this.prisma.raw;
  }

  private normalizeText(value: unknown): string {
    return String(value ?? '').trim();
  }

  private slugify(value: unknown): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase();
  }

  private normalizeRoleCode(value: unknown, fallback = 'ROLE'): string {
    const code = this.slugify(value);
    return code || fallback;
  }

  private normalizeComparable(value: unknown): string {
    return String(value ?? '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
  }

  private isExternalRoleToken(value: unknown): boolean {
    const token = this.normalizeComparable(value);
    return token.includes('EXTERNO') || token.includes('EXTERNAL');
  }

  private isManagerRoleToken(value: unknown): boolean {
    const token = this.normalizeComparable(value);
    return token.includes('MANAGER') || token.includes('GESTOR');
  }

  private hasExternalRole(roles: EffectiveRole[]): boolean {
    return (roles || []).some((role) => {
      return this.isExternalRoleToken(role?.code) || this.isExternalRoleToken(role?.name);
    });
  }

  private hasExternalManagerRole(roles: EffectiveRole[]): boolean {
    return (roles || []).some((role) => {
      const values = [role?.code, role?.name];
      const hasExternal = values.some((value) => this.isExternalRoleToken(value));
      const hasManager = values.some((value) => this.isManagerRoleToken(value));
      return hasExternal && hasManager;
    });
  }

  private getExternalProfile(roles: EffectiveRole[]): { isExternal: boolean; isExternalManager: boolean } {
    const isExternal = this.hasExternalRole(roles);
    const isExternalManager = isExternal && this.hasExternalManagerRole(roles);
    return { isExternal, isExternalManager };
  }

  private applyExternalReadOnlyOverrides(input: EffectiveAccess): EffectiveAccess {
    const externalProfile = this.getExternalProfile(input.roles);
    if (!externalProfile.isExternal) return input;

    const permissionMap = { ...(input.permission_map || {}) } as Record<string, CrudPermission>;
    this.externalReadOnlyResources.forEach((resource) => {
      permissionMap[resource] = {
        can_read: true,
        can_create: false,
        can_update: false,
        can_delete: false,
      };
    });

    if (externalProfile.isExternalManager) {
      permissionMap.documents = {
        can_read: true,
        can_create: true,
        can_update: false,
        can_delete: false,
      };
    }

    const permissions = Object.entries(permissionMap).map(([entity, permission]) => ({ entity, ...permission }));
    return {
      ...input,
      permission_map: permissionMap,
      permissions,
    };
  }

  private mapLegacyRoleToSystemCode(role: unknown): SystemRoleTemplate['code'] {
    const normalized = this.normalizeRoleCode(role);
    if (normalized === 'ADMIN' || normalized === 'ADMINISTRATOR') return 'ADMIN';
    if (normalized === 'MANAGER' || normalized === 'GESTOR') return 'MANAGER';
    if (normalized === 'CUSTOMER' || normalized === 'CLIENTE') return 'CUSTOMER';
    return 'USER';
  }

  private getSystemTemplateByCode(code: string): SystemRoleTemplate | null {
    return this.systemRoleTemplates.find((item) => item.code === code) ?? null;
  }

  private isAdminLegacyRole(role: unknown): boolean {
    return this.mapLegacyRoleToSystemCode(role) === 'ADMIN';
  }

  private extractAuthUserContext(user: any): AccessUserContext {
    const tenantId = this.normalizeText(user?.tenant_id ?? user?.tenantId);
    const userId = this.normalizeText(user?.user_id ?? user?.userId ?? user?.id ?? user?.sub);
    const legacyRole = this.normalizeRoleCode(user?.role || 'USER');

    if (!tenantId || !userId) {
      throw new BadRequestException('Contexto de autenticacao incompleto (tenant_id / user_id).');
    }

    return { tenantId, userId, legacyRole };
  }

  private async getEnabledAreaSet(tenantId: string): Promise<Set<string>> {
    const areas = await this.tenantModulesResolverService.getEnabledAreas(tenantId);
    return new Set((areas || []).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean));
  }

  private async listAllowedEntities(tenantId: string): Promise<EntityRegistryItem[]> {
    const areaSet = await this.getEnabledAreaSet(tenantId);
    const byEntity = new Map<string, EntityRegistryItem>();

    ENTITY_REGISTRY.forEach((item) => {
      const entity = String(item.entity || '').trim().toLowerCase();
      if (!entity) return;
      if (!isEntityAllowedByModuleAreas(entity, areaSet)) return;
      byEntity.set(entity, {
        ...item,
        entity,
      });
    });

    try {
      const dynamic = await this.billingAreaEntityConfigService.listAvailableEntities();
      (dynamic || []).forEach((item: any) => {
        const entity = String(item?.name || '').trim().toLowerCase();
        if (!entity) return;
        if (entity.startsWith('access_')) return;
        if (!isEntityAllowedByModuleAreas(entity, areaSet)) return;
        if (byEntity.has(entity)) return;

        byEntity.set(entity, {
          entity,
          label: this.toEntityLabel(entity),
          route: '#',
          icon: 'fa-table',
          supportsCrud: true,
          allowOptionSetEditing: false,
        });
      });
    } catch {
      // If dynamic catalog fails, keep registry-only list.
    }

    return Array.from(byEntity.values()).sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));
  }

  private toEntityLabel(entity: string): string {
    return String(entity || '')
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private buildPermissionFromRow(row: any): CrudPermission {
    return {
      can_read: Boolean(row?.can_read),
      can_create: Boolean(row?.can_create),
      can_update: Boolean(row?.can_update),
      can_delete: Boolean(row?.can_delete),
    };
  }

  private normalizePermissionInput(input: Partial<CrudPermission> | null | undefined): CrudPermission {
    return {
      can_read: Boolean(input?.can_read),
      can_create: Boolean(input?.can_create),
      can_update: Boolean(input?.can_update),
      can_delete: Boolean(input?.can_delete),
    };
  }

  private permissionByAction(permission: CrudPermission | null, action: CrudAction): boolean {
    if (!permission) return false;
    if (action === 'READ') return permission.can_read;
    if (action === 'CREATE') return permission.can_create;
    if (action === 'UPDATE') return permission.can_update;
    if (action === 'DELETE') return permission.can_delete;
    return false;
  }

  private async getRoleByIdOrThrow(tenantId: string, roleId: string) {
    const row = await this.db.access_roles.findFirst({
      where: {
        id: roleId,
        tenant_id: tenantId,
        deleted_at: null,
      },
    });

    if (!row) throw new NotFoundException('Role nao encontrada.');
    return row;
  }

  private async ensureUserHasAtLeastOneRole(tenantId: string, userId: string, legacyRole: string): Promise<void> {
    const current = await this.db.access_user_roles.findMany({
      where: { tenant_id: tenantId, user_id: userId },
      take: 1,
    });

    if ((current || []).length > 0) return;

    const mappedCode = this.mapLegacyRoleToSystemCode(legacyRole);
    const role = await this.db.access_roles.findFirst({
      where: {
        tenant_id: tenantId,
        code: mappedCode,
        deleted_at: null,
        is_active: true,
      },
    });

    if (!role) return;

    await this.db.access_user_roles.create({
      data: {
        tenant_id: tenantId,
        user_id: userId,
        role_id: role.id,
      },
    });
  }

  async ensureTenantRoleBootstrap(tenantId: string, force = false): Promise<void> {
    const now = Date.now();
    const cachedAt = this.bootstrapCache.get(tenantId) ?? 0;
    if (!force && now - cachedAt < this.bootstrapCacheTtlMs) return;

    const entities = await this.listAllowedEntities(tenantId);
    const allowedEntityIds = entities.map((item) => item.entity);

    await this.db.$transaction(async (tx: any) => {
      const roles = await tx.access_roles.findMany({
        where: { tenant_id: tenantId, deleted_at: null },
      });
      const roleByCode = new Map<string, any>(
        (roles || []).map((role: any) => [String(role.code || '').toUpperCase(), role]),
      );

      for (const template of this.systemRoleTemplates) {
        if (roleByCode.has(template.code)) continue;
        const created = await tx.access_roles.create({
          data: {
            tenant_id: tenantId,
            code: template.code,
            name: template.name,
            description: template.description,
            is_system: true,
            is_active: true,
          },
        });
        roleByCode.set(template.code, created);
      }

      const allRoles = await tx.access_roles.findMany({
        where: { tenant_id: tenantId, deleted_at: null },
      });

      const permissions = await tx.access_role_permissions.findMany({
        where: { tenant_id: tenantId, entity: { in: allowedEntityIds } },
      });
      const permissionKeySet = new Set<string>(
        (permissions || []).map((row: any) => `${row.role_id}::${String(row.entity || '').toLowerCase()}`),
      );

      for (const role of allRoles || []) {
        const roleCode = String(role.code || '').toUpperCase();
        const template = this.getSystemTemplateByCode(roleCode);
        const defaultPermission = template?.defaultPermission ?? {
          can_read: false,
          can_create: false,
          can_update: false,
          can_delete: false,
        };

        for (const entity of allowedEntityIds) {
          const entityKey = `${role.id}::${String(entity).toLowerCase()}`;
          if (!permissionKeySet.has(entityKey)) {
            await tx.access_role_permissions.create({
              data: {
                tenant_id: tenantId,
                role_id: role.id,
                entity,
                ...defaultPermission,
              },
            });
            continue;
          }

          if (template?.lockPermissions === true) {
            await tx.access_role_permissions.updateMany({
              where: {
                tenant_id: tenantId,
                role_id: role.id,
                entity,
              },
              data: {
                can_read: true,
                can_create: true,
                can_update: true,
                can_delete: true,
                updated_at: new Date(),
              },
            });
          }
        }
      }
    });

    this.bootstrapCache.set(tenantId, Date.now());
  }

  async getEffectiveAccessForUser(input: { tenantId: string; userId: string; legacyRole?: string }): Promise<EffectiveAccess> {
    const tenantId = this.normalizeText(input.tenantId);
    const userId = this.normalizeText(input.userId);
    const legacyRole = this.normalizeRoleCode(input.legacyRole || 'USER');

    if (!tenantId || !userId) {
      throw new BadRequestException('tenantId e userId sao obrigatorios.');
    }

    await this.ensureTenantRoleBootstrap(tenantId);
    await this.ensureUserHasAtLeastOneRole(tenantId, userId, legacyRole);

    const entities = await this.listAllowedEntities(tenantId);
    const allowedEntitySet = new Set(entities.map((item) => String(item.entity).toLowerCase()));

    const roleLinks = await this.db.access_user_roles.findMany({
      where: { tenant_id: tenantId, user_id: userId },
      include: {
        role: {
          include: {
            permissions: true,
          },
        },
      },
    });

    const permissionMap: Record<string, CrudPermission> = {};
    entities.forEach((item) => {
      permissionMap[item.entity] = {
        can_read: false,
        can_create: false,
        can_update: false,
        can_delete: false,
      };
    });

    const roles: EffectiveRole[] = [];
    for (const link of roleLinks || []) {
      const role = link?.role;
      if (!role || role.is_active === false || role.deleted_at) continue;

      roles.push({
        id: String(role.id),
        code: String(role.code || '').toUpperCase(),
        name: String(role.name || ''),
        is_system: Boolean(role.is_system),
      });

      for (const permissionRow of role.permissions || []) {
        const entity = String(permissionRow?.entity || '').toLowerCase();
        if (!allowedEntitySet.has(entity)) continue;

        const current = permissionMap[entity] || {
          can_read: false,
          can_create: false,
          can_update: false,
          can_delete: false,
        };
        const next = this.buildPermissionFromRow(permissionRow);
        permissionMap[entity] = {
          can_read: current.can_read || next.can_read,
          can_create: current.can_create || next.can_create,
          can_update: current.can_update || next.can_update,
          can_delete: current.can_delete || next.can_delete,
        };
      }
    }

    const permissions = Object.entries(permissionMap).map(([entity, permission]) => ({ entity, ...permission }));
    return this.applyExternalReadOnlyOverrides({ roles, permissions, permission_map: permissionMap, entities });
  }

  async canUserPerform(input: {
    tenantId: string;
    userId: string;
    legacyRole?: string;
    resource: string;
    action: CrudAction;
    requestPath?: string;
  }): Promise<boolean> {
    const resource = String(input.resource || '').trim().toLowerCase();
    if (!resource) return true;

    // Documents listing/download remains tenant+company scoped in DocumentsController.
    // Keep READ universally available to avoid hard lockouts when role linkage is out of sync.
    if (resource === 'documents' && input.action === 'READ') {
      return true;
    }

    // Own profile endpoints should remain editable regardless of entity matrix.
    if (resource === 'users' && String(input.requestPath || '').includes('/users/me')) {
      return true;
    }

    const effective = await this.getEffectiveAccessForUser({
      tenantId: input.tenantId,
      userId: input.userId,
      legacyRole: input.legacyRole,
    });

    const externalProfile = this.getExternalProfile(effective.roles);
    if (externalProfile.isExternal) {
      if (externalProfile.isExternalManager && resource === 'documents' && input.action === 'CREATE') {
        return true;
      }
      if (!this.externalReadOnlyResources.has(resource)) return false;
      return input.action === 'READ';
    }

    return this.permissionByAction(effective.permission_map[resource] ?? null, input.action);
  }

  async getMeAccess(authUser: any) {
    const context = this.extractAuthUserContext(authUser);
    const effective = await this.getEffectiveAccessForUser({
      tenantId: context.tenantId,
      userId: context.userId,
      legacyRole: context.legacyRole,
    });

    return {
      tenant_id: context.tenantId,
      user_id: context.userId,
      legacy_role: context.legacyRole,
      roles: effective.roles,
      permissions: effective.permissions,
      permission_map: effective.permission_map,
      entities: effective.entities.map((item) => ({
        entity: item.entity,
        label: item.label,
        route: item.route,
        icon: item.icon,
      })),
    };
  }

  private assertAdmin(authUser: any): AccessUserContext {
    const context = this.extractAuthUserContext(authUser);
    if (!this.isAdminLegacyRole(context.legacyRole)) {
      throw new ForbiddenException('Somente ADMIN pode gerenciar roles e permissoes.');
    }
    return context;
  }

  async listEntities(authUser: any) {
    const context = this.assertAdmin(authUser);
    const entities = await this.listAllowedEntities(context.tenantId);
    return entities.map((item) => ({
      entity: item.entity,
      label: item.label,
      route: item.route,
      icon: item.icon,
    }));
  }

  async listRoles(authUser: any) {
    const context = this.assertAdmin(authUser);
    await this.ensureTenantRoleBootstrap(context.tenantId);

    const roles = await this.db.access_roles.findMany({
      where: {
        tenant_id: context.tenantId,
        deleted_at: null,
      },
      include: {
        _count: {
          select: {
            user_links: true,
            permissions: true,
          },
        },
      },
      orderBy: [{ is_system: 'desc' }, { name: 'asc' }],
    });

    return {
      items: (roles || []).map((role: any) => {
        const code = String(role.code || '').toUpperCase();
        const template = this.getSystemTemplateByCode(code);
        return {
          id: role.id,
          name: role.name,
          code,
          description: role.description,
          is_system: Boolean(role.is_system),
          is_active: Boolean(role.is_active),
          lock_permissions: template?.lockPermissions === true,
          user_count: Number(role?._count?.user_links || 0),
          permission_count: Number(role?._count?.permissions || 0),
          created_at: role.created_at,
          updated_at: role.updated_at,
        };
      }),
    };
  }

  async createRole(authUser: any, dto: CreateAccessRoleDto) {
    const context = this.assertAdmin(authUser);
    await this.ensureTenantRoleBootstrap(context.tenantId);

    const name = this.normalizeText(dto.name);
    const code = this.normalizeRoleCode(dto.code || dto.name, 'ROLE');
    if (!name) throw new BadRequestException('name e obrigatorio.');
    if (!code) throw new BadRequestException('code e obrigatorio.');

    const reserved = this.getSystemTemplateByCode(code);
    if (reserved) {
      throw new BadRequestException(`O code ${code} e reservado para role de sistema.`);
    }

    const exists = await this.db.access_roles.findFirst({
      where: {
        tenant_id: context.tenantId,
        code,
        deleted_at: null,
      },
    });
    if (exists) throw new BadRequestException('Ja existe uma role com esse code.');

    const created = await this.db.access_roles.create({
      data: {
        tenant_id: context.tenantId,
        name,
        code,
        description: this.normalizeText(dto.description) || null,
        is_system: false,
        is_active: dto.is_active === undefined ? true : Boolean(dto.is_active),
      },
    });

    const entities = await this.listAllowedEntities(context.tenantId);
    if (entities.length > 0) {
      await this.db.access_role_permissions.createMany({
        data: entities.map((entity) => ({
          tenant_id: context.tenantId,
          role_id: created.id,
          entity: entity.entity,
          can_read: false,
          can_create: false,
          can_update: false,
          can_delete: false,
        })),
        skipDuplicates: true,
      });
    }

    this.bootstrapCache.delete(context.tenantId);
    return created;
  }

  async updateRole(authUser: any, roleId: string, dto: UpdateAccessRoleDto) {
    const context = this.assertAdmin(authUser);
    const role = await this.getRoleByIdOrThrow(context.tenantId, roleId);
    const roleCode = String(role.code || '').toUpperCase();

    const payload: any = { updated_at: new Date() };
    if (dto.name !== undefined) payload.name = this.normalizeText(dto.name);
    if (dto.description !== undefined) payload.description = this.normalizeText(dto.description) || null;
    if (dto.is_active !== undefined) payload.is_active = Boolean(dto.is_active);

    if (dto.code !== undefined) {
      if (Boolean(role.is_system)) {
        throw new BadRequestException('Nao e permitido alterar code de role de sistema.');
      }
      const nextCode = this.normalizeRoleCode(dto.code, roleCode);
      if (this.getSystemTemplateByCode(nextCode)) {
        throw new BadRequestException(`O code ${nextCode} e reservado para role de sistema.`);
      }
      const codeExists = await this.db.access_roles.findFirst({
        where: {
          tenant_id: context.tenantId,
          code: nextCode,
          deleted_at: null,
          NOT: { id: role.id },
        },
      });
      if (codeExists) throw new BadRequestException('Ja existe outra role com esse code.');
      payload.code = nextCode;
    }

    if (Boolean(role.is_system) && roleCode === 'ADMIN' && payload.is_active === false) {
      throw new BadRequestException('A role ADMIN de sistema nao pode ser desativada.');
    }

    const updated = await this.db.access_roles.update({
      where: { id: role.id },
      data: payload,
    });

    this.bootstrapCache.delete(context.tenantId);
    return updated;
  }

  async deleteRole(authUser: any, roleId: string) {
    const context = this.assertAdmin(authUser);
    const role = await this.getRoleByIdOrThrow(context.tenantId, roleId);
    const roleCode = String(role.code || '').toUpperCase();

    if (Boolean(role.is_system) || this.getSystemTemplateByCode(roleCode)) {
      throw new BadRequestException('Nao e permitido remover roles de sistema.');
    }

    const assigned = await this.db.access_user_roles.findMany({
      where: { tenant_id: context.tenantId, role_id: role.id },
      take: 1,
    });
    if ((assigned || []).length > 0) {
      throw new BadRequestException('Esta role esta vinculada a usuarios. Remova os vinculos antes de excluir.');
    }

    await this.db.$transaction(async (tx: any) => {
      await tx.access_role_permissions.deleteMany({
        where: { tenant_id: context.tenantId, role_id: role.id },
      });
      await tx.access_roles.delete({ where: { id: role.id } });
    });

    this.bootstrapCache.delete(context.tenantId);
    return { ok: true };
  }

  async getRolePermissions(authUser: any, roleId: string) {
    const context = this.assertAdmin(authUser);
    await this.ensureTenantRoleBootstrap(context.tenantId);

    const role = await this.getRoleByIdOrThrow(context.tenantId, roleId);
    const roleCode = String(role.code || '').toUpperCase();
    const template = this.getSystemTemplateByCode(roleCode);
    const entities = await this.listAllowedEntities(context.tenantId);

    const rows = await this.db.access_role_permissions.findMany({
      where: {
        tenant_id: context.tenantId,
        role_id: role.id,
      },
    });
    const rowMap = new Map<string, any>(
      (rows || []).map((item: any) => [String(item.entity || '').toLowerCase(), item]),
    );

    return {
      role: {
        id: role.id,
        name: role.name,
        code: roleCode,
        is_system: Boolean(role.is_system),
        lock_permissions: template?.lockPermissions === true,
      },
      items: entities.map((entity) => {
        const row = rowMap.get(String(entity.entity).toLowerCase());
        const permission = row ? this.buildPermissionFromRow(row) : {
          can_read: false,
          can_create: false,
          can_update: false,
          can_delete: false,
        };
        return {
          entity: entity.entity,
          label: entity.label,
          route: entity.route,
          icon: entity.icon,
          ...permission,
        };
      }),
    };
  }

  async updateRolePermissions(authUser: any, roleId: string, dto: UpdateRolePermissionsDto) {
    const context = this.assertAdmin(authUser);
    await this.ensureTenantRoleBootstrap(context.tenantId);

    const role = await this.getRoleByIdOrThrow(context.tenantId, roleId);
    const roleCode = String(role.code || '').toUpperCase();
    const template = this.getSystemTemplateByCode(roleCode);
    if (template?.lockPermissions === true) {
      throw new BadRequestException('A role ADMIN possui permissao fixa (full).');
    }

    const entities = await this.listAllowedEntities(context.tenantId);
    const entitySet = new Set(entities.map((item) => String(item.entity).toLowerCase()));
    const requested = new Map<string, CrudPermission>();
    for (const row of dto.permissions || []) {
      const entity = String(row?.entity || '').toLowerCase();
      if (!entitySet.has(entity)) continue;
      requested.set(entity, this.normalizePermissionInput({
        can_read: row.can_read,
        can_create: row.can_create,
        can_update: row.can_update,
        can_delete: row.can_delete,
      }));
    }

    await this.db.$transaction(async (tx: any) => {
      for (const entity of entitySet) {
        const next = requested.get(entity) ?? {
          can_read: false,
          can_create: false,
          can_update: false,
          can_delete: false,
        };
        await tx.access_role_permissions.upsert({
          where: {
            tenant_id_role_id_entity: {
              tenant_id: context.tenantId,
              role_id: role.id,
              entity,
            },
          },
          update: {
            ...next,
            updated_at: new Date(),
          },
          create: {
            tenant_id: context.tenantId,
            role_id: role.id,
            entity,
            ...next,
          },
        });
      }
    });

    return this.getRolePermissions(authUser, roleId);
  }

  async listUsers(authUser: any, query: ListAccessUsersQueryDto) {
    const context = this.assertAdmin(authUser);
    await this.ensureTenantRoleBootstrap(context.tenantId);

    const where: Prisma.usersWhereInput = {
      tenant_id: context.tenantId,
    } as any;

    const q = this.normalizeText(query?.q);
    if (q) {
      (where as any).OR = [
        { full_name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    const rows = await this.db.users.findMany({
      where,
      take: Number(query?.limit) > 0 ? Number(query?.limit) : 200,
      orderBy: [{ full_name: 'asc' }],
      select: {
        id: true,
        full_name: true,
        email: true,
        status: true,
        role: true,
        access_role_links: {
          include: {
            role: {
              select: {
                id: true,
                name: true,
                code: true,
                is_system: true,
                is_active: true,
              },
            },
          },
        },
      },
    });

    for (const row of rows || []) {
      await this.ensureUserHasAtLeastOneRole(context.tenantId, String(row.id), String(row.role || 'USER'));
    }

    const rowsWithRoles = await this.db.users.findMany({
      where,
      take: Number(query?.limit) > 0 ? Number(query?.limit) : 200,
      orderBy: [{ full_name: 'asc' }],
      select: {
        id: true,
        full_name: true,
        email: true,
        status: true,
        role: true,
        access_role_links: {
          include: {
            role: {
              select: {
                id: true,
                name: true,
                code: true,
                is_system: true,
                is_active: true,
              },
            },
          },
        },
      },
    });

    return {
      items: (rowsWithRoles || []).map((row: any) => ({
        id: row.id,
        full_name: row.full_name,
        email: row.email,
        status: row.status,
        legacy_role: row.role,
        roles: (row.access_role_links || [])
          .map((link: any) => link.role)
          .filter(Boolean)
          .map((role: any) => ({
            id: role.id,
            name: role.name,
            code: String(role.code || '').toUpperCase(),
            is_system: Boolean(role.is_system),
            is_active: Boolean(role.is_active),
          })),
      })),
    };
  }

  async getUserRoles(authUser: any, userId: string) {
    const context = this.assertAdmin(authUser);
    await this.ensureTenantRoleBootstrap(context.tenantId);

    const user = await this.db.users.findFirst({
      where: { id: userId, tenant_id: context.tenantId },
      select: {
        id: true,
        full_name: true,
        email: true,
        status: true,
        role: true,
      },
    });
    if (!user) throw new NotFoundException('Usuario nao encontrado.');

    await this.ensureUserHasAtLeastOneRole(context.tenantId, userId, String(user.role || 'USER'));

    const roles = await this.db.access_roles.findMany({
      where: {
        tenant_id: context.tenantId,
        deleted_at: null,
      },
      orderBy: [{ is_system: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        code: true,
        is_system: true,
        is_active: true,
      },
    });

    const links = await this.db.access_user_roles.findMany({
      where: { tenant_id: context.tenantId, user_id: userId },
      select: { role_id: true },
    });
    const selectedRoleIds = new Set((links || []).map((item: any) => String(item.role_id)));

    return {
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        status: user.status,
        legacy_role: user.role,
      },
      roles: (roles || []).map((role: any) => ({
        id: role.id,
        name: role.name,
        code: String(role.code || '').toUpperCase(),
        is_system: Boolean(role.is_system),
        is_active: Boolean(role.is_active),
        selected: selectedRoleIds.has(String(role.id)),
      })),
    };
  }

  async updateUserRoles(authUser: any, userId: string, dto: UpdateUserRolesDto) {
    const context = this.assertAdmin(authUser);
    await this.ensureTenantRoleBootstrap(context.tenantId);

    const user = await this.db.users.findFirst({
      where: { id: userId, tenant_id: context.tenantId },
      select: { id: true, role: true },
    });
    if (!user) throw new NotFoundException('Usuario nao encontrado.');

    const roleIds = Array.from(new Set((dto.role_ids || []).map((item) => String(item).trim()).filter(Boolean)));
    if (roleIds.length === 0) {
      throw new BadRequestException('Pelo menos uma role deve ser selecionada.');
    }

    const roles = await this.db.access_roles.findMany({
      where: {
        tenant_id: context.tenantId,
        id: { in: roleIds },
        deleted_at: null,
        is_active: true,
      },
      select: { id: true, code: true, is_active: true },
    });

    if ((roles || []).length !== roleIds.length) {
      throw new BadRequestException('Uma ou mais roles selecionadas sao invalidas.');
    }

    const selectedCodes = new Set((roles || []).map((item: any) => String(item.code || '').toUpperCase()));
    const nextLegacyRole =
      selectedCodes.has('ADMIN')
        ? 'ADMIN'
        : selectedCodes.has('MANAGER')
          ? 'MANAGER'
          : selectedCodes.has('CUSTOMER')
            ? 'CUSTOMER'
            : 'USER';

    await this.db.$transaction(async (tx: any) => {
      await tx.access_user_roles.deleteMany({
        where: {
          tenant_id: context.tenantId,
          user_id: userId,
        },
      });

      await tx.access_user_roles.createMany({
        data: roleIds.map((roleId) => ({
          tenant_id: context.tenantId,
          user_id: userId,
          role_id: roleId,
        })),
      });

      await tx.users.update({
        where: { id: userId },
        data: { role: nextLegacyRole },
      });
    });

    return this.getUserRoles(authUser, userId);
  }
}
