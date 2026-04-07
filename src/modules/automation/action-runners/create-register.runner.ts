import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AutomationMetadataService } from '../automation-metadata.service';
import { AutomationActionRunner, ActionRunnerArgs } from './automation-action-runner.interface';
import { renderTemplateValue } from './template.util';

@Injectable()
export class CreateRegisterActionRunner implements AutomationActionRunner {
  readonly type = 'CREATE_REGISTER' as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metadataService: AutomationMetadataService,
  ) {}

  async run({ action, context, accumulatedOutput }: ActionRunnerArgs): Promise<Record<string, unknown>> {
    const config = (action.config ?? {}) as Record<string, unknown>;
    const entityName = String(config.entityName ?? context.entityName ?? '')
      .trim()
      .toLowerCase();

    const columns = await this.metadataService.listEntityColumns(entityName);
    if (!columns.length) {
      return {
        skipped: true,
        reason: `Entidade ${entityName || '-'} inválida para CREATE_REGISTER.`,
      };
    }

    const writableFields = await this.metadataService.listUpdatableFields(entityName);
    const writableFieldSet = new Set(writableFields.map((item) => item.name));
    const columnByName = new Map(columns.map((column) => [column.name, column]));

    const templateSource = {
      tenantId: context.tenantId,
      userId: context.userId,
      recordId: context.recordId,
      entityName: context.entityName,
      payload: context.payload ?? {},
      output: accumulatedOutput,
    } as Record<string, unknown>;

    const data: Record<string, unknown> = {};
    this.collectConfiguredValues(config).forEach(({ field, value }) => {
      const normalizedField = String(field || '').trim().toLowerCase();
      if (!writableFieldSet.has(normalizedField)) return;
      data[normalizedField] = renderTemplateValue(value, templateSource);
    });

    await this.applyInvoiceReceivableDefaults(entityName, data, templateSource);

    if (columnByName.has('tenant_id') && !Object.prototype.hasOwnProperty.call(data, 'tenant_id')) {
      data.tenant_id = context.tenantId;
    }

    if (columnByName.has('created_at') && !Object.prototype.hasOwnProperty.call(data, 'created_at')) {
      data.created_at = new Date();
    }

    if (columnByName.has('updated_at') && !Object.prototype.hasOwnProperty.call(data, 'updated_at')) {
      data.updated_at = new Date();
    }

    const idColumn = columnByName.get('id');
    if (
      idColumn &&
      !idColumn.isNullable &&
      !idColumn.isIdentity &&
      !idColumn.columnDefault &&
      !Object.prototype.hasOwnProperty.call(data, 'id')
    ) {
      data.id = randomUUID();
    }

    const finalEntries = Object.entries(data).filter(([field]) => columnByName.has(field));
    if (!finalEntries.length) {
      return {
        skipped: true,
        reason: 'Nenhum campo válido informado para CREATE_REGISTER.',
      };
    }

    const tableSql = Prisma.raw(`"${entityName}"`);
    const columnSql = finalEntries.map(([field]) => Prisma.raw(`"${field}"`));
    const valueSql = finalEntries.map(([field, value]) =>
      this.toColumnValueSql(columnByName.get(field), value),
    );

    const createdRows = await this.prisma.raw.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO ${tableSql} (${Prisma.join(columnSql, ', ')})
      VALUES (${Prisma.join(valueSql, ', ')})
      RETURNING CAST("id" AS TEXT) AS id
    `);

    const createdId = String(createdRows?.[0]?.id || data.id || '').trim();

    return {
      entityName,
      createdId: createdId || null,
      createdFields: finalEntries.map(([field]) => field),
    };
  }

  private async applyInvoiceReceivableDefaults(
    entityName: string,
    data: Record<string, unknown>,
    templateSource: Record<string, unknown>,
  ) {
    if (entityName !== 'financial_receivables') return;
    if (String(templateSource.entityName || '').trim().toLowerCase() !== 'invoices') return;

    const payload = (templateSource.payload || {}) as Record<string, unknown>;
    const after = ((payload.after || payload.before || {}) as Record<string, unknown>) || {};
    const receivedAmountBrl = after.received_amount_brl;
    const totalAmount = after.total;
    const invoiceCurrencyId = String(after.currency_id || '').trim();
    const invoiceCurrency = ((after.currencies || after.currency || {}) as Record<string, unknown>) || {};
    const invoiceCurrencyCode = String(
      invoiceCurrency.code || after.currency_code || after.currencyCode || '',
    )
      .trim()
      .toUpperCase();

    const currentOriginalAmount = data.original_amount;
    const shouldPreferBrlAmount =
      receivedAmountBrl != null &&
      (currentOriginalAmount == null || Number(currentOriginalAmount) === Number(totalAmount || 0));

    if (shouldPreferBrlAmount) {
      data.original_amount = receivedAmountBrl;
    }

    const currentCurrencyId = String(data.currency_id || '').trim();
    if (
      invoiceCurrencyCode &&
      invoiceCurrencyCode !== 'BRL' &&
      receivedAmountBrl != null &&
      (!currentCurrencyId || currentCurrencyId === invoiceCurrencyId)
    ) {
      const brlCurrency = await this.prisma.currencies.findFirst({
        where: { code: 'BRL' },
        select: { id: true },
      });
      if (brlCurrency?.id) {
        data.currency_id = brlCurrency.id;
      }
    }
  }

  private collectConfiguredValues(
    config: Record<string, unknown>,
  ): Array<{ field: string; value: unknown }> {
    const output: Array<{ field: string; value: unknown }> = [];

    if (config.values && typeof config.values === 'object' && !Array.isArray(config.values)) {
      Object.entries(config.values as Record<string, unknown>).forEach(([field, value]) => {
        output.push({ field, value });
      });
    }

    const pushArray = (rows: unknown) => {
      if (!Array.isArray(rows)) return;
      rows.forEach((row) => {
        if (!row || typeof row !== 'object') return;
        const item = row as Record<string, unknown>;
        const field = String(item.field ?? '').trim();
        if (!field) return;
        output.push({ field, value: item.value });
      });
    };

    pushArray(config.fields);
    pushArray(config.fieldMappings);

    const singleField = String(config.field ?? '').trim();
    if (singleField) {
      output.push({ field: singleField, value: config.value });
    }

    return output;
  }

  private toColumnValueSql(
    column:
      | {
          dataType: string;
          udtName: string;
          udtNameRaw?: string;
        }
      | undefined,
    value: unknown,
  ): Prisma.Sql {
    if (value === undefined) return Prisma.sql`NULL`;
    if (!column || value === null) return Prisma.sql`${value as any}`;

    const dataType = String(column.dataType || '').toLowerCase();
    const udtName = String(column.udtName || '').toLowerCase();

    if (dataType === 'uuid' || udtName === 'uuid') {
      const normalized = String(value || '').trim();
      return normalized ? Prisma.sql`CAST(${normalized} AS UUID)` : Prisma.sql`NULL`;
    }

    if (dataType === 'date' || udtName === 'date') {
      if (value instanceof Date) {
        return Prisma.sql`CAST(${value.toISOString().slice(0, 10)} AS DATE)`;
      }
      const normalized = String(value || '').trim();
      return normalized ? Prisma.sql`CAST(${normalized} AS DATE)` : Prisma.sql`NULL`;
    }

    if (dataType.includes('timestamp') || udtName.includes('timestamp')) {
      if (value instanceof Date) {
        return Prisma.sql`CAST(${value.toISOString()} AS TIMESTAMP)`;
      }
      const normalized = String(value || '').trim();
      return normalized ? Prisma.sql`CAST(${normalized} AS TIMESTAMP)` : Prisma.sql`NULL`;
    }

    if (
      dataType === 'integer' ||
      udtName === 'int2' ||
      udtName === 'int4' ||
      udtName === 'int8' ||
      dataType === 'smallint' ||
      dataType === 'bigint'
    ) {
      const normalized = Number(value);
      return Number.isFinite(normalized) ? Prisma.sql`CAST(${Math.trunc(normalized)} AS BIGINT)` : Prisma.sql`NULL`;
    }

    if (
      dataType === 'numeric' ||
      dataType === 'decimal' ||
      dataType === 'real' ||
      dataType === 'double precision' ||
      udtName === 'numeric' ||
      udtName === 'float4' ||
      udtName === 'float8'
    ) {
      const normalized = String(value ?? '').trim();
      return normalized ? Prisma.sql`CAST(${normalized} AS NUMERIC)` : Prisma.sql`NULL`;
    }

    if (dataType === 'boolean' || udtName === 'bool') {
      if (typeof value === 'boolean') return Prisma.sql`${value}`;
      const normalized = String(value || '').trim().toLowerCase();
      if (!normalized) return Prisma.sql`NULL`;
      return Prisma.sql`CAST(${['1', 'true', 'sim', 'yes'].includes(normalized)} AS BOOLEAN)`;
    }

    if (dataType === 'json' || dataType === 'jsonb' || udtName === 'json' || udtName === 'jsonb') {
      return Prisma.sql`CAST(${JSON.stringify(value)} AS JSONB)`;
    }

    if (dataType === 'user-defined' && column.udtNameRaw) {
      return Prisma.sql`CAST(${String(value ?? '').trim()} AS ${Prisma.raw(`"${column.udtNameRaw}"`)})`;
    }

    return Prisma.sql`${value as any}`;
  }
}
