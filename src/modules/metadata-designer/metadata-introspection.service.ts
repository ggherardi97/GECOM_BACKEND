import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MetadataGuardService } from './metadata-guard.service';
import { MetadataFieldDataType } from './metadata-designer.types';
import { normalizeIdentifier, normalizeText, toPtBrLabel } from './metadata-designer.helpers';

type CoreTableRow = { table_name: string };
type CoreColumnRow = {
  column_name: string;
  data_type: string;
  udt_name: string;
  ordinal_position: number;
};
type CoreForeignKeyRow = {
  column_name: string;
  foreign_table_name: string;
  delete_rule: string;
};
type EntityRow = { id: string; entity_type: 'CORE' | 'CUSTOM' };
type FieldRow = { id: string; column_name: string };

@Injectable()
export class MetadataIntrospectionService {
  private readonly excludedTables = new Set<string>([
    'migrations',
    'metadata_entities',
    'metadata_fields',
    'metadata_forms',
    'metadata_entity_publish_log',
    'metadata_entity_guard',
    'metadata_field_security_profiles',
    'metadata_field_security_rules',
    'metadata_field_security_defaults',
  ]);

  private readonly systemColumns = new Set<string>([
    'id',
    'tenant_id',
    'created_at',
    'updated_at',
    'created_on',
    'updated_on',
    'deleted_at',
    'created_by_user_id',
    'updated_by_user_id',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly guardService: MetadataGuardService,
  ) {}

  async syncCoreEntities(tenantId: string): Promise<void> {
    await this.guardService.ensureDocumentGuards(tenantId);

    const rows = await this.prisma.raw.$queryRaw<CoreTableRow[]>(
      Prisma.sql`
        SELECT c.table_name
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
        GROUP BY c.table_name
        HAVING SUM(CASE WHEN c.column_name = 'tenant_id' THEN 1 ELSE 0 END) > 0
           AND SUM(CASE WHEN c.column_name = 'id' THEN 1 ELSE 0 END) > 0
        ORDER BY c.table_name ASC
      `,
    );

    const tableNames = rows
      .map((row) => normalizeIdentifier(row.table_name))
      .filter((name) => !!name && !this.excludedTables.has(name));

    const entityByTable = new Map<string, string>();
    for (const tableName of tableNames) {
      const entityId = await this.upsertCoreEntityFromTable(tenantId, tableName);
      if (entityId) entityByTable.set(tableName, entityId);
    }

    for (const tableName of tableNames) {
      const entityId = entityByTable.get(tableName);
      if (!entityId) continue;
      await this.syncFieldsForCoreEntity(tenantId, entityId, tableName, entityByTable);
    }

    if (tableNames.includes('documents')) {
      await this.upsertCoreEntityAlias(tenantId, 'my_documents', 'documents');
    }
  }

  private async upsertCoreEntityFromTable(tenantId: string, tableName: string): Promise<string> {
    const current = await this.prisma.raw.$queryRaw<EntityRow[]>(
      Prisma.sql`
        SELECT "id", "entity_type"
        FROM "metadata_entities"
        WHERE "tenant_id" = ${tenantId}::uuid
          AND "name" = ${tableName}
        LIMIT 1
      `,
    );

    const isDocumentsEntity = tableName === 'documents';
    const schemaEditable = !isDocumentsEntity;
    const fieldEditable = !isDocumentsEntity;
    const formEditable = !isDocumentsEntity;

    if (!current[0]) {
      const inserted = await this.prisma.raw.$queryRaw<Array<{ id: string }>>(
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
            ${tenantId}::uuid,
            ${tableName},
            ${toPtBrLabel(tableName)},
            ${`Core entity from table ${tableName}`},
            'CORE',
            ${tableName},
            ${schemaEditable},
            ${fieldEditable},
            ${formEditable},
            true
          )
          RETURNING "id"
        `,
      );
      return String(inserted[0]?.id || '');
    }

    const existing = current[0];
    if (existing.entity_type === 'CUSTOM') {
      return String(existing.id);
    }

    const updated = await this.prisma.raw.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        UPDATE "metadata_entities"
        SET
          "display_name" = COALESCE(NULLIF("display_name", ''), ${toPtBrLabel(tableName)}),
          "physical_table_name" = ${tableName},
          "is_schema_editable" = ${schemaEditable},
          "is_field_editable" = ${fieldEditable},
          "is_form_editable" = ${formEditable},
          "is_active" = true,
          "updated_at" = now()
        WHERE "id" = ${existing.id}::uuid
        RETURNING "id"
      `,
    );
    return String(updated[0]?.id || existing.id);
  }

  private async upsertCoreEntityAlias(tenantId: string, aliasName: string, physicalTableName: string): Promise<void> {
    const current = await this.prisma.raw.$queryRaw<EntityRow[]>(
      Prisma.sql`
        SELECT "id", "entity_type"
        FROM "metadata_entities"
        WHERE "tenant_id" = ${tenantId}::uuid
          AND "name" = ${aliasName}
        LIMIT 1
      `,
    );

    if (!current[0]) {
      await this.prisma.raw.$executeRaw(
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
            ${tenantId}::uuid,
            ${aliasName},
            ${'Meus Documentos'},
            ${'Alias for protected documents entity'},
            'CORE',
            ${physicalTableName},
            false,
            false,
            false,
            true
          )
        `,
      );
      return;
    }

    if (current[0].entity_type === 'CUSTOM') return;

    await this.prisma.raw.$executeRaw(
      Prisma.sql`
        UPDATE "metadata_entities"
        SET
          "physical_table_name" = ${physicalTableName},
          "display_name" = 'Meus Documentos',
          "is_schema_editable" = false,
          "is_field_editable" = false,
          "is_form_editable" = false,
          "is_active" = true,
          "updated_at" = now()
        WHERE "id" = ${current[0].id}::uuid
      `,
    );
  }

  private async syncFieldsForCoreEntity(
    tenantId: string,
    entityId: string,
    tableName: string,
    entityByTable: Map<string, string>,
  ): Promise<void> {
    const columns = await this.prisma.raw.$queryRaw<CoreColumnRow[]>(
      Prisma.sql`
        SELECT
          c.column_name,
          c.data_type,
          c.udt_name,
          c.ordinal_position
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = ${tableName}
        ORDER BY c.ordinal_position ASC
      `,
    );
    const foreignKeys = await this.prisma.raw.$queryRaw<CoreForeignKeyRow[]>(
      Prisma.sql`
        SELECT
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
        JOIN information_schema.referential_constraints rc
          ON rc.constraint_name = tc.constraint_name
         AND rc.constraint_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND tc.table_name = ${tableName}
      `,
    );

    const fkByColumn = new Map(
      foreignKeys
        .map((fk) => [
          normalizeIdentifier(fk.column_name),
          {
            targetTable: normalizeIdentifier(fk.foreign_table_name),
            deleteRule: this.toLookupDeleteRule(fk.delete_rule),
          },
        ] as const)
        .filter((entry) => !!entry[0] && !!entry[1].targetTable),
    );

    const activeColumnNames: string[] = [];
    for (const column of columns) {
      const columnName = normalizeIdentifier(column.column_name);
      if (!columnName) continue;
      activeColumnNames.push(columnName);

      const fkInfo = fkByColumn.get(columnName);
      const lookupEntityId = fkInfo?.targetTable ? entityByTable.get(fkInfo.targetTable) || null : null;
      const lookupOnDelete = lookupEntityId ? fkInfo?.deleteRule || null : null;
      const dataType = lookupEntityId
        ? ('LOOKUP' as MetadataFieldDataType)
        : this.toMetadataDataType(column.data_type, column.udt_name);
      const isSystem = this.systemColumns.has(columnName);

      await this.prisma.raw.$executeRaw(
        Prisma.sql`
          INSERT INTO "metadata_fields" (
            "tenant_id",
            "entity_id",
            "name",
            "display_name",
            "data_type",
            "lookup_entity_id",
            "lookup_on_delete",
            "column_name",
            "source",
            "is_system",
            "is_active",
            "is_required",
            "is_unique",
            "draft_version",
            "published_version"
          )
          VALUES (
            ${tenantId}::uuid,
            ${entityId}::uuid,
            ${columnName},
            ${toPtBrLabel(columnName)},
            ${dataType}::metadata_field_data_type_enum,
            ${lookupEntityId}::uuid,
            ${lookupOnDelete}::metadata_lookup_on_delete_enum,
            ${columnName},
            'CORE_EXISTING',
            ${isSystem},
            true,
            false,
            false,
            1,
            1
          )
          ON CONFLICT ("tenant_id", "entity_id", "column_name")
          DO UPDATE SET
            "name" = EXCLUDED."name",
            "display_name" = CASE
              WHEN "metadata_fields"."source" = 'CORE_EXISTING' THEN EXCLUDED."display_name"
              ELSE "metadata_fields"."display_name"
            END,
            "data_type" = CASE
              WHEN "metadata_fields"."source" = 'CORE_EXISTING' THEN EXCLUDED."data_type"
              ELSE "metadata_fields"."data_type"
            END,
            "lookup_entity_id" = CASE
              WHEN "metadata_fields"."source" = 'CORE_EXISTING' THEN EXCLUDED."lookup_entity_id"
              ELSE "metadata_fields"."lookup_entity_id"
            END,
            "lookup_on_delete" = CASE
              WHEN "metadata_fields"."source" = 'CORE_EXISTING' THEN EXCLUDED."lookup_on_delete"
              ELSE "metadata_fields"."lookup_on_delete"
            END,
            "is_system" = CASE
              WHEN "metadata_fields"."source" = 'CORE_EXISTING' THEN EXCLUDED."is_system"
              ELSE "metadata_fields"."is_system"
            END,
            "is_active" = true,
            "updated_at" = now()
        `,
      );
    }

    const existingFields = await this.prisma.raw.$queryRaw<FieldRow[]>(
      Prisma.sql`
        SELECT "id", "column_name"
        FROM "metadata_fields"
        WHERE "tenant_id" = ${tenantId}::uuid
          AND "entity_id" = ${entityId}::uuid
          AND "source" = 'CORE_EXISTING'
      `,
    );

    const activeSet = new Set(activeColumnNames);
    const toDeactivate = existingFields
      .map((field) => ({
        id: String(field.id),
        column_name: normalizeText(field.column_name).toLowerCase(),
      }))
      .filter((field) => field.id && !activeSet.has(field.column_name));

    for (const row of toDeactivate) {
      await this.prisma.raw.$executeRaw(
        Prisma.sql`
          UPDATE "metadata_fields"
          SET
            "is_active" = false,
            "updated_at" = now()
          WHERE "id" = ${row.id}::uuid
        `,
      );
    }
  }

  private toMetadataDataType(dataTypeRaw: string, udtNameRaw: string): MetadataFieldDataType {
    const dataType = normalizeText(dataTypeRaw).toLowerCase();
    const udtName = normalizeText(udtNameRaw).toLowerCase();

    if (dataType.includes('character') || dataType === 'varchar' || dataType === 'char') return 'STRING';
    if (dataType === 'text') return 'TEXT';
    if (dataType === 'integer' || dataType === 'smallint' || dataType === 'bigint') return 'INT';
    if (
      dataType === 'numeric' ||
      dataType === 'decimal' ||
      dataType === 'real' ||
      dataType === 'double precision'
    ) {
      return 'DECIMAL';
    }
    if (dataType === 'boolean') return 'BOOLEAN';
    if (dataType === 'date') return 'DATE';
    if (dataType.includes('timestamp')) return 'DATETIME';
    if (dataType === 'uuid' || udtName === 'uuid') return 'UUID';
    if (dataType === 'json' || dataType === 'jsonb') return 'JSONB';

    return 'STRING';
  }

  private toLookupDeleteRule(deleteRuleRaw: string): 'RESTRICT' | 'CASCADE' | 'SET_NULL' {
    const deleteRule = normalizeText(deleteRuleRaw).toUpperCase();
    if (deleteRule === 'CASCADE') return 'CASCADE';
    if (deleteRule === 'SET NULL') return 'SET_NULL';
    return 'RESTRICT';
  }
}
