import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMetadataEntityDto } from './dto/create-metadata-entity.dto';
import { UpdateMetadataEntityDto } from './dto/update-metadata-entity.dto';
import {
  ensureSafeIdentifier,
  normalizeIdentifier,
  normalizeText,
  toPtBrLabel,
} from './metadata-designer.helpers';
import { MetadataAuthUser } from './metadata-designer.types';
import { MetadataGuardService } from './metadata-guard.service';
import { MetadataIntrospectionService } from './metadata-introspection.service';

type EntityRow = {
  id: string;
  tenant_id: string;
  name: string;
  display_name: string;
  description: string | null;
  entity_type: 'CUSTOM' | 'CORE';
  physical_table_name: string;
  is_schema_editable: boolean;
  is_field_editable: boolean;
  is_form_editable: boolean;
  is_active: boolean;
  primary_name_field_id: string | null;
  draft_version: number;
  published_version: number | null;
  last_published_at: Date | null;
  created_at: Date;
  updated_at: Date;
  block_schema_edit: boolean | null;
  block_field_edit: boolean | null;
  block_form_edit: boolean | null;
  guard_notes: string | null;
};

type ListOptions = {
  q?: string;
  page?: string | number;
  page_size?: string | number;
};

@Injectable()
export class MetadataEntitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guardService: MetadataGuardService,
    private readonly introspectionService: MetadataIntrospectionService,
  ) {}

  async list(user: MetadataAuthUser, forceSyncCore = true, options: ListOptions = {}) {
    if (forceSyncCore) {
      await this.introspectionService.syncCoreEntities(user.tenant_id);
    }

    const search = normalizeText(options.q);
    const pageSizeRaw = Number(options.page_size);
    const pageRaw = Number(options.page);
    const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(200, Math.max(1, Math.trunc(pageSizeRaw))) : 20;
    const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;
    const offset = (page - 1) * pageSize;
    const likeTerm = search ? `%${search}%` : '';
    const searchSql = search
      ? Prisma.sql`AND (e."display_name" ILIKE ${likeTerm} OR e."name" ILIKE ${likeTerm})`
      : Prisma.sql``;

    const [rows, totalRows] = await Promise.all([
      this.prisma.raw.$queryRaw<EntityRow[]>(
        Prisma.sql`
          SELECT
            e.*,
            g."block_schema_edit",
            g."block_field_edit",
            g."block_form_edit",
            g."notes" AS "guard_notes"
          FROM "metadata_entities" e
          LEFT JOIN "metadata_entity_guard" g
            ON g."tenant_id" = e."tenant_id"
          AND lower(g."entity_name") = lower(e."name")
          WHERE e."tenant_id" = ${user.tenant_id}::uuid
            ${searchSql}
          ORDER BY e."display_name" ASC, e."name" ASC
          LIMIT ${pageSize}
          OFFSET ${offset}
        `,
      ),
      this.prisma.raw.$queryRaw<Array<{ total: number | string }>>(
        Prisma.sql`
          SELECT COUNT(1)::int AS "total"
          FROM "metadata_entities" e
          WHERE e."tenant_id" = ${user.tenant_id}::uuid
            ${searchSql}
        `,
      ),
    ]);

    const items = rows.map((row) => this.toEntityResponse(row));
    const total = Number(totalRows?.[0]?.total || 0);

    return {
      items,
      total,
      page,
      page_size: pageSize,
    };
  }

  async createCustom(user: MetadataAuthUser, dto: CreateMetadataEntityDto) {
    const name = ensureSafeIdentifier(normalizeIdentifier(dto.name, 'custom_entity'), 'name');
    const tableName = ensureSafeIdentifier(
      normalizeIdentifier(dto.physical_table_name || name, name),
      'physical_table_name',
    );
    const displayName = normalizeText(dto.display_name) || toPtBrLabel(name);
    if (!displayName) {
      throw new BadRequestException('display_name is required.');
    }

    const exists = await this.prisma.raw.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT "id"
        FROM "metadata_entities"
        WHERE "tenant_id" = ${user.tenant_id}::uuid
          AND "name" = ${name}
        LIMIT 1
      `,
    );
    if (exists[0]) {
      throw new BadRequestException(`Entity ${name} already exists for this tenant.`);
    }

    const rows = await this.prisma.raw.$queryRaw<EntityRow[]>(
      Prisma.sql`
        INSERT INTO "metadata_entities" (
          "tenant_id",
          "name",
          "display_name",
          "description",
          "entity_type",
          "physical_table_name",
          "is_schema_editable",
          "is_field_editable",
          "is_form_editable",
          "is_active"
        )
        VALUES (
          ${user.tenant_id}::uuid,
          ${name},
          ${displayName},
          ${normalizeText(dto.description) || null},
          'CUSTOM',
          ${tableName},
          ${dto.is_schema_editable === undefined ? true : Boolean(dto.is_schema_editable)},
          ${dto.is_field_editable === undefined ? true : Boolean(dto.is_field_editable)},
          ${dto.is_form_editable === undefined ? true : Boolean(dto.is_form_editable)},
          true
        )
        RETURNING *
      `,
    );

    const created = rows[0];
    await this.prisma.raw.$executeRaw(
      Prisma.sql`
        INSERT INTO "metadata_forms" (
          "tenant_id",
          "entity_id",
          "name",
          "display_name",
          "form_type",
          "is_default",
          "definition_json",
          "draft_version",
          "is_active"
        )
        VALUES (
          ${user.tenant_id}::uuid,
          ${created.id},
          'main',
          'Principal',
          'MAIN',
          true,
          ${JSON.stringify({ tabs: [] })}::jsonb,
          1,
          true
        )
        ON CONFLICT ("tenant_id", "entity_id", "name")
        DO NOTHING
      `,
    );

    const guard = await this.guardService.getGuard(user.tenant_id, name);
    return this.toEntityResponse({
      ...(created as any),
      block_schema_edit: guard?.block_schema_edit ?? null,
      block_field_edit: guard?.block_field_edit ?? null,
      block_form_edit: guard?.block_form_edit ?? null,
      guard_notes: guard?.notes ?? null,
    } as EntityRow);
  }

  async getById(user: MetadataAuthUser, entityId: string) {
    const entity = await this.getByIdOrThrow(user.tenant_id, entityId);
    return this.toEntityResponse(entity);
  }

  async update(user: MetadataAuthUser, entityId: string, dto: UpdateMetadataEntityDto) {
    const entity = await this.getByIdOrThrow(user.tenant_id, entityId);
    const guard = await this.guardService.getGuard(user.tenant_id, entity.name);

    if (dto.is_schema_editable === true && (guard?.block_schema_edit || false)) {
      throw new ForbiddenException('Schema editing is blocked for this entity.');
    }
    if (dto.is_field_editable === true && (guard?.block_field_edit || false)) {
      throw new ForbiddenException('Field editing is blocked for this entity.');
    }
    if (dto.is_form_editable === true && (guard?.block_form_edit || false)) {
      throw new ForbiddenException('Form editing is blocked for this entity.');
    }

    if (dto.primary_name_field_id) {
      const fieldRows = await this.prisma.raw.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT "id"
          FROM "metadata_fields"
          WHERE "tenant_id" = ${user.tenant_id}::uuid
            AND "entity_id" = ${entity.id}::uuid
            AND "id" = ${dto.primary_name_field_id}::uuid
            AND "is_active" = true
          LIMIT 1
        `,
      );
      if (!fieldRows[0]) {
        throw new BadRequestException('primary_name_field_id does not belong to the entity.');
      }
    }

    const sets: Prisma.Sql[] = [];
    if (dto.display_name !== undefined) sets.push(Prisma.sql`"display_name" = ${normalizeText(dto.display_name)}`);
    if (dto.description !== undefined) sets.push(Prisma.sql`"description" = ${normalizeText(dto.description) || null}`);
    if (dto.is_schema_editable !== undefined) sets.push(Prisma.sql`"is_schema_editable" = ${Boolean(dto.is_schema_editable)}`);
    if (dto.is_field_editable !== undefined) sets.push(Prisma.sql`"is_field_editable" = ${Boolean(dto.is_field_editable)}`);
    if (dto.is_form_editable !== undefined) sets.push(Prisma.sql`"is_form_editable" = ${Boolean(dto.is_form_editable)}`);
    if (dto.is_active !== undefined) sets.push(Prisma.sql`"is_active" = ${Boolean(dto.is_active)}`);
    if (dto.primary_name_field_id !== undefined) sets.push(Prisma.sql`"primary_name_field_id" = ${normalizeText(dto.primary_name_field_id) || null}::uuid`);
    sets.push(Prisma.sql`"draft_version" = "draft_version" + 1`);
    sets.push(Prisma.sql`"updated_at" = now()`);

    const rows = await this.prisma.raw.$queryRaw<EntityRow[]>(
      Prisma.sql`
        UPDATE "metadata_entities"
        SET ${Prisma.join(sets, ', ')}
        WHERE "tenant_id" = ${user.tenant_id}::uuid
          AND "id" = ${entity.id}::uuid
        RETURNING *
      `,
    );

    const updated = rows[0];
    return this.toEntityResponse({
      ...(updated as any),
      block_schema_edit: guard?.block_schema_edit ?? null,
      block_field_edit: guard?.block_field_edit ?? null,
      block_form_edit: guard?.block_form_edit ?? null,
      guard_notes: guard?.notes ?? null,
    } as EntityRow);
  }

  async getByIdOrThrow(tenantId: string, entityId: string): Promise<EntityRow> {
    const normalizedId = normalizeText(entityId);
    if (!normalizedId) throw new BadRequestException('entity id is required.');

    const rows = await this.prisma.raw.$queryRaw<EntityRow[]>(
      Prisma.sql`
        SELECT
          e.*,
          g."block_schema_edit",
          g."block_field_edit",
          g."block_form_edit",
          g."notes" AS "guard_notes"
        FROM "metadata_entities" e
        LEFT JOIN "metadata_entity_guard" g
          ON g."tenant_id" = e."tenant_id"
         AND lower(g."entity_name") = lower(e."name")
        WHERE e."tenant_id" = ${tenantId}::uuid
          AND e."id" = ${normalizedId}::uuid
        LIMIT 1
      `,
    );

    if (!rows[0]) {
      throw new NotFoundException('Metadata entity not found.');
    }
    return rows[0];
  }

  async bumpDraftVersion(tenantId: string, entityId: string): Promise<void> {
    await this.prisma.raw.$executeRaw(
      Prisma.sql`
        UPDATE "metadata_entities"
        SET
          "draft_version" = "draft_version" + 1,
          "updated_at" = now()
        WHERE "tenant_id" = ${tenantId}::uuid
          AND "id" = ${entityId}::uuid
      `,
    );
  }

  private toEntityResponse(row: EntityRow) {
    const guardSchema = Boolean(row.block_schema_edit);
    const guardField = Boolean(row.block_field_edit);
    const guardForm = Boolean(row.block_form_edit);

    return {
      id: row.id,
      tenant_id: row.tenant_id,
      name: row.name,
      display_name: row.display_name,
      description: row.description,
      entity_type: row.entity_type,
      physical_table_name: row.physical_table_name,
      is_schema_editable: Boolean(row.is_schema_editable) && !guardSchema,
      is_field_editable: Boolean(row.is_field_editable) && !guardField,
      is_form_editable: Boolean(row.is_form_editable) && !guardForm,
      is_active: Boolean(row.is_active),
      primary_name_field_id: row.primary_name_field_id,
      draft_version: Number(row.draft_version || 1),
      published_version: row.published_version == null ? null : Number(row.published_version),
      last_published_at: row.last_published_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      guard: {
        block_schema_edit: guardSchema,
        block_field_edit: guardField,
        block_form_edit: guardForm,
        notes: row.guard_notes,
      },
    };
  }
}
