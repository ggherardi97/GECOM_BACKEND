import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMetadataFormDto } from './dto/create-metadata-form.dto';
import { UpdateMetadataFormDto } from './dto/update-metadata-form.dto';
import { FieldSecurityResolverService } from './field-security-resolver.service';
import { MetadataEntitiesService } from './metadata-entities.service';
import { MetadataGuardService } from './metadata-guard.service';
import { normalizeText } from './metadata-designer.helpers';
import { MetadataAuthUser, MetadataFormType } from './metadata-designer.types';

type FormRow = {
  id: string;
  tenant_id: string;
  entity_id: string;
  name: string;
  display_name: string;
  form_type: MetadataFormType;
  is_default: boolean;
  definition_json: any;
  draft_version: number;
  published_version: number | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class MetadataFormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitiesService: MetadataEntitiesService,
    private readonly guardService: MetadataGuardService,
    private readonly fieldSecurityResolverService: FieldSecurityResolverService,
  ) {}

  async listByEntity(user: MetadataAuthUser, entityId: string, includeInactive = false) {
    const entity = await this.entitiesService.getByIdOrThrow(user.tenant_id, entityId);
    await this.ensureMainFormIfMissing(user.tenant_id, entity.id, Boolean(entity.is_form_editable));

    const rows = await this.prisma.raw.$queryRaw<FormRow[]>(
      Prisma.sql`
        SELECT *
        FROM "metadata_forms"
        WHERE "tenant_id" = ${user.tenant_id}::uuid
          AND "entity_id" = ${entity.id}::uuid
          ${includeInactive ? Prisma.sql`` : Prisma.sql`AND "is_active" = true`}
        ORDER BY
          CASE WHEN "is_default" = true THEN 0 ELSE 1 END,
          "form_type" ASC,
          "display_name" ASC
      `,
    );

    const [fields, permissions] = await Promise.all([
      this.prisma.raw.$queryRaw<Array<{ id: string; name: string }>>(
        Prisma.sql`
          SELECT "id", "name"
          FROM "metadata_fields"
          WHERE "tenant_id" = ${user.tenant_id}::uuid
            AND "entity_id" = ${entity.id}::uuid
            AND "is_active" = true
        `,
      ),
      this.fieldSecurityResolverService.resolveForUser(user.tenant_id, user.id, entity.id),
    ]);

    const fieldIdByName = new Map(
      fields
        .map((field) => [normalizeText(field.name).toLowerCase(), normalizeText(field.id)] as const)
        .filter((entry) => entry[0] && entry[1]),
    );

    return rows.map((row) => ({
      ...row,
      definition_json: this.applyDefinitionSecurity(row.definition_json || {}, fieldIdByName, permissions),
    }));
  }

  async create(user: MetadataAuthUser, entityId: string, dto: CreateMetadataFormDto) {
    const entity = await this.entitiesService.getByIdOrThrow(user.tenant_id, entityId);
    const guard = await this.guardService.getGuard(user.tenant_id, entity.name);

    if (!entity.is_form_editable) {
      throw new ForbiddenException('Form editing is disabled for this entity.');
    }
    this.guardService.assertAllowedByGuard(guard, 'form', 'Form editing is blocked for this entity.');

    const formType = this.normalizeFormType(dto.form_type);
    const name = normalizeText(dto.name).toLowerCase();
    if (!name) throw new BadRequestException('name is required.');

    if (dto.is_default) {
      await this.clearDefaultForm(user.tenant_id, entity.id, formType);
    }

    const rows = await this.prisma.raw.$queryRaw<FormRow[]>(
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
          ${entity.id}::uuid,
          ${name},
          ${normalizeText(dto.display_name) || name},
          ${formType}::metadata_form_type_enum,
          ${Boolean(dto.is_default)},
          ${JSON.stringify(dto.definition_json || { tabs: [] })}::jsonb,
          1,
          ${dto.is_active === undefined ? true : Boolean(dto.is_active)}
        )
        RETURNING *
      `,
    );

    await this.entitiesService.bumpDraftVersion(user.tenant_id, entity.id);
    return rows[0] || null;
  }

  async update(user: MetadataAuthUser, formId: string, dto: UpdateMetadataFormDto) {
    const form = await this.getFormByIdOrThrow(user.tenant_id, formId);
    const entity = await this.entitiesService.getByIdOrThrow(user.tenant_id, form.entity_id);
    const guard = await this.guardService.getGuard(user.tenant_id, entity.name);

    if (!entity.is_form_editable) {
      throw new ForbiddenException('Form editing is disabled for this entity.');
    }
    this.guardService.assertAllowedByGuard(guard, 'form', 'Form editing is blocked for this entity.');

    const nextFormType = dto.form_type ? this.normalizeFormType(dto.form_type) : form.form_type;
    if (dto.is_default === true) {
      await this.clearDefaultForm(user.tenant_id, form.entity_id, nextFormType, form.id);
    }

    const sets: Prisma.Sql[] = [];
    if (dto.display_name !== undefined) sets.push(Prisma.sql`"display_name" = ${normalizeText(dto.display_name)}`);
    if (dto.form_type !== undefined) sets.push(Prisma.sql`"form_type" = ${nextFormType}::metadata_form_type_enum`);
    if (dto.is_default !== undefined) sets.push(Prisma.sql`"is_default" = ${Boolean(dto.is_default)}`);
    if (dto.definition_json !== undefined) {
      sets.push(Prisma.sql`"definition_json" = ${JSON.stringify(dto.definition_json || {})}::jsonb`);
    }
    if (dto.is_active !== undefined) sets.push(Prisma.sql`"is_active" = ${Boolean(dto.is_active)}`);
    sets.push(Prisma.sql`"draft_version" = "draft_version" + 1`);
    sets.push(Prisma.sql`"updated_at" = now()`);

    const rows = await this.prisma.raw.$queryRaw<FormRow[]>(
      Prisma.sql`
        UPDATE "metadata_forms"
        SET ${Prisma.join(sets, ', ')}
        WHERE "tenant_id" = ${user.tenant_id}::uuid
          AND "id" = ${form.id}::uuid
        RETURNING *
      `,
    );

    await this.entitiesService.bumpDraftVersion(user.tenant_id, form.entity_id);
    return rows[0] || null;
  }

  async publishForm(user: MetadataAuthUser, entityId: string, formId: string) {
    const form = await this.getFormByIdOrThrow(user.tenant_id, formId);
    if (normalizeText(form.entity_id) !== normalizeText(entityId)) {
      throw new BadRequestException('Form does not belong to this entity.');
    }

    const rows = await this.prisma.raw.$queryRaw<FormRow[]>(
      Prisma.sql`
        UPDATE "metadata_forms"
        SET
          "published_version" = "draft_version",
          "updated_at" = now()
        WHERE "tenant_id" = ${user.tenant_id}::uuid
          AND "id" = ${form.id}::uuid
        RETURNING *
      `,
    );

    return rows[0] || null;
  }

  async resolveFormForContext(user: MetadataAuthUser, entityId: string, context: string) {
    const normalizedContext = normalizeText(context).toUpperCase();
    const forms = await this.listByEntity(user, entityId, false);
    const activeForms = forms.filter((form) => Boolean(form.is_active));

    const pickDefault = (type: MetadataFormType) =>
      activeForms.find((form) => form.form_type === type && form.is_default) ||
      activeForms.find((form) => form.form_type === type) ||
      null;

    if (normalizedContext === 'SIDE_PANEL_CREATE') {
      return (
        pickDefault('SIDE_PANEL_CREATE') ||
        pickDefault('QUICK_CREATE') ||
        pickDefault('MAIN') ||
        null
      );
    }

    if (normalizedContext === 'QUICK_CREATE') {
      return pickDefault('QUICK_CREATE') || pickDefault('MAIN') || null;
    }

    return pickDefault('MAIN') || activeForms[0] || null;
  }

  async getFormByIdOrThrow(tenantId: string, formId: string): Promise<FormRow> {
    const normalizedId = normalizeText(formId);
    if (!normalizedId) throw new BadRequestException('formId is required.');

    const rows = await this.prisma.raw.$queryRaw<FormRow[]>(
      Prisma.sql`
        SELECT *
        FROM "metadata_forms"
        WHERE "tenant_id" = ${tenantId}::uuid
          AND "id" = ${normalizedId}::uuid
        LIMIT 1
      `,
    );

    if (!rows[0]) {
      throw new NotFoundException('Metadata form not found.');
    }
    return rows[0];
  }

  private async clearDefaultForm(
    tenantId: string,
    entityId: string,
    formType: MetadataFormType,
    exceptFormId?: string,
  ) {
    await this.prisma.raw.$executeRaw(
      Prisma.sql`
        UPDATE "metadata_forms"
        SET
          "is_default" = false,
          "updated_at" = now()
        WHERE "tenant_id" = ${tenantId}::uuid
          AND "entity_id" = ${entityId}::uuid
          AND "form_type" = ${formType}::metadata_form_type_enum
          ${exceptFormId ? Prisma.sql`AND "id" <> ${exceptFormId}::uuid` : Prisma.sql``}
      `,
    );
  }

  private normalizeFormType(value: unknown): MetadataFormType {
    const normalized = normalizeText(value).toUpperCase();
    if (normalized === 'MAIN') return 'MAIN';
    if (normalized === 'QUICK_CREATE') return 'QUICK_CREATE';
    if (normalized === 'SIDE_PANEL_CREATE') return 'SIDE_PANEL_CREATE';
    throw new BadRequestException('form_type must be MAIN, QUICK_CREATE or SIDE_PANEL_CREATE.');
  }

  private async ensureMainFormIfMissing(tenantId: string, entityId: string, canEditForms: boolean): Promise<void> {
    if (!canEditForms) return;

    const countRows = await this.prisma.raw.$queryRaw<Array<{ total: number | string }>>(
      Prisma.sql`
        SELECT COUNT(1)::int AS "total"
        FROM "metadata_forms"
        WHERE "tenant_id" = ${tenantId}::uuid
          AND "entity_id" = ${entityId}::uuid
      `,
    );
    const total = Number(countRows?.[0]?.total || 0);
    if (total > 0) return;

    const fieldRows = await this.prisma.raw.$queryRaw<Array<{ name: string }>>(
      Prisma.sql`
        SELECT "name"
        FROM "metadata_fields"
        WHERE "tenant_id" = ${tenantId}::uuid
          AND "entity_id" = ${entityId}::uuid
          AND "is_active" = true
        ORDER BY "is_system" ASC, "display_name" ASC, "name" ASC
      `,
    );

    const fields = fieldRows
      .map((row) => normalizeText(row?.name))
      .filter((name) => !!name);

    const definition = {
      tabs: [
        {
          id: 'principal',
          label: 'Principal',
          sections: [
            {
              id: 'geral',
              label: 'Geral',
              fields,
            },
          ],
        },
      ],
    };

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
        SELECT
          ${tenantId}::uuid,
          ${entityId}::uuid,
          'main',
          'Principal',
          'MAIN'::metadata_form_type_enum,
          true,
          ${JSON.stringify(definition)}::jsonb,
          1,
          true
        WHERE NOT EXISTS (
          SELECT 1
          FROM "metadata_forms"
          WHERE "tenant_id" = ${tenantId}::uuid
            AND "entity_id" = ${entityId}::uuid
            AND "name" = 'main'
        )
      `,
    );
  }

  private applyDefinitionSecurity(
    definition: Record<string, any>,
    fieldIdByName: Map<string, string>,
    permissionsByFieldId: Record<string, { can_view: boolean; can_edit: boolean }>,
  ): Record<string, any> {
    const applyNode = (node: any): any => {
      if (Array.isArray(node)) {
        return node.map((item) => applyNode(item)).filter((item) => item !== null);
      }

      if (!node || typeof node !== 'object') return node;

      const clone: Record<string, any> = {};
      for (const [key, value] of Object.entries(node)) {
        if (key === 'fields' && Array.isArray(value)) {
          const fieldsValue = value.map((item) => applyNode(item)).filter((item) => item !== null);
          clone[key] = fieldsValue;
          continue;
        }
        clone[key] = applyNode(value);
      }

      const explicitFieldName = normalizeText((clone as any).field).toLowerCase();
      const explicitName = normalizeText((clone as any).name).toLowerCase();
      const candidateFieldName = explicitFieldName || (this.looksLikeFieldNode(clone) ? explicitName : '');

      if (candidateFieldName) {
        const fieldId = fieldIdByName.get(candidateFieldName);
        const permission = fieldId ? permissionsByFieldId[fieldId] : null;
        if (permission && !permission.can_view) {
          return null;
        }
        if (permission && !permission.can_edit) {
          clone.readOnly = true;
        }
      }

      if (Array.isArray(clone.fields) && clone.fields.every((item) => typeof item === 'string')) {
        clone.fields = clone.fields.filter((item) => {
          const fieldName = normalizeText(item).toLowerCase();
          const fieldId = fieldIdByName.get(fieldName);
          if (!fieldId) return true;
          const permission = permissionsByFieldId[fieldId];
          return permission ? permission.can_view : true;
        });
      }

      return clone;
    };

    return applyNode(definition || {}) || {};
  }

  private looksLikeFieldNode(node: Record<string, any>): boolean {
    const type = normalizeText(node.type).toLowerCase();
    if (type === 'field') return true;
    return typeof node.field === 'string';
  }
}
