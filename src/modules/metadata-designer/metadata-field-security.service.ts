import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSecurityProfileDto } from './dto/create-security-profile.dto';
import { UpdateSecurityProfileDto } from './dto/update-security-profile.dto';
import { UpsertFieldSecurityDto } from './dto/upsert-field-security.dto';
import {
  clampPriority,
  normalizeMaskMode,
  normalizePrincipalType,
  normalizeText,
} from './metadata-designer.helpers';
import { MetadataAuthUser, MetadataMaskMode } from './metadata-designer.types';

type MetadataFieldRow = {
  id: string;
  entity_id: string;
};

type SecurityDefaultRow = Record<string, any>;
type SecurityRuleRow = Record<string, any>;
type SecurityProfileRow = Record<string, any>;

@Injectable()
export class MetadataFieldSecurityService {
  constructor(private readonly prisma: PrismaService) {}

  async getFieldSecurity(user: MetadataAuthUser, fieldId: string) {
    const field = await this.getFieldOrThrow(user.tenant_id, fieldId);

    const [rules, entityDefaultRows, globalDefaultRows, profiles] = await Promise.all([
      this.prisma.raw.$queryRaw<SecurityRuleRow[]>(
        Prisma.sql`
          SELECT
            "id",
            "field_id",
            "profile_id",
            "principal_type",
            "principal_id",
            "can_view",
            "can_read",
            "can_edit",
            "mask_mode",
            "priority",
            "created_at",
            "updated_at"
          FROM "metadata_field_security_rules"
          WHERE "tenant_id" = ${user.tenant_id}::uuid
            AND "field_id" = ${field.id}::uuid
          ORDER BY "priority" ASC, "created_at" ASC
        `,
      ),
      this.prisma.raw.$queryRaw<SecurityDefaultRow[]>(
        Prisma.sql`
          SELECT *
          FROM "metadata_field_security_defaults"
          WHERE "tenant_id" = ${user.tenant_id}::uuid
            AND "entity_id" = ${field.entity_id}::uuid
          LIMIT 1
        `,
      ),
      this.prisma.raw.$queryRaw<SecurityDefaultRow[]>(
        Prisma.sql`
          SELECT *
          FROM "metadata_field_security_defaults"
          WHERE "tenant_id" = ${user.tenant_id}::uuid
            AND "entity_id" IS NULL
          LIMIT 1
        `,
      ),
      this.listProfiles(user),
    ]);

    return {
      field_id: field.id,
      entity_id: field.entity_id,
      rules: Array.isArray(rules) ? rules : [],
      defaults: {
        entity: entityDefaultRows?.[0] || null,
        global: globalDefaultRows?.[0] || null,
      },
      profiles: profiles.items,
    };
  }

  async upsertFieldSecurity(user: MetadataAuthUser, fieldId: string, dto: UpsertFieldSecurityDto) {
    const field = await this.getFieldOrThrow(user.tenant_id, fieldId);
    const rules = Array.isArray(dto.rules) ? dto.rules : [];

    await this.prisma.raw.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`
          DELETE FROM "metadata_field_security_rules"
          WHERE "tenant_id" = ${user.tenant_id}::uuid
            AND "field_id" = ${field.id}::uuid
        `,
      );

      for (const row of rules) {
        const principalType = normalizePrincipalType(row.principal_type);
        const principalId = normalizeText(row.principal_id);
        if (!principalId) {
          throw new BadRequestException('principal_id is required in security rules.');
        }

        const profileId = normalizeText(row.profile_id);
        const canView = row.can_view === undefined ? true : Boolean(row.can_view);
        const canRead = row.can_read === undefined ? true : Boolean(row.can_read);
        const canEdit = row.can_edit === undefined ? false : Boolean(row.can_edit);
        const maskMode = normalizeMaskMode(row.mask_mode, 'NONE');
        const priority = clampPriority(row.priority, 100);

        await tx.$executeRaw(
          Prisma.sql`
            INSERT INTO "metadata_field_security_rules" (
              "tenant_id",
              "field_id",
              "profile_id",
              "principal_type",
              "principal_id",
              "can_view",
              "can_read",
              "can_edit",
              "mask_mode",
              "priority"
            )
            VALUES (
              ${user.tenant_id}::uuid,
              ${field.id}::uuid,
              ${profileId || null}::uuid,
              ${principalType}::metadata_security_principal_type_enum,
              ${principalId}::uuid,
              ${canView},
              ${canRead},
              ${canEdit},
              ${maskMode}::metadata_mask_mode_enum,
              ${priority}
            )
          `,
        );
      }

      if (dto.defaults) {
        const targetEntityId = normalizeText(dto.defaults.entity_id);
        const defaultCanView = dto.defaults.default_can_view === undefined ? true : Boolean(dto.defaults.default_can_view);
        const defaultCanRead = dto.defaults.default_can_read === undefined ? true : Boolean(dto.defaults.default_can_read);
        const defaultCanEdit = dto.defaults.default_can_edit === undefined ? false : Boolean(dto.defaults.default_can_edit);
        const defaultMaskMode = normalizeMaskMode(dto.defaults.default_mask_mode, 'HIDDEN_TEXT');

        const existingDefaultRows = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            SELECT "id"
            FROM "metadata_field_security_defaults"
            WHERE "tenant_id" = ${user.tenant_id}::uuid
              AND (
                (${targetEntityId || null}::uuid IS NULL AND "entity_id" IS NULL)
                OR "entity_id" = ${targetEntityId || null}::uuid
              )
            LIMIT 1
          `,
        );

        if (existingDefaultRows[0]?.id) {
          await tx.$executeRaw(
            Prisma.sql`
              UPDATE "metadata_field_security_defaults"
              SET
                "default_can_view" = ${defaultCanView},
                "default_can_read" = ${defaultCanRead},
                "default_can_edit" = ${defaultCanEdit},
                "default_mask_mode" = ${defaultMaskMode}::metadata_mask_mode_enum,
                "updated_at" = now()
              WHERE "id" = ${existingDefaultRows[0].id}::uuid
            `,
          );
        } else {
          await tx.$executeRaw(
            Prisma.sql`
              INSERT INTO "metadata_field_security_defaults" (
                "tenant_id",
                "entity_id",
                "default_can_view",
                "default_can_read",
                "default_can_edit",
                "default_mask_mode"
              )
              VALUES (
                ${user.tenant_id}::uuid,
                ${targetEntityId || null}::uuid,
                ${defaultCanView},
                ${defaultCanRead},
                ${defaultCanEdit},
                ${defaultMaskMode}::metadata_mask_mode_enum
              )
            `,
          );
        }
      }
    });

    return this.getFieldSecurity(user, field.id);
  }

  async listProfiles(user: MetadataAuthUser) {
    const rows = await this.prisma.raw.$queryRaw<SecurityProfileRow[]>(
      Prisma.sql`
        SELECT *
        FROM "metadata_field_security_profiles"
        WHERE "tenant_id" = ${user.tenant_id}::uuid
        ORDER BY "name" ASC
      `,
    );

    return { items: Array.isArray(rows) ? rows : [] };
  }

  async createProfile(user: MetadataAuthUser, dto: CreateSecurityProfileDto) {
    const name = normalizeText(dto.name);
    if (!name) throw new BadRequestException('name is required.');

    const rows = await this.prisma.raw.$queryRaw<SecurityProfileRow[]>(
      Prisma.sql`
        INSERT INTO "metadata_field_security_profiles" (
          "tenant_id",
          "name",
          "description",
          "is_active"
        )
        VALUES (
          ${user.tenant_id}::uuid,
          ${name},
          ${normalizeText(dto.description) || null},
          ${dto.is_active === undefined ? true : Boolean(dto.is_active)}
        )
        RETURNING *
      `,
    );

    return rows?.[0] || null;
  }

  async updateProfile(user: MetadataAuthUser, profileId: string, dto: UpdateSecurityProfileDto) {
    const id = normalizeText(profileId);
    if (!id) throw new BadRequestException('profileId is required.');

    const exists = await this.prisma.raw.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT "id"
        FROM "metadata_field_security_profiles"
        WHERE "tenant_id" = ${user.tenant_id}::uuid
          AND "id" = ${id}::uuid
        LIMIT 1
      `,
    );
    if (!exists[0]) throw new NotFoundException('Security profile not found.');

    const payload: Record<string, unknown> = {
      updated_at: new Date(),
    };
    if (dto.name !== undefined) payload.name = normalizeText(dto.name);
    if (dto.description !== undefined) payload.description = normalizeText(dto.description) || null;
    if (dto.is_active !== undefined) payload.is_active = Boolean(dto.is_active);

    const sets: Prisma.Sql[] = [];
    if (dto.name !== undefined) sets.push(Prisma.sql`"name" = ${String(payload.name || '')}`);
    if (dto.description !== undefined) sets.push(Prisma.sql`"description" = ${payload.description as string | null}`);
    if (dto.is_active !== undefined) sets.push(Prisma.sql`"is_active" = ${Boolean(payload.is_active)}`);
    sets.push(Prisma.sql`"updated_at" = now()`);

    const rows = await this.prisma.raw.$queryRaw<SecurityProfileRow[]>(
      Prisma.sql`
        UPDATE "metadata_field_security_profiles"
        SET ${Prisma.join(sets, ', ')}
        WHERE "tenant_id" = ${user.tenant_id}::uuid
          AND "id" = ${id}::uuid
        RETURNING *
      `,
    );

    return rows?.[0] || null;
  }

  private async getFieldOrThrow(tenantId: string, fieldId: string): Promise<MetadataFieldRow> {
    const normalizedId = normalizeText(fieldId);
    if (!normalizedId) {
      throw new BadRequestException('fieldId is required.');
    }

    const rows = await this.prisma.raw.$queryRaw<MetadataFieldRow[]>(
      Prisma.sql`
        SELECT "id", "entity_id"
        FROM "metadata_fields"
        WHERE "tenant_id" = ${tenantId}::uuid
          AND "id" = ${normalizedId}::uuid
        LIMIT 1
      `,
    );

    if (!rows[0]) {
      throw new NotFoundException('Metadata field not found.');
    }

    return rows[0];
  }

  resolveMaskedValue(maskMode: MetadataMaskMode): string {
    if (maskMode === 'STARS') return '•••••';
    if (maskMode === 'HIDDEN_TEXT') return 'Sem permissão';
    return '';
  }
}


