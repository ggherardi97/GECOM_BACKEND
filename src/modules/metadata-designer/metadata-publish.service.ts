import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ensureSafeIdentifier,
  normalizeIdentifier,
  normalizeText,
  quoteIdentifier,
} from './metadata-designer.helpers';
import { MetadataAuthUser } from './metadata-designer.types';
import { MetadataEntitiesService } from './metadata-entities.service';
import { MetadataGuardService } from './metadata-guard.service';

type PublishEntityRow = {
  id: string;
  tenant_id: string;
  name: string;
  entity_type: 'CUSTOM' | 'CORE';
  physical_table_name: string;
  is_schema_editable: boolean;
  is_field_editable: boolean;
  draft_version: number;
};

type PublishFieldRow = {
  id: string;
  name: string;
  column_name: string;
  data_type: string;
  is_required: boolean;
  is_unique: boolean;
  default_value: string | null;
  format_json: any;
  lookup_entity_id: string | null;
  lookup_on_delete: string | null;
  source: 'SYSTEM' | 'CORE_EXISTING' | 'DESIGNER';
  is_active: boolean;
  draft_version: number;
};

@Injectable()
export class MetadataPublishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitiesService: MetadataEntitiesService,
    private readonly guardService: MetadataGuardService,
  ) {}

  async publishEntity(user: MetadataAuthUser, entityId: string) {
    const entity = await this.getPublishEntityOrThrow(user.tenant_id, entityId);
    const guard = await this.guardService.getGuard(user.tenant_id, entity.name);

    if (!entity.is_schema_editable || !entity.is_field_editable) {
      throw new ForbiddenException('Schema/field publish is disabled for this entity.');
    }
    this.guardService.assertAllowedByGuard(guard, 'schema', 'Schema publish is blocked for this entity.');
    this.guardService.assertAllowedByGuard(guard, 'field', 'Field publish is blocked for this entity.');

    const tableName = ensureSafeIdentifier(
      normalizeIdentifier(entity.physical_table_name || entity.name, entity.name),
      'physical_table_name',
    );
    const version = Number(entity.draft_version || 1);
    const statements: string[] = [];
    const migrationMetadata: { name: string | null } = { name: null };

    try {
      if (entity.entity_type === 'CUSTOM') {
        statements.push(this.createBaseTableSql(tableName));
      } else {
        const coreTableExists = await this.tableExists(tableName);
        if (!coreTableExists) {
          throw new BadRequestException(`Physical core table ${tableName} does not exist.`);
        }
      }

      const fields = await this.prisma.raw.$queryRaw<PublishFieldRow[]>(
        Prisma.sql`
          SELECT *
          FROM "metadata_fields"
          WHERE "tenant_id" = ${user.tenant_id}::uuid
            AND "entity_id" = ${entity.id}::uuid
            AND "source" = 'DESIGNER'
            AND "is_active" = true
          ORDER BY "created_at" ASC
        `,
      );

      for (const field of fields) {
        const columnName = ensureSafeIdentifier(
          normalizeIdentifier(field.column_name || field.name, field.name),
          'column_name',
        );
        const exists = await this.columnExists(tableName, columnName);
        if (!exists) {
          statements.push(this.buildAddColumnSql(tableName, field, columnName));
        }

        if (Boolean(field.is_unique)) {
          const indexName = this.makeIndexName(`${tableName}_${columnName}_uq`);
          if (!(await this.indexExists(indexName))) {
            statements.push(
              `CREATE UNIQUE INDEX ${quoteIdentifier(indexName)} ON ${quoteIdentifier(tableName)} (${quoteIdentifier(columnName)})`,
            );
          }
        }

        if (String(field.data_type || '').toUpperCase() === 'LOOKUP' && field.lookup_entity_id) {
          const lookupEntity = await this.prisma.raw.$queryRaw<Array<{ physical_table_name: string }>>(
            Prisma.sql`
              SELECT "physical_table_name"
              FROM "metadata_entities"
              WHERE "tenant_id" = ${user.tenant_id}::uuid
                AND "id" = ${field.lookup_entity_id}::uuid
              LIMIT 1
            `,
          );
          const targetTable = normalizeIdentifier(lookupEntity[0]?.physical_table_name);
          if (targetTable) {
            const constraintName = this.makeConstraintName(`fk_${tableName}_${columnName}_${targetTable}`);
            if (!(await this.constraintExists(constraintName))) {
              statements.push(
                [
                  `ALTER TABLE ${quoteIdentifier(tableName)}`,
                  `ADD CONSTRAINT ${quoteIdentifier(constraintName)}`,
                  `FOREIGN KEY (${quoteIdentifier(columnName)})`,
                  `REFERENCES ${quoteIdentifier(targetTable)}("id")`,
                  `ON DELETE ${this.resolveLookupOnDelete(field.lookup_on_delete)}`,
                ].join(' '),
              );
            }
          }
        }
      }

      if (statements.length > 0) {
        migrationMetadata.name = await this.generateMigrationFile(tableName, version, statements);
        for (const sql of statements) {
          await this.prisma.raw.$executeRawUnsafe(sql);
        }
      }

      await this.prisma.raw.$transaction(async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`
            UPDATE "metadata_entities"
            SET
              "published_version" = ${version},
              "last_published_at" = now(),
              "updated_at" = now()
            WHERE "tenant_id" = ${user.tenant_id}::uuid
              AND "id" = ${entity.id}::uuid
          `,
        );

        await tx.$executeRaw(
          Prisma.sql`
            UPDATE "metadata_fields"
            SET
              "published_version" = "draft_version",
              "updated_at" = now()
            WHERE "tenant_id" = ${user.tenant_id}::uuid
              AND "entity_id" = ${entity.id}::uuid
              AND "source" = 'DESIGNER'
          `,
        );

        await tx.$executeRaw(
          Prisma.sql`
            UPDATE "metadata_forms"
            SET
              "published_version" = "draft_version",
              "updated_at" = now()
            WHERE "tenant_id" = ${user.tenant_id}::uuid
              AND "entity_id" = ${entity.id}::uuid
          `,
        );

        await tx.$executeRaw(
          Prisma.sql`
            INSERT INTO "metadata_entity_publish_log" (
              "tenant_id",
              "entity_id",
              "version",
              "published_by_user_id",
              "published_at",
              "migration_name",
              "ddl_preview",
              "status",
              "error_message"
            )
            VALUES (
              ${user.tenant_id}::uuid,
              ${entity.id}::uuid,
              ${version},
              ${user.id}::uuid,
              now(),
              ${migrationMetadata.name || null},
              ${statements.join(';\n') || null},
              'SUCCESS',
              null
            )
          `,
        );
      });

      return {
        ok: true,
        entity_id: entity.id,
        version,
        migration_name: migrationMetadata.name,
        ddl_preview: statements.join(';\n'),
      };
    } catch (error: any) {
      await this.prisma.raw.$executeRaw(
        Prisma.sql`
          INSERT INTO "metadata_entity_publish_log" (
            "tenant_id",
            "entity_id",
            "version",
            "published_by_user_id",
            "published_at",
            "migration_name",
            "ddl_preview",
            "status",
            "error_message"
          )
          VALUES (
            ${user.tenant_id}::uuid,
            ${entity.id}::uuid,
            ${version},
            ${user.id}::uuid,
            now(),
            ${migrationMetadata.name || null},
            ${statements.join(';\n') || null},
            'FAILED',
            ${String(error?.message || 'Unknown publish error')}
          )
        `,
      );
      throw error;
    }
  }

  async listPublishLog(user: MetadataAuthUser, entityId: string) {
    await this.entitiesService.getByIdOrThrow(user.tenant_id, entityId);

    const rows = await this.prisma.raw.$queryRaw<Array<Record<string, any>>>(
      Prisma.sql`
        SELECT *
        FROM "metadata_entity_publish_log"
        WHERE "tenant_id" = ${user.tenant_id}::uuid
          AND "entity_id" = ${entityId}::uuid
        ORDER BY "published_at" DESC, "created_at" DESC
      `,
    );

    return Array.isArray(rows) ? rows : [];
  }

  private async getPublishEntityOrThrow(tenantId: string, entityId: string): Promise<PublishEntityRow> {
    const normalizedEntityId = normalizeText(entityId);
    if (!normalizedEntityId) throw new BadRequestException('entity id is required.');

    const rows = await this.prisma.raw.$queryRaw<PublishEntityRow[]>(
      Prisma.sql`
        SELECT
          "id",
          "tenant_id",
          "name",
          "entity_type",
          "physical_table_name",
          "is_schema_editable",
          "is_field_editable",
          "draft_version"
        FROM "metadata_entities"
        WHERE "tenant_id" = ${tenantId}::uuid
          AND "id" = ${normalizedEntityId}::uuid
        LIMIT 1
      `,
    );

    if (!rows[0]) {
      throw new BadRequestException('Metadata entity not found.');
    }
    return rows[0];
  }

  private createBaseTableSql(tableName: string): string {
    return `
      CREATE TABLE IF NOT EXISTS ${quoteIdentifier(tableName)} (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "created_at" timestamptz(6) NOT NULL DEFAULT now(),
        "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
        CONSTRAINT ${quoteIdentifier(this.makeConstraintName(`pk_${tableName}`))} PRIMARY KEY ("id")
      )
    `
      .replace(/\s+/g, ' ')
      .trim();
  }

  private buildAddColumnSql(tableName: string, field: PublishFieldRow, columnName: string): string {
    const sqlType = this.resolveColumnSqlType(field);
    const defaultValueSql = this.resolveDefaultSql(field);

    const fragments: string[] = [
      `ALTER TABLE ${quoteIdentifier(tableName)}`,
      `ADD COLUMN ${quoteIdentifier(columnName)} ${sqlType}`,
    ];
    if (defaultValueSql) fragments.push(`DEFAULT ${defaultValueSql}`);
    return fragments.join(' ');
  }

  private resolveColumnSqlType(field: PublishFieldRow): string {
    const dataType = normalizeText(field.data_type).toUpperCase();
    const format = field.format_json && typeof field.format_json === 'object' ? field.format_json : {};

    if (dataType === 'STRING') {
      const maxLength = Number((format as any)?.maxLength);
      const length = Number.isFinite(maxLength) && maxLength > 0 ? Math.min(2000, Math.trunc(maxLength)) : 255;
      return `varchar(${length})`;
    }
    if (dataType === 'TEXT') return 'text';
    if (dataType === 'INT') return 'integer';
    if (dataType === 'DECIMAL') {
      const precision = Number((format as any)?.precision);
      const scale = Number((format as any)?.scale);
      const p = Number.isFinite(precision) && precision > 0 ? Math.min(38, Math.trunc(precision)) : 18;
      const s = Number.isFinite(scale) && scale >= 0 ? Math.min(18, Math.trunc(scale)) : 2;
      return `numeric(${p}, ${Math.min(p, s)})`;
    }
    if (dataType === 'BOOLEAN') return 'boolean';
    if (dataType === 'DATE') return 'date';
    if (dataType === 'DATETIME') return 'timestamptz(6)';
    if (dataType === 'UUID') return 'uuid';
    if (dataType === 'JSONB') return 'jsonb';
    if (dataType === 'LOOKUP') return 'uuid';
    return 'varchar(255)';
  }

  private resolveDefaultSql(field: PublishFieldRow): string | null {
    const rawDefault = normalizeText(field.default_value);
    if (!rawDefault) return null;
    const dataType = normalizeText(field.data_type).toUpperCase();

    if (rawDefault.startsWith('raw:')) {
      return rawDefault.substring(4).trim() || null;
    }

    if (dataType === 'INT' || dataType === 'DECIMAL') {
      const numeric = Number(rawDefault);
      if (!Number.isFinite(numeric)) return null;
      return String(numeric);
    }

    if (dataType === 'BOOLEAN') {
      const lowered = rawDefault.toLowerCase();
      if (['1', 'true', 'yes', 'y', 'sim', 's'].includes(lowered)) return 'true';
      if (['0', 'false', 'no', 'n', 'nao'].includes(lowered)) return 'false';
      return null;
    }

    if (dataType === 'JSONB') {
      try {
        const parsed = JSON.parse(rawDefault);
        return `'${JSON.stringify(parsed).replace(/'/g, "''")}'::jsonb`;
      } catch {
        return null;
      }
    }

    if (dataType === 'UUID') {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawDefault)) {
        return `'${rawDefault}'::uuid`;
      }
      return null;
    }

    if (dataType === 'DATE' || dataType === 'DATETIME') {
      const asDate = new Date(rawDefault);
      if (!Number.isFinite(asDate.getTime())) return null;
      return `'${rawDefault.replace(/'/g, "''")}'`;
    }

    return `'${rawDefault.replace(/'/g, "''")}'`;
  }

  private resolveLookupOnDelete(rawValue: string | null): string {
    const value = normalizeText(rawValue).toUpperCase();
    if (value === 'CASCADE') return 'CASCADE';
    if (value === 'SET_NULL') return 'SET NULL';
    return 'RESTRICT';
  }

  private makeIndexName(base: string): string {
    const normalized = normalizeIdentifier(base, 'idx_metadata');
    if (normalized.length <= 63) return normalized;
    return normalized.slice(0, 63);
  }

  private makeConstraintName(base: string): string {
    const normalized = normalizeIdentifier(base, 'ct_metadata');
    if (normalized.length <= 63) return normalized;
    return normalized.slice(0, 63);
  }

  private async tableExists(tableName: string): Promise<boolean> {
    const rows = await this.prisma.raw.$queryRaw<Array<{ exists: boolean }>>(
      Prisma.sql`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = ${tableName}
        ) AS exists
      `,
    );
    return Boolean(rows[0]?.exists);
  }

  private async columnExists(tableName: string, columnName: string): Promise<boolean> {
    const rows = await this.prisma.raw.$queryRaw<Array<{ exists: boolean }>>(
      Prisma.sql`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = ${tableName}
            AND column_name = ${columnName}
        ) AS exists
      `,
    );
    return Boolean(rows[0]?.exists);
  }

  private async indexExists(indexName: string): Promise<boolean> {
    const rows = await this.prisma.raw.$queryRaw<Array<{ exists: boolean }>>(
      Prisma.sql`
        SELECT EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = ${indexName}
        ) AS exists
      `,
    );
    return Boolean(rows[0]?.exists);
  }

  private async constraintExists(constraintName: string): Promise<boolean> {
    const rows = await this.prisma.raw.$queryRaw<Array<{ exists: boolean }>>(
      Prisma.sql`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_schema = 'public'
            AND constraint_name = ${constraintName}
        ) AS exists
      `,
    );
    return Boolean(rows[0]?.exists);
  }

  private async generateMigrationFile(
    entityName: string,
    version: number,
    statements: string[],
  ): Promise<string> {
    const timestamp = this.getUtcTimestampKey();
    const migrationName = `${timestamp}-MetadataEntity_${entityName}_v${version}.ts`;
    const className = `MetadataEntity${this.toClassToken(entityName)}V${version}${timestamp}`;

    const escapedStatements = statements.map((statement) => statement.replace(/`/g, '\\`'));
    const body = escapedStatements
      .map((statement) => `    await queryRunner.query(\`${statement}\`);`)
      .join('\n');

    const content = `import { MigrationInterface, QueryRunner } from 'typeorm';

export class ${className} implements MigrationInterface {
  name = '${className}';

  public async up(queryRunner: QueryRunner): Promise<void> {
${body || '    // No DDL statements for this publish.'}
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Non-destructive rollback: metadata publish never drops physical columns.
  }
}
`;

    const migrationsDir = path.resolve(process.cwd(), 'src', 'typeorm', 'migrations');
    await fs.mkdir(migrationsDir, { recursive: true });
    await fs.writeFile(path.join(migrationsDir, migrationName), content, 'utf8');
    return migrationName;
  }

  private toClassToken(value: string): string {
    return normalizeIdentifier(value, 'entity')
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }

  private getUtcTimestampKey(): string {
    const now = new Date();
    const YYYY = String(now.getUTCFullYear());
    const MM = String(now.getUTCMonth() + 1).padStart(2, '0');
    const DD = String(now.getUTCDate()).padStart(2, '0');
    const HH = String(now.getUTCHours()).padStart(2, '0');
    const mm = String(now.getUTCMinutes()).padStart(2, '0');
    const ss = String(now.getUTCSeconds()).padStart(2, '0');
    return `${YYYY}${MM}${DD}${HH}${mm}${ss}`;
  }
}
