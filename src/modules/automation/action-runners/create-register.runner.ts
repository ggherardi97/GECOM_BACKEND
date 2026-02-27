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
    const valueSql = finalEntries.map(([, value]) => Prisma.sql`${value as any}`);

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
}
