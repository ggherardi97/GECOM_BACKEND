import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeText } from './metadata-designer.helpers';

type GuardRow = {
  id: string;
  tenant_id: string;
  entity_name: string;
  block_schema_edit: boolean;
  block_field_edit: boolean;
  block_form_edit: boolean;
  notes: string | null;
};

@Injectable()
export class MetadataGuardService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDocumentGuards(tenantId: string): Promise<void> {
    const normalizedTenantId = normalizeText(tenantId);
    if (!normalizedTenantId) return;

    const seeds = [
      {
        entity_name: 'documents',
        notes: 'Protected R2 documents module: schema/field/form editing blocked.',
      },
      {
        entity_name: 'my_documents',
        notes: 'Protected alias for documents module.',
      },
    ];

    for (const seed of seeds) {
      await this.prisma.raw.$executeRaw(
        Prisma.sql`
          INSERT INTO "metadata_entity_guard" (
            "tenant_id",
            "entity_name",
            "block_schema_edit",
            "block_field_edit",
            "block_form_edit",
            "notes"
          )
          VALUES (
            ${normalizedTenantId}::uuid,
            ${seed.entity_name},
            true,
            true,
            true,
            ${seed.notes}
          )
          ON CONFLICT ("tenant_id", "entity_name")
          DO UPDATE SET
            "block_schema_edit" = EXCLUDED."block_schema_edit",
            "block_field_edit" = EXCLUDED."block_field_edit",
            "block_form_edit" = EXCLUDED."block_form_edit",
            "notes" = EXCLUDED."notes",
            "updated_at" = now()
        `,
      );
    }
  }

  async getGuard(tenantId: string, entityName: string): Promise<GuardRow | null> {
    const normalizedEntityName = normalizeText(entityName).toLowerCase();
    if (!normalizedEntityName) return null;

    await this.ensureDocumentGuards(tenantId);

    const rows = await this.prisma.raw.$queryRaw<GuardRow[]>(
      Prisma.sql`
        SELECT *
        FROM "metadata_entity_guard"
        WHERE "tenant_id" = ${normalizeText(tenantId)}::uuid
          AND lower("entity_name") = ${normalizedEntityName}
        LIMIT 1
      `,
    );
    return rows[0] || null;
  }

  assertAllowedByGuard(
    guard: GuardRow | null,
    operation: 'schema' | 'field' | 'form',
    customMessage?: string,
  ): void {
    if (!guard) return;

    if (operation === 'schema' && guard.block_schema_edit) {
      throw new ForbiddenException(customMessage || 'Schema editing is blocked for this entity.');
    }
    if (operation === 'field' && guard.block_field_edit) {
      throw new ForbiddenException(customMessage || 'Field editing is blocked for this entity.');
    }
    if (operation === 'form' && guard.block_form_edit) {
      throw new ForbiddenException(customMessage || 'Form editing is blocked for this entity.');
    }
  }
}
