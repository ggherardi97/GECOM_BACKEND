import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FieldPermission, MetadataMaskMode } from './metadata-designer.types';
import { isAdminRole, normalizeText } from './metadata-designer.helpers';

type FieldRow = { id: string };
type DefaultRow = {
  default_can_view: boolean;
  default_can_read: boolean;
  default_can_edit: boolean;
  default_mask_mode: MetadataMaskMode;
};
type RuleRow = {
  field_id: string;
  can_view: boolean;
  can_read: boolean;
  can_edit: boolean;
  mask_mode: MetadataMaskMode;
  priority: number;
};

@Injectable()
export class FieldSecurityResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForUser(tenantId: string, userId: string, entityId: string): Promise<Record<string, FieldPermission>> {
    const fields = await this.prisma.raw.$queryRaw<FieldRow[]>(
      Prisma.sql`
        SELECT "id"
        FROM "metadata_fields"
        WHERE "tenant_id" = ${tenantId}::uuid
          AND "entity_id" = ${entityId}::uuid
          AND "is_active" = true
      `,
    );

    const fieldIds = fields.map((field) => normalizeText(field.id)).filter(Boolean);
    if (!fieldIds.length) return {};

    const isAdmin = await this.isAdminUser(tenantId, userId);
    if (isAdmin) {
      return fieldIds.reduce(
        (acc, fieldId) => {
          acc[fieldId] = {
            can_view: true,
            can_read: true,
            can_edit: true,
            mask_mode: 'NONE',
            read_only: false,
          };
          return acc;
        },
        {} as Record<string, FieldPermission>,
      );
    }

    const defaults = await this.resolveDefaults(tenantId, entityId);

    const userRules = await this.prisma.raw.$queryRaw<RuleRow[]>(
      Prisma.sql`
        SELECT
          "field_id",
          "can_view",
          "can_read",
          "can_edit",
          "mask_mode",
          "priority"
        FROM "metadata_field_security_rules"
        WHERE "tenant_id" = ${tenantId}::uuid
          AND "principal_type" = 'USER'
          AND "principal_id" = ${userId}
          AND "field_id" IN (${Prisma.join(fieldIds)})
        ORDER BY "priority" ASC, "created_at" ASC
      `,
    );

    const roleIds = await this.getUserRoleIds(tenantId, userId);
    let roleRules: RuleRow[] = [];
    if (roleIds.length) {
      roleRules = await this.prisma.raw.$queryRaw<RuleRow[]>(
        Prisma.sql`
          SELECT
            "field_id",
            "can_view",
            "can_read",
            "can_edit",
            "mask_mode",
            "priority"
          FROM "metadata_field_security_rules"
          WHERE "tenant_id" = ${tenantId}::uuid
            AND "principal_type" = 'ROLE'
            AND "principal_id" IN (${Prisma.join(roleIds)})
            AND "field_id" IN (${Prisma.join(fieldIds)})
          ORDER BY "priority" ASC, "created_at" ASC
        `,
      );
    }

    const byUserField = new Map<string, RuleRow>();
    for (const row of userRules) {
      const fieldId = normalizeText(row.field_id);
      if (!fieldId || byUserField.has(fieldId)) continue;
      byUserField.set(fieldId, row);
    }

    const byRoleField = new Map<string, RuleRow>();
    for (const row of roleRules) {
      const fieldId = normalizeText(row.field_id);
      if (!fieldId || byRoleField.has(fieldId)) continue;
      byRoleField.set(fieldId, row);
    }

    const result: Record<string, FieldPermission> = {};
    for (const fieldId of fieldIds) {
      const selectedRule = byUserField.get(fieldId) || byRoleField.get(fieldId);
      const base = selectedRule
        ? {
            can_view: Boolean(selectedRule.can_view),
            can_read: Boolean(selectedRule.can_read),
            can_edit: Boolean(selectedRule.can_edit),
            mask_mode: this.normalizeMaskMode(selectedRule.mask_mode, defaults.default_mask_mode),
          }
        : { ...defaults };

      result[fieldId] = this.normalizePermission(base);
    }

    return result;
  }

  applyMask(maskMode: MetadataMaskMode): string {
    if (maskMode === 'STARS') return '•••••';
    if (maskMode === 'HIDDEN_TEXT') return 'Sem permissão';
    return '';
  }

  private normalizePermission(permission: {
    can_view: boolean;
    can_read: boolean;
    can_edit: boolean;
    mask_mode: MetadataMaskMode;
  }): FieldPermission {
    const canView = Boolean(permission.can_view);
    const canRead = canView && Boolean(permission.can_read);
    const canEdit = canRead && Boolean(permission.can_edit);
    return {
      can_view: canView,
      can_read: canRead,
      can_edit: canEdit,
      mask_mode: this.normalizeMaskMode(permission.mask_mode, 'HIDDEN_TEXT'),
      read_only: !canEdit,
    };
  }

  private async resolveDefaults(
    tenantId: string,
    entityId: string,
  ): Promise<{
    can_view: boolean;
    can_read: boolean;
    can_edit: boolean;
    mask_mode: MetadataMaskMode;
    default_mask_mode: MetadataMaskMode;
  }> {
    const entityRows = await this.prisma.raw.$queryRaw<DefaultRow[]>(
      Prisma.sql`
        SELECT
          "default_can_view",
          "default_can_read",
          "default_can_edit",
          "default_mask_mode"
        FROM "metadata_field_security_defaults"
        WHERE "tenant_id" = ${tenantId}::uuid
          AND "entity_id" = ${entityId}::uuid
        LIMIT 1
      `,
    );

    const globalRows = await this.prisma.raw.$queryRaw<DefaultRow[]>(
      Prisma.sql`
        SELECT
          "default_can_view",
          "default_can_read",
          "default_can_edit",
          "default_mask_mode"
        FROM "metadata_field_security_defaults"
        WHERE "tenant_id" = ${tenantId}::uuid
          AND "entity_id" IS NULL
        LIMIT 1
      `,
    );

    const source = entityRows[0] || globalRows[0];

    const can_view = source ? Boolean(source.default_can_view) : true;
    const can_read = source ? Boolean(source.default_can_read) : true;
    const can_edit = source ? Boolean(source.default_can_edit) : false;
    const mask_mode = this.normalizeMaskMode(source?.default_mask_mode, 'HIDDEN_TEXT');

    return {
      can_view,
      can_read,
      can_edit,
      mask_mode,
      default_mask_mode: mask_mode,
    };
  }

  private normalizeMaskMode(value: unknown, fallback: MetadataMaskMode): MetadataMaskMode {
    const normalized = normalizeText(value).toUpperCase();
    if (normalized === 'NONE') return 'NONE';
    if (normalized === 'STARS') return 'STARS';
    if (normalized === 'HIDDEN_TEXT') return 'HIDDEN_TEXT';
    return fallback;
  }

  private async isAdminUser(tenantId: string, userId: string): Promise<boolean> {
    const userRows = await this.prisma.raw.$queryRaw<Array<{ role: string | null }>>(
      Prisma.sql`
        SELECT "role"
        FROM "users"
        WHERE "tenant_id" = ${tenantId}::uuid
          AND "id" = ${userId}::uuid
        LIMIT 1
      `,
    );
    if (isAdminRole(userRows[0]?.role)) return true;

    const roleRows = await this.prisma.raw.$queryRaw<Array<{ code: string | null }>>(
      Prisma.sql`
        SELECT r."code"
        FROM "access_user_roles" ur
        JOIN "access_roles" r ON r."id" = ur."role_id"
        WHERE ur."tenant_id" = ${tenantId}::uuid
          AND ur."user_id" = ${userId}
          AND r."deleted_at" IS NULL
          AND r."is_active" = true
      `,
    );

    return roleRows.some((row) => isAdminRole(row.code));
  }

  private async getUserRoleIds(tenantId: string, userId: string): Promise<string[]> {
    const rows = await this.prisma.raw.$queryRaw<Array<{ role_id: string }>>(
      Prisma.sql`
        SELECT ur."role_id"
        FROM "access_user_roles" ur
        JOIN "access_roles" r ON r."id" = ur."role_id"
        WHERE ur."tenant_id" = ${tenantId}::uuid
          AND ur."user_id" = ${userId}
          AND r."deleted_at" IS NULL
          AND r."is_active" = true
      `,
    );

    return rows
      .map((row) => normalizeText(row.role_id))
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index);
  }
}

