import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isEntityAllowedByModuleAreas } from '../billing-plans/module-areas';
import { TenantModulesResolverService } from '../billing-plans/tenant-modules-resolver.service';

type RawEntityRow = {
  table_name: string;
};

type RawFieldRow = {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_identity: 'YES' | 'NO' | null;
  column_default: string | null;
  is_nullable: 'YES' | 'NO' | null;
};

type RawRecordRow = {
  id: string;
  primary_value: string | null;
  secondary_value: string | null;
};

export type AutomationEntityMetadata = {
  name: string;
  label: string;
};

export type AutomationFieldMetadata = {
  name: string;
  label: string;
  dataType: string;
};

export type AutomationRecordLookupItem = {
  id: string;
  label: string;
  subtitle?: string;
};

export type AutomationEntityColumnMetadata = {
  name: string;
  dataType: string;
  udtName: string;
  isIdentity: boolean;
  columnDefault: string | null;
  isNullable: boolean;
};

@Injectable()
export class AutomationMetadataService {
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
  ]);

  private readonly systemColumns = new Set<string>([
    'id',
    'tenant_id',
    'created_at',
    'updated_at',
    'deleted_at',
    'created_on',
    'updated_on',
    'created_by_user_id',
    'updated_by_user_id',
    'invoice_seq',
  ]);

  private readonly preferredLabelColumns = [
    'name',
    'title',
    'subject',
    'full_name',
    'company_name',
    'invoice_number',
    'process_number',
    'contract_number',
    'product_code',
    'email',
    'description',
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantModulesResolverService: TenantModulesResolverService,
  ) {}

  private async getEnabledAreaSet(tenantId?: string): Promise<Set<string>> {
    if (!tenantId) return new Set<string>();
    const areas = await this.tenantModulesResolverService.getEnabledAreas(tenantId);
    return new Set((areas || []).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean));
  }

  async listEntities(tenantId?: string): Promise<AutomationEntityMetadata[]> {
    const enabledAreaSet = await this.getEnabledAreaSet(tenantId);
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
      .filter((name) => name && !this.excludedEntities.has(name))
      .filter((name) => !tenantId || isEntityAllowedByModuleAreas(name, enabledAreaSet))
      .map((name) => ({
        name,
        label: this.toPtBrLabel(name),
      }));
  }

  async listEntityColumns(entityName: string, tenantId?: string): Promise<AutomationEntityColumnMetadata[]> {
    const normalized = String(entityName || '').trim().toLowerCase();
    if (!this.isSafeIdentifier(normalized)) return [];

    const entities = await this.listEntities(tenantId);
    if (!entities.some((item) => item.name === normalized)) return [];

    const rows = await this.prisma.raw.$queryRaw<RawFieldRow[]>(Prisma.sql`
      SELECT
        c.column_name,
        c.data_type,
        c.udt_name,
        c.is_identity,
        c.column_default,
        c.is_nullable
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = ${normalized}
      ORDER BY c.ordinal_position ASC
    `);

    return rows
      .map((row) => ({
        name: String(row.column_name || '').trim().toLowerCase(),
        dataType: String(row.data_type || '').trim().toLowerCase(),
        udtName: String(row.udt_name || '').trim().toLowerCase(),
        isIdentity: String(row.is_identity || '').toUpperCase() === 'YES',
        columnDefault: row.column_default ? String(row.column_default) : null,
        isNullable: String(row.is_nullable || '').toUpperCase() === 'YES',
      }))
      .filter((row) => row.name && this.isSafeIdentifier(row.name));
  }

  async listUpdatableFields(entityName: string, tenantId?: string): Promise<AutomationFieldMetadata[]> {
    const columns = await this.listEntityColumns(entityName, tenantId);

    return columns
      .filter((column) => this.isUserWritableColumn(column))
      .map((column) => ({
        name: column.name,
        label: this.toPtBrLabel(column.name),
        dataType: column.dataType || column.udtName,
      }));
  }

  async searchRecords(params: {
    tenantId: string;
    entityName: string;
    query?: string;
    limit?: number;
  }): Promise<AutomationRecordLookupItem[]> {
    const tenantId = String(params.tenantId || '').trim();
    const entityName = String(params.entityName || '').trim().toLowerCase();
    const query = String(params.query || '').trim();
    const limit = this.normalizeLimit(params.limit);

    if (!tenantId || !this.isSafeIdentifier(entityName)) return [];

    const columns = await this.listEntityColumns(entityName, tenantId);
    if (!columns.length) return [];

    const columnNames = new Set(columns.map((column) => column.name));
    if (!columnNames.has('id') || !columnNames.has('tenant_id')) return [];

    const labelColumns = this.resolveLabelColumns(columns);
    const searchableColumns = this.resolveSearchableColumns(columns);

    const tableSql = Prisma.raw(`"${entityName}"`);
    const whereClauses: Prisma.Sql[] = [Prisma.sql`CAST("tenant_id" AS TEXT) = ${tenantId}`];

    if (query) {
      const searchConditions: Prisma.Sql[] = [Prisma.sql`CAST("id" AS TEXT) = ${query}`];
      const pattern = `%${query}%`;

      searchableColumns.slice(0, 8).forEach((column) => {
        const fieldSql = Prisma.raw(`"${column}"`);
        searchConditions.push(Prisma.sql`CAST(${fieldSql} AS TEXT) ILIKE ${pattern}`);
      });

      whereClauses.push(Prisma.sql`(${Prisma.join(searchConditions, ' OR ')})`);
    }

    const primaryField = labelColumns[0] ?? 'id';
    const secondaryField = labelColumns[1] ?? '';
    const primarySql = Prisma.raw(`"${primaryField}"`);
    const secondarySql = secondaryField ? Prisma.raw(`"${secondaryField}"`) : null;

    const orderSql = this.resolveOrderSql(columnNames);

    const rows = await this.prisma.raw.$queryRaw<RawRecordRow[]>(Prisma.sql`
      SELECT
        CAST("id" AS TEXT) AS id,
        NULLIF(TRIM(CAST(${primarySql} AS TEXT)), '') AS primary_value,
        ${
          secondarySql
            ? Prisma.sql`NULLIF(TRIM(CAST(${secondarySql} AS TEXT)), '')`
            : Prisma.sql`NULL`
        } AS secondary_value
      FROM ${tableSql}
      WHERE ${Prisma.join(whereClauses, ' AND ')}
      ORDER BY ${orderSql}
      LIMIT ${limit}
    `);

    return rows
      .map((row) => {
        const id = String(row.id || '').trim();
        if (!id) return null;

        const primary = String(row.primary_value || '').trim();
        const secondary = String(row.secondary_value || '').trim();
        const label = primary || id;

        return {
          id,
          label: secondary && secondary !== label ? `${label} - ${secondary}` : label,
          ...(secondary && secondary !== label ? { subtitle: secondary } : {}),
        } satisfies AutomationRecordLookupItem;
      })
      .filter((row): row is AutomationRecordLookupItem => !!row);
  }

  private isUserWritableColumn(column: AutomationEntityColumnMetadata): boolean {
    if (!column.name) return false;
    if (this.systemColumns.has(column.name)) return false;
    if (column.isIdentity) return false;
    if ((column.columnDefault || '').toLowerCase().includes('nextval(')) return false;
    return true;
  }

  private resolveLabelColumns(columns: AutomationEntityColumnMetadata[]): string[] {
    const columnNames = new Set(columns.map((column) => column.name));
    const preferred = this.preferredLabelColumns.filter((column) => columnNames.has(column));
    if (preferred.length >= 2) return preferred.slice(0, 2);

    const textColumns = columns
      .filter((column) => this.isTextualColumn(column))
      .map((column) => column.name)
      .filter((name) => !this.systemColumns.has(name) && name !== 'tenant_id' && name !== 'id');

    const dedup = new Set<string>([...preferred, ...textColumns]);
    const output = Array.from(dedup).filter(Boolean);
    if (!output.length) return ['id'];
    if (output.length === 1) return [output[0], 'id'];
    return output.slice(0, 2);
  }

  private resolveSearchableColumns(columns: AutomationEntityColumnMetadata[]): string[] {
    return columns
      .filter((column) => column.name !== 'tenant_id')
      .filter((column) => this.isTextualColumn(column) || column.name === 'id')
      .map((column) => column.name);
  }

  private resolveOrderSql(columnNames: Set<string>): Prisma.Sql {
    if (columnNames.has('updated_at') && columnNames.has('created_at')) {
      return Prisma.sql`"updated_at" DESC NULLS LAST, "created_at" DESC NULLS LAST`;
    }

    if (columnNames.has('updated_at')) {
      return Prisma.sql`"updated_at" DESC NULLS LAST`;
    }

    if (columnNames.has('created_at')) {
      return Prisma.sql`"created_at" DESC NULLS LAST`;
    }

    if (columnNames.has('created_on')) {
      return Prisma.sql`"created_on" DESC NULLS LAST`;
    }

    return Prisma.sql`"id" DESC`;
  }

  private isTextualColumn(column: AutomationEntityColumnMetadata): boolean {
    const dataType = String(column.dataType || '').toLowerCase();
    const udt = String(column.udtName || '').toLowerCase();
    return (
      dataType.includes('character') ||
      dataType.includes('text') ||
      dataType === 'uuid' ||
      udt === 'uuid'
    );
  }

  private normalizeLimit(limit?: number): number {
    const parsed = Number(limit ?? 10);
    if (!Number.isFinite(parsed)) return 10;
    return Math.max(1, Math.min(50, Math.trunc(parsed)));
  }

  private isSafeIdentifier(value: string): boolean {
    return /^[a-z_][a-z0-9_]*$/.test(value);
  }

  private toPtBrLabel(value: string): string {
    return value
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
