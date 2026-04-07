import { Injectable } from '@nestjs/common';
import { Prisma, status_config_entity } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ModuleAreaKey } from '../billing-plans/module-areas';
import { TenantModulesResolverService } from '../billing-plans/tenant-modules-resolver.service';
import { BillingAreaEntityConfigService } from '../billing-plans/billing-area-entity-config.service';
import { ENTITY_REGISTRY_BY_ENTITY } from '../admin-config/entity-registry';
import { shouldExposeEntityInAutomationCatalog } from './automation-entity-policy';

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
  writable: boolean;
  required: boolean;
  relationEntity?: string;
  relationLabel?: string;
  options?: AutomationAiFieldOption[];
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
  udtNameRaw?: string;
  isIdentity: boolean;
  columnDefault: string | null;
  isNullable: boolean;
};

export type AutomationAiFieldOption = {
  value: string;
  label: string;
};

export type AutomationAiFieldCatalog = {
  name: string;
  label: string;
  dataType: string;
  writable: boolean;
  required: boolean;
  aliases: string[];
  relationEntity?: string;
  relationLabel?: string;
  options?: AutomationAiFieldOption[];
};

export type AutomationAiEntityCatalog = {
  name: string;
  label: string;
  aliases: string[];
  route?: string;
  fields: AutomationAiFieldCatalog[];
};

type OptionSetRow = {
  entity: string;
  field: string;
  options: Array<{ value: string; label: string }>;
};

type StatusConfigRow = {
  entity: status_config_entity;
  code: string;
  label: string;
  legacy_int_value: number | null;
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

  private readonly importantFieldNames = new Set<string>([
    'name',
    'title',
    'description',
    'notes',
    'status',
    'status_config_id',
    'company_id',
    'customer_id',
    'client_id',
    'owner_user_id',
    'assigned_user_id',
    'invoice_id',
    'contract_id',
    'opportunity_id',
    'lead_id',
    'process_id',
    'project_id',
    'document_id',
    'currency_id',
    'category_id',
    'cost_center_id',
    'title_number',
    'invoice_number',
    'payable_number',
    'code',
    'email',
    'phone',
      'amount',
      'total',
      'received_amount_brl',
      'subtotal',
      'original_amount',
    'paid_amount',
    'outstanding_amount',
    'issue_date',
    'due_date',
    'payment_date',
    'paid_at',
    'issued_at',
    'quote_at',
    'created_at',
    'updated_at',
  ]);

  private readonly fieldAliasMap = new Map<string, string[]>([
    ['company_id', ['empresa', 'cliente', 'company', 'customer']],
    ['customer_id', ['cliente', 'customer']],
    ['client_id', ['cliente', 'customer']],
    ['owner_user_id', ['responsavel', 'responsável', 'owner']],
    ['assigned_user_id', ['responsavel', 'responsável', 'assigned']],
    ['status', ['status', 'situação', 'situacao', 'estado']],
    ['status_config_id', ['status', 'etapa', 'situação', 'situacao']],
    ['title_number', ['numero do titulo', 'número do título', 'titulo', 'título']],
    ['invoice_number', ['numero da fatura', 'número da fatura', 'invoice', 'fatura']],
    ['payable_number', ['numero da conta a pagar', 'número da conta a pagar']],
    ['due_date', ['data de vencimento', 'vencimento']],
    ['issue_date', ['data de emissao', 'data de emissão', 'emissão', 'emissao']],
    ['payment_date', ['data do pagamento', 'pagamento']],
      ['paid_at', ['data do pagamento', 'marcado como pago', 'pago em']],
      ['original_amount', ['valor', 'valor total', 'montante']],
      ['received_amount_brl', ['recebimento real', 'valor em real', 'valor em reais', 'valor convertido', 'recebimento em real']],
      ['total', ['valor total', 'total']],
    ['subtotal', ['subtotal']],
    ['description', ['descricao', 'descrição']],
    ['notes', ['observacoes', 'observações', 'notas']],
  ]);

  private readonly entityAliasMap = new Map<string, string[]>([
    ['boards', ['boards', 'board', 'quadros', 'quadro', 'kanban', 'pipeline board']],
    ['board_columns', ['colunas do board', 'colunas', 'coluna', 'stages do board', 'stage do board', 'board columns', 'board column']],
    ['board_cards', ['cards do board', 'cards', 'card', 'itens do board', 'item do board']],
    ['incidents', ['incidentes', 'incidente', 'chamados', 'chamado', 'ticket', 'tickets']],
    ['financial_receivables', ['contas a receber', 'conta a receber', 'recebiveis', 'recebíveis', 'receivable', 'receivables']],
    ['financial_payables', ['contas a pagar', 'conta a pagar', 'payable', 'payables']],
    ['invoices', ['faturas', 'fatura', 'invoice', 'invoices']],
    ['companies', ['empresas', 'empresa', 'clientes', 'cliente', 'companies', 'company']],
    ['leads', ['lead', 'leads']],
    ['opportunities', ['oportunidades', 'oportunidade', 'opportunity', 'opportunities']],
    ['contracts', ['contratos', 'contrato', 'contract', 'contracts']],
    ['documents', ['documentos', 'documento', 'document', 'documents']],
    ['users', ['usuarios', 'usuários', 'usuario', 'usuário', 'users', 'user']],
    ['financial_bank_accounts', ['contas bancarias', 'contas bancárias', 'conta bancaria', 'conta bancária', 'bank accounts']],
    ['financial_categories', ['categorias financeiras', 'categorias', 'categoria financeira', 'categoria']],
    ['financial_cost_centers', ['centros de custo', 'centro de custo', 'cost centers', 'cost center']],
  ]);

  private readonly aiCatalogCache = new Map<string, { expiresAt: number; value: AutomationAiEntityCatalog[] }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantModulesResolverService: TenantModulesResolverService,
    private readonly billingAreaEntityConfigService: BillingAreaEntityConfigService,
  ) {}

  private async getEnabledAreaSet(tenantId?: string): Promise<Set<string>> {
    if (!tenantId) return new Set<string>();
    const areas = await this.tenantModulesResolverService.getEnabledAreas(tenantId);
    return new Set((areas || []).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean));
  }

  async listEntities(tenantId?: string): Promise<AutomationEntityMetadata[]> {
    const [enabledAreaSet, entityAreaMap] = await Promise.all([
      this.getEnabledAreaSet(tenantId),
      tenantId
        ? this.billingAreaEntityConfigService.getEntityAreaMapSnapshot()
        : Promise.resolve<Map<string, ModuleAreaKey> | null>(null),
    ]);
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
      .filter((name) => name && !this.excludedEntities.has(name) && shouldExposeEntityInAutomationCatalog(name))
      .filter(
        (name) =>
          !tenantId ||
          this.billingAreaEntityConfigService.isEntityAllowedWithMap(name, enabledAreaSet, entityAreaMap),
      )
      .map((name) => ({
        name,
        label: this.getEntityLabel(name),
      }));
  }

  async buildAiCatalog(tenantId?: string): Promise<AutomationAiEntityCatalog[]> {
    const cacheKey = tenantId || 'public';
    const cached = this.aiCatalogCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const entities = await this.listEntities(tenantId);
    const entityNameSet = new Set(entities.map((entity) => entity.name));
    const [statusConfigMap, optionSetMap] = await Promise.all([
      tenantId ? this.loadStatusConfigMap(tenantId) : Promise.resolve(new Map<string, AutomationAiFieldOption[]>()),
      tenantId ? this.loadOptionSetMap(tenantId) : Promise.resolve(new Map<string, AutomationAiFieldOption[]>()),
    ]);

    const catalog = await Promise.all(
      entities.map(async (entity) => {
        const columns = await this.listEntityColumns(entity.name, tenantId);
        const fields = this.selectImportantAiFields(
          columns.map((column) =>
            this.toAiFieldCatalog({
              entityName: entity.name,
              entityLabel: entity.label,
              column,
              entityNameSet,
              optionSetMap,
              statusConfigMap,
            }),
          ),
        );

        return {
          name: entity.name,
          label: entity.label,
          aliases: this.buildEntityAliases(entity.name, entity.label),
          route: ENTITY_REGISTRY_BY_ENTITY.get(entity.name)?.route,
          fields,
        } satisfies AutomationAiEntityCatalog;
      }),
    );

    this.aiCatalogCache.set(cacheKey, {
      expiresAt: Date.now() + 5 * 60 * 1000,
      value: catalog,
    });

    return catalog;
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
        udtNameRaw: String(row.udt_name || '').trim(),
        isIdentity: String(row.is_identity || '').toUpperCase() === 'YES',
        columnDefault: row.column_default ? String(row.column_default) : null,
        isNullable: String(row.is_nullable || '').toUpperCase() === 'YES',
      }))
      .filter((row) => row.name && this.isSafeIdentifier(row.name));
  }

  async listUpdatableFields(entityName: string, tenantId?: string): Promise<AutomationFieldMetadata[]> {
    return this.listFields(entityName, tenantId, { writableOnly: true });
  }

  async listFields(
    entityName: string,
    tenantId?: string,
    options?: { writableOnly?: boolean },
  ): Promise<AutomationFieldMetadata[]> {
    const normalizedEntityName = String(entityName || '').trim().toLowerCase();
    const columns = await this.listEntityColumns(normalizedEntityName, tenantId);
    const entityNameSet = new Set((await this.listEntities(tenantId)).map((entity) => entity.name));
    const [statusConfigMap, optionSetMap] = await Promise.all([
      tenantId ? this.loadStatusConfigMap(tenantId) : Promise.resolve(new Map<string, AutomationAiFieldOption[]>()),
      tenantId ? this.loadOptionSetMap(tenantId) : Promise.resolve(new Map<string, AutomationAiFieldOption[]>()),
    ]);

    return columns
      .map((column) =>
        this.toFieldMetadata({
          entityName: normalizedEntityName,
          column,
          entityNameSet,
          optionSetMap,
          statusConfigMap,
        }),
      )
      .filter((field) => !options?.writableOnly || field.writable);
  }

  async searchRecords(params: {
    tenantId: string;
    entityName: string;
    query?: string;
    limit?: number;
    filters?: Record<string, unknown>;
  }): Promise<AutomationRecordLookupItem[]> {
    const tenantId = String(params.tenantId || '').trim();
    const entityName = String(params.entityName || '').trim().toLowerCase();
    const query = String(params.query || '').trim();
    const limit = this.normalizeLimit(params.limit);
    const filters =
      params.filters && typeof params.filters === 'object' && !Array.isArray(params.filters)
        ? (params.filters as Record<string, unknown>)
        : {};

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

    Object.entries(filters).forEach(([fieldName, rawValue]) => {
      const field = String(fieldName || '').trim().toLowerCase();
      const value = String(rawValue ?? '').trim();
      if (!field || !value) return;
      if (!columnNames.has(field) || !this.isSafeIdentifier(field)) return;
      const fieldSql = Prisma.raw(`"${field}"`);
      whereClauses.push(Prisma.sql`CAST(${fieldSql} AS TEXT) = ${value}`);
    });

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

  async findRecordById(params: {
    tenantId: string;
    entityName: string;
    recordId: string;
  }): Promise<Record<string, unknown> | null> {
    const tenantId = String(params.tenantId || '').trim();
    const entityName = String(params.entityName || '').trim().toLowerCase();
    const recordId = String(params.recordId || '').trim();

    if (!tenantId || !recordId || !this.isSafeIdentifier(entityName)) return null;

    const columns = await this.listEntityColumns(entityName, tenantId);
    const columnNames = new Set(columns.map((column) => column.name));
    if (!columnNames.has('id') || !columnNames.has('tenant_id')) return null;

    const tableSql = Prisma.raw(`"${entityName}"`);
    const rows = await this.prisma.raw.$queryRaw<Array<{ row_json: Record<string, unknown> | null }>>(Prisma.sql`
      SELECT to_jsonb(t) AS row_json
      FROM ${tableSql} t
      WHERE CAST(t."tenant_id" AS TEXT) = ${tenantId}
        AND CAST(t."id" AS TEXT) = ${recordId}
      LIMIT 1
    `);

    const row = rows?.[0]?.row_json;
    return row && typeof row === 'object' && !Array.isArray(row) ? row : null;
  }

  private async loadOptionSetMap(tenantId: string): Promise<Map<string, AutomationAiFieldOption[]>> {
    const rows = await this.prisma.raw.option_sets.findMany({
      where: { tenant_id: tenantId } as any,
      include: {
        options: {
          where: { is_active: true } as any,
          orderBy: [{ sort_order: 'asc' }, { label: 'asc' }],
          select: { value: true, label: true },
        },
      },
    });

    const map = new Map<string, AutomationAiFieldOption[]>();
    rows.forEach((row: any) => {
      const key = `${String(row?.entity || '').trim().toLowerCase()}:${String(row?.field || '').trim().toLowerCase()}`;
      const options = Array.isArray(row?.options)
        ? row.options
            .map((option: any) => ({
              value: String(option?.value || '').trim(),
              label: String(option?.label || '').trim(),
            }))
            .filter((option) => option.value || option.label)
        : [];
      if (key && options.length) {
        map.set(key, options);
      }
    });

    return map;
  }

  private async loadStatusConfigMap(tenantId: string): Promise<Map<string, AutomationAiFieldOption[]>> {
    const rows = await this.prisma.raw.status_configs.findMany({
      where: { tenant_id: tenantId, is_active: true } as any,
      orderBy: [{ entity: 'asc' }, { sort_order: 'asc' }, { label: 'asc' }],
      select: {
        entity: true,
        code: true,
        label: true,
        legacy_int_value: true,
      },
    });

    const entityMap = new Map<status_config_entity, string>([
      [status_config_entity.PROCESS, 'processes'],
      [status_config_entity.LEAD, 'leads'],
      [status_config_entity.INVOICE, 'invoices'],
      [status_config_entity.OPPORTUNITY, 'opportunities'],
      [status_config_entity.CONTRACT, 'contracts'],
    ]);

    const map = new Map<string, AutomationAiFieldOption[]>();
    (rows as StatusConfigRow[]).forEach((row) => {
      const entityName = entityMap.get(row.entity);
      if (!entityName) return;

      const options = map.get(entityName) || [];
      options.push({
        value: row.code || String(row.legacy_int_value ?? '').trim(),
        label: row.label,
      });

      if (row.legacy_int_value !== null && row.legacy_int_value !== undefined) {
        options.push({
          value: String(row.legacy_int_value),
          label: `${row.label} (${row.legacy_int_value})`,
        });
      }

      map.set(entityName, this.deduplicateOptions(options));
    });

    return map;
  }

  private toAiFieldCatalog(input: {
    entityName: string;
    entityLabel: string;
    column: AutomationEntityColumnMetadata;
    entityNameSet: Set<string>;
    optionSetMap: Map<string, AutomationAiFieldOption[]>;
    statusConfigMap: Map<string, AutomationAiFieldOption[]>;
  }): AutomationAiFieldCatalog {
    const relationEntity = this.resolveRelatedEntity(input.column.name, input.entityNameSet);
    const relationLabel = relationEntity ? this.getEntityLabel(relationEntity) : undefined;
    const options = this.resolveFieldOptions(
      input.entityName,
      input.column.name,
      input.optionSetMap,
      input.statusConfigMap,
    );

    return {
      name: input.column.name,
      label: this.toPtBrLabel(input.column.name),
      dataType: input.column.dataType || input.column.udtName,
      writable: this.isUserWritableColumn(input.column),
      required: this.isFieldRequired(input.column),
      aliases: this.buildFieldAliases(input.column.name, relationLabel),
      ...(relationEntity ? { relationEntity, relationLabel } : {}),
      ...(options.length ? { options } : {}),
    };
  }

  private toFieldMetadata(input: {
    entityName: string;
    column: AutomationEntityColumnMetadata;
    entityNameSet: Set<string>;
    optionSetMap: Map<string, AutomationAiFieldOption[]>;
    statusConfigMap: Map<string, AutomationAiFieldOption[]>;
  }): AutomationFieldMetadata {
    const relationEntity = this.resolveRelatedEntity(input.column.name, input.entityNameSet);
    const relationLabel = relationEntity ? this.getEntityLabel(relationEntity) : undefined;
    const options = this.resolveFieldOptions(
      input.entityName,
      input.column.name,
      input.optionSetMap,
      input.statusConfigMap,
    );

    return {
      name: input.column.name,
      label: this.toPtBrLabel(input.column.name),
      dataType: input.column.dataType || input.column.udtName,
      writable: this.isUserWritableColumn(input.column),
      required: this.isFieldRequired(input.column),
      ...(relationEntity ? { relationEntity, relationLabel } : {}),
      ...(options.length ? { options } : {}),
    };
  }

  private resolveFieldOptions(
    entityName: string,
    fieldName: string,
    optionSetMap: Map<string, AutomationAiFieldOption[]>,
    statusConfigMap: Map<string, AutomationAiFieldOption[]>,
  ): AutomationAiFieldOption[] {
    const key = `${entityName}:${fieldName}`;
    const optionSetOptions = optionSetMap.get(key) || [];

    if (fieldName === 'status' || fieldName === 'status_config_id') {
      return this.deduplicateOptions([...(statusConfigMap.get(entityName) || []), ...optionSetOptions]);
    }

    return optionSetOptions;
  }

  private selectImportantAiFields(fields: AutomationAiFieldCatalog[]): AutomationAiFieldCatalog[] {
    const sorted = fields
      .slice()
      .sort((left, right) => this.scoreFieldForAi(right) - this.scoreFieldForAi(left));

    const primary = sorted.slice(0, 18);
    const requiredSet = new Set(primary.map((field) => field.name));

    fields.forEach((field) => {
      if (field.required && !requiredSet.has(field.name) && primary.length < 24) {
        primary.push(field);
        requiredSet.add(field.name);
      }
    });

    return primary;
  }

  private scoreFieldForAi(field: AutomationAiFieldCatalog): number {
    let score = 0;
    if (this.importantFieldNames.has(field.name)) score += 50;
    if (field.required) score += 30;
    if (field.writable) score += 10;
    if (field.relationEntity) score += 8;
    if (field.options?.length) score += 12;
    if (field.dataType.includes('date') || field.dataType.includes('time')) score += 6;
    if (field.dataType.includes('decimal') || field.dataType.includes('numeric')) score += 6;
    return score;
  }

  private buildEntityAliases(entityName: string, label: string): string[] {
    const aliases = new Set<string>();
    [entityName, label, this.toPtBrLabel(entityName), ...this.entityAliasMap.get(entityName) || []]
      .forEach((value) => this.pushAlias(aliases, value));

    const singular = this.singularize(entityName);
    if (singular && singular !== entityName) {
      this.pushAlias(aliases, singular);
      this.pushAlias(aliases, this.toPtBrLabel(singular));
    }

    return Array.from(aliases);
  }

  private buildFieldAliases(fieldName: string, relationLabel?: string): string[] {
    const aliases = new Set<string>();
    [fieldName, this.toPtBrLabel(fieldName), ...(this.fieldAliasMap.get(fieldName) || [])].forEach((value) =>
      this.pushAlias(aliases, value),
    );

    if (fieldName.endsWith('_id')) {
      const base = fieldName.replace(/_id$/i, '');
      this.pushAlias(aliases, base);
      this.pushAlias(aliases, this.toPtBrLabel(base));
    }

    if (relationLabel) {
      this.pushAlias(aliases, relationLabel);
      this.pushAlias(aliases, this.singularize(relationLabel));
    }

    return Array.from(aliases);
  }

  private pushAlias(set: Set<string>, value: string | null | undefined) {
    const raw = String(value || '').trim();
    if (!raw) return;
    set.add(raw);
    set.add(this.normalizeSearchText(raw));
  }

  private getEntityLabel(entityName: string): string {
    return ENTITY_REGISTRY_BY_ENTITY.get(entityName)?.label || this.toPtBrLabel(entityName);
  }

  private resolveRelatedEntity(fieldName: string, entityNameSet: Set<string>): string | undefined {
    if (!fieldName.endsWith('_id')) return undefined;
    const base = fieldName.replace(/_id$/i, '').toLowerCase();

    const candidates = [
      `${base}s`,
      `${base}es`,
      base.endsWith('y') ? `${base.slice(0, -1)}ies` : '',
      base === 'company' ? 'companies' : '',
      base === 'currency' ? 'currencies' : '',
      base === 'category' ? 'financial_categories' : '',
      base === 'cost_center' ? 'financial_cost_centers' : '',
      base === 'bank_account' ? 'financial_bank_accounts' : '',
      base === 'document_type' ? 'hr_document_types' : '',
      base === 'employment_status' ? 'hr_employment_statuses' : '',
      base === 'marital_status' ? 'hr_marital_statuses' : '',
      base === 'status_config' ? 'status_configs' : '',
      base === 'owner_user' || base === 'assigned_user' || base === 'created_by_user' || base === 'updated_by_user'
        ? 'users'
        : '',
    ].filter(Boolean);

    return candidates.find((candidate) => entityNameSet.has(candidate));
  }

  private isUserWritableColumn(column: AutomationEntityColumnMetadata): boolean {
    if (!column.name) return false;
    if (this.systemColumns.has(column.name)) return false;
    if (column.isIdentity) return false;
    if ((column.columnDefault || '').toLowerCase().includes('nextval(')) return false;
    return true;
  }

  private isFieldRequired(column: AutomationEntityColumnMetadata): boolean {
    if (!this.isUserWritableColumn(column)) return false;
    if (column.isNullable) return false;
    if (column.columnDefault) return false;
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

  private deduplicateOptions(options: AutomationAiFieldOption[]): AutomationAiFieldOption[] {
    const seen = new Set<string>();
    return options.filter((option) => {
      const key = `${String(option.value || '').trim().toLowerCase()}::${String(option.label || '').trim().toLowerCase()}`;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private singularize(value: string): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.endsWith('ies')) return `${raw.slice(0, -3)}y`;
    if (raw.endsWith('ses')) return raw.slice(0, -2);
    if (raw.endsWith('s') && raw.length > 1) return raw.slice(0, -1);
    return raw;
  }

  private normalizeSearchText(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private toPtBrLabel(value: string): string {
    return value
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
