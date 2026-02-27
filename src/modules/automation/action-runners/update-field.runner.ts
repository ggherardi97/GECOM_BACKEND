import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AutomationMetadataService } from '../automation-metadata.service';
import { AutomationActionRunner, ActionRunnerArgs } from './automation-action-runner.interface';
import { renderTemplateValue } from './template.util';

@Injectable()
export class UpdateFieldActionRunner implements AutomationActionRunner {
  readonly type = 'UPDATE_FIELD' as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metadataService: AutomationMetadataService,
  ) {}

  async run({ action, context, accumulatedOutput }: ActionRunnerArgs): Promise<Record<string, unknown>> {
    const config = (action.config ?? {}) as Record<string, unknown>;
    const entityName = String(config.entityName ?? context.entityName ?? '')
      .trim()
      .toLowerCase();

    const templateSource = {
      tenantId: context.tenantId,
      userId: context.userId,
      recordId: context.recordId,
      entityName: context.entityName,
      payload: context.payload ?? {},
      output: accumulatedOutput,
    } as Record<string, unknown>;

    const resolvedRecordId = String(
      renderTemplateValue(config.recordId ?? config.record_id ?? context.recordId ?? '', templateSource),
    ).trim();

    if (!resolvedRecordId) {
      return {
        skipped: true,
        reason: 'recordId ausente no contexto/configuração da action.',
      };
    }

    const updatableFields = await this.metadataService.listUpdatableFields(entityName);
    if (!updatableFields.length) {
      return {
        skipped: true,
        reason: `Entidade ${entityName || '-'} não possui campos editáveis por automação.`,
      };
    }

    const columns = await this.metadataService.listEntityColumns(entityName);
    const columnSet = new Set(columns.map((column) => column.name));
    const updatableFieldSet = new Set(updatableFields.map((item) => item.name));
    const updates: Record<string, unknown> = {};

    this.collectConfiguredValues(config).forEach(({ field, value }) => {
      const normalizedField = String(field || '').trim().toLowerCase();
      if (!updatableFieldSet.has(normalizedField)) return;
      updates[normalizedField] = renderTemplateValue(value, templateSource);
    });

    if (!Object.keys(updates).length) {
      return {
        skipped: true,
        reason: 'Nenhum campo válido informado para atualização.',
      };
    }

    if (columnSet.has('updated_at') && !Object.prototype.hasOwnProperty.call(updates, 'updated_at')) {
      updates.updated_at = new Date();
    }

    const setClauses = Object.entries(updates).map(([field, value]) =>
      Prisma.sql`${Prisma.raw(`"${field}"`)} = ${value as any}`,
    );

    const affected = await this.prisma.raw.$executeRaw(
      Prisma.sql`
        UPDATE ${Prisma.raw(`"${entityName}"`)}
        SET ${Prisma.join(setClauses, ', ')}
        WHERE CAST("tenant_id" AS TEXT) = ${context.tenantId}
          AND "id" = ${resolvedRecordId}
      `,
    );

    return {
      updatedCount: Number(affected ?? 0),
      updatedFields: Object.keys(updates),
      recordId: resolvedRecordId,
      entityName,
    };
  }

  private collectConfiguredValues(
    config: Record<string, unknown>,
  ): Array<{ field: string; value: unknown }> {
    const output: Array<{ field: string; value: unknown }> = [];

    const pushEntries = (value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      Object.entries(value as Record<string, unknown>).forEach(([field, fieldValue]) => {
        output.push({ field, value: fieldValue });
      });
    };

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

    pushEntries(config.fields);
    pushEntries(config.values);
    pushArray(config.fieldMappings);
    pushArray(config.mappings);

    const singleField = String(config.field ?? '').trim();
    if (singleField) {
      output.push({ field: singleField, value: config.value });
    }

    return output;
  }
}
