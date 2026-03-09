import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMetadataFieldDto } from './dto/create-metadata-field.dto';
import { UpdateMetadataFieldDto } from './dto/update-metadata-field.dto';
import { FieldSecurityResolverService } from './field-security-resolver.service';
import { MetadataEntitiesService } from './metadata-entities.service';
import { MetadataGuardService } from './metadata-guard.service';
import {
  ensureSafeIdentifier,
  normalizeDataType,
  normalizeIdentifier,
  normalizeText,
  toPtBrLabel,
} from './metadata-designer.helpers';
import { MetadataAuthUser, MetadataFieldDataType } from './metadata-designer.types';

type FieldRow = {
  id: string;
  tenant_id: string;
  entity_id: string;
  name: string;
  display_name: string;
  data_type: MetadataFieldDataType;
  is_required: boolean;
  is_unique: boolean;
  default_value: string | null;
  format_json: any;
  lookup_entity_id: string | null;
  lookup_on_delete: string | null;
  column_name: string;
  source: 'SYSTEM' | 'CORE_EXISTING' | 'DESIGNER';
  is_system: boolean;
  is_active: boolean;
  draft_version: number;
  published_version: number | null;
  created_at: Date;
  updated_at: Date;
  entity_name: string;
  entity_display_name: string;
};

@Injectable()
export class MetadataFieldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitiesService: MetadataEntitiesService,
    private readonly guardService: MetadataGuardService,
    private readonly fieldSecurityResolverService: FieldSecurityResolverService,
  ) {}

  async listByEntity(user: MetadataAuthUser, entityId: string, includeInactive = false) {
    const entity = await this.entitiesService.getByIdOrThrow(user.tenant_id, entityId);
    const fields = await this.prisma.raw.$queryRaw<FieldRow[]>(
      Prisma.sql`
        SELECT
          f.*,
          e."name" AS "entity_name",
          e."display_name" AS "entity_display_name"
        FROM "metadata_fields" f
        JOIN "metadata_entities" e ON e."id" = f."entity_id"
        WHERE f."tenant_id" = ${user.tenant_id}::uuid
          AND f."entity_id" = ${entity.id}::uuid
          ${includeInactive ? Prisma.sql`` : Prisma.sql`AND f."is_active" = true`}
        ORDER BY f."is_system" DESC, f."display_name" ASC, f."name" ASC
      `,
    );

    const permissions = await this.fieldSecurityResolverService.resolveForUser(user.tenant_id, user.id, entity.id);
    return fields
      .map((field) => {
        const security = permissions[field.id] || {
          can_view: true,
          can_read: true,
          can_edit: true,
          read_only: false,
          mask_mode: 'NONE',
        };
        return {
          ...field,
          read_only: !security.can_edit,
          security,
        };
      })
      .filter((field) => Boolean(field.security?.can_view));
  }

  async create(user: MetadataAuthUser, entityId: string, dto: CreateMetadataFieldDto) {
    const entity = await this.entitiesService.getByIdOrThrow(user.tenant_id, entityId);
    const guard = await this.guardService.getGuard(user.tenant_id, entity.name);

    if (!entity.is_field_editable) {
      throw new ForbiddenException('Field editing is disabled for this entity.');
    }
    this.guardService.assertAllowedByGuard(guard, 'field', 'Field editing is blocked for this entity.');

    const name = ensureSafeIdentifier(normalizeIdentifier(dto.name, 'field'), 'name');
    const dataType = normalizeDataType(dto.data_type);
    const columnName = ensureSafeIdentifier(
      normalizeIdentifier(dto.column_name || (dataType === 'LOOKUP' ? `${name}_id` : name), name),
      'column_name',
    );

    const lookupEntityId = normalizeText(dto.lookup_entity_id) || null;
    const lookupOnDelete = normalizeText(dto.lookup_on_delete).toUpperCase() || null;
    if (dataType === 'LOOKUP' && !lookupEntityId) {
      throw new BadRequestException('lookup_entity_id is required for LOOKUP fields.');
    }

    if (lookupEntityId) {
      const lookupEntity = await this.prisma.raw.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT "id"
          FROM "metadata_entities"
          WHERE "tenant_id" = ${user.tenant_id}::uuid
            AND "id" = ${lookupEntityId}::uuid
            AND "is_active" = true
          LIMIT 1
        `,
      );
      if (!lookupEntity[0]) {
        throw new BadRequestException('lookup_entity_id does not belong to this tenant.');
      }
    }

    const displayName = normalizeText(dto.display_name) || toPtBrLabel(name);

    const rows = await this.prisma.raw.$queryRaw<FieldRow[]>(
      Prisma.sql`
        INSERT INTO "metadata_fields" (
          "tenant_id",
          "entity_id",
          "name",
          "display_name",
          "data_type",
          "is_required",
          "is_unique",
          "default_value",
          "format_json",
          "lookup_entity_id",
          "lookup_on_delete",
          "column_name",
          "source",
          "is_system",
          "is_active",
          "draft_version"
        )
        VALUES (
          ${user.tenant_id}::uuid,
          ${entity.id}::uuid,
          ${name},
          ${displayName},
          ${dataType}::metadata_field_data_type_enum,
          ${Boolean(dto.is_required)},
          ${Boolean(dto.is_unique)},
          ${normalizeText(dto.default_value) || null},
          ${dto.format_json ? JSON.stringify(dto.format_json) : null}::jsonb,
          ${lookupEntityId}::uuid,
          ${lookupOnDelete || null}::metadata_lookup_on_delete_enum,
          ${columnName},
          'DESIGNER',
          ${Boolean(dto.is_system)},
          ${dto.is_active === undefined ? true : Boolean(dto.is_active)},
          ${dto.draft_version || 1}
        )
        RETURNING *
      `,
    );

    await this.entitiesService.bumpDraftVersion(user.tenant_id, entity.id);
    return rows[0] || null;
  }

  async update(user: MetadataAuthUser, fieldId: string, dto: UpdateMetadataFieldDto) {
    const field = await this.getFieldByIdOrThrow(user.tenant_id, fieldId);
    const guard = await this.guardService.getGuard(user.tenant_id, field.entity_name);

    if (!field.is_active) {
      throw new BadRequestException('Cannot update an inactive field.');
    }
    if (field.source === 'SYSTEM') {
      throw new ForbiddenException('System fields cannot be edited.');
    }
    if (!field.entity_id) {
      throw new BadRequestException('Field has no entity relation.');
    }

    this.guardService.assertAllowedByGuard(guard, 'field', 'Field editing is blocked for this entity.');

    const entity = await this.entitiesService.getByIdOrThrow(user.tenant_id, field.entity_id);
    if (!entity.is_field_editable) {
      throw new ForbiddenException('Field editing is disabled for this entity.');
    }

    const sets: Prisma.Sql[] = [];
    if (dto.display_name !== undefined) sets.push(Prisma.sql`"display_name" = ${normalizeText(dto.display_name)}`);
    if (dto.data_type !== undefined) sets.push(Prisma.sql`"data_type" = ${normalizeDataType(dto.data_type)}::metadata_field_data_type_enum`);
    if (dto.is_required !== undefined) sets.push(Prisma.sql`"is_required" = ${Boolean(dto.is_required)}`);
    if (dto.is_unique !== undefined) sets.push(Prisma.sql`"is_unique" = ${Boolean(dto.is_unique)}`);
    if (dto.default_value !== undefined) sets.push(Prisma.sql`"default_value" = ${normalizeText(dto.default_value) || null}`);
    if (dto.format_json !== undefined) sets.push(Prisma.sql`"format_json" = ${dto.format_json ? JSON.stringify(dto.format_json) : null}::jsonb`);
    if (dto.lookup_entity_id !== undefined) sets.push(Prisma.sql`"lookup_entity_id" = ${normalizeText(dto.lookup_entity_id) || null}::uuid`);
    if (dto.lookup_on_delete !== undefined) sets.push(Prisma.sql`"lookup_on_delete" = ${normalizeText(dto.lookup_on_delete).toUpperCase() || null}::metadata_lookup_on_delete_enum`);
    if (dto.is_active !== undefined) sets.push(Prisma.sql`"is_active" = ${Boolean(dto.is_active)}`);
    sets.push(Prisma.sql`"draft_version" = "draft_version" + 1`);
    sets.push(Prisma.sql`"updated_at" = now()`);

    const rows = await this.prisma.raw.$queryRaw<FieldRow[]>(
      Prisma.sql`
        UPDATE "metadata_fields"
        SET ${Prisma.join(sets, ', ')}
        WHERE "tenant_id" = ${user.tenant_id}::uuid
          AND "id" = ${field.id}::uuid
        RETURNING *
      `,
    );

    await this.entitiesService.bumpDraftVersion(user.tenant_id, field.entity_id);
    return rows[0] || null;
  }

  async softDelete(user: MetadataAuthUser, fieldId: string) {
    const field = await this.getFieldByIdOrThrow(user.tenant_id, fieldId);
    const guard = await this.guardService.getGuard(user.tenant_id, field.entity_name);
    this.guardService.assertAllowedByGuard(guard, 'field', 'Field editing is blocked for this entity.');

    if (field.source === 'SYSTEM') {
      throw new ForbiddenException('System fields cannot be removed.');
    }

    await this.prisma.raw.$executeRaw(
      Prisma.sql`
        UPDATE "metadata_fields"
        SET
          "is_active" = false,
          "draft_version" = "draft_version" + 1,
          "updated_at" = now()
        WHERE "tenant_id" = ${user.tenant_id}::uuid
          AND "id" = ${field.id}::uuid
      `,
    );

    await this.entitiesService.bumpDraftVersion(user.tenant_id, field.entity_id);
    return { ok: true };
  }

  async getFieldByIdOrThrow(tenantId: string, fieldId: string): Promise<FieldRow> {
    const normalizedFieldId = normalizeText(fieldId);
    if (!normalizedFieldId) throw new BadRequestException('field id is required.');

    const rows = await this.prisma.raw.$queryRaw<FieldRow[]>(
      Prisma.sql`
        SELECT
          f.*,
          e."name" AS "entity_name",
          e."display_name" AS "entity_display_name"
        FROM "metadata_fields" f
        JOIN "metadata_entities" e ON e."id" = f."entity_id"
        WHERE f."tenant_id" = ${tenantId}::uuid
          AND f."id" = ${normalizedFieldId}::uuid
        LIMIT 1
      `,
    );

    if (!rows[0]) {
      throw new NotFoundException('Metadata field not found.');
    }
    return rows[0];
  }
}
