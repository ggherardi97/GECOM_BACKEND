
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import OpenAI from 'openai';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveRelativeDateRange } from '../../common/utils/date-range.util';
import {
  dashboardAiResponseSchema,
  dashboardSpecSchema,
  gridDefinitionSchema,
  gridFilterAiResponseSchema,
  homeSearchAiResponseSchema,
} from './ai.schemas';
import {
  AI_SUPPORTED_ENTITIES,
  AuthUser,
  DashboardSpec,
  DashboardWidgetSpec,
  EntityDictionaryEntry,
  GridDefinitionJson,
  GridFilterItem,
  GridSortItem,
} from './ai.types';
import {
  buildDashboardSystemPrompt,
  buildDashboardUserPrompt,
  buildGridFilterSystemPrompt,
  buildGridFilterUserPrompt,
  buildHomeSearchPrompt,
  buildInsightsPrompt,
} from './ai.prompt';

type PrismaWhere = Prisma.InputJsonObject;
type PrismaOrderBy = Prisma.InputJsonObject[];
type PrismaSelect = Prisma.InputJsonObject;

class AiClient {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generateJson(args: { model: string; systemPrompt: string; userPrompt: string }): Promise<unknown> {
    const response = await this.client.responses.create({
      model: args.model,
      input: [
        { role: 'system', content: args.systemPrompt },
        { role: 'user', content: args.userPrompt },
      ],
    } as any);

    return this.extractJson(response);
  }

  private extractJson(response: any): unknown {
    if (response?.output_text && typeof response.output_text === 'string') {
      return this.parseJsonText(response.output_text);
    }

    const segments: string[] = [];
    const outputs = Array.isArray(response?.output) ? response.output : [];
    for (const output of outputs) {
      const contentList = Array.isArray(output?.content) ? output.content : [];
      for (const content of contentList) {
        if (typeof content?.text === 'string') {
          segments.push(content.text);
        }
      }
    }

    if (segments.length === 0) {
      throw new BadRequestException('A IA nao retornou conteudo JSON.');
    }

    return this.parseJsonText(segments.join('\n'));
  }

  private parseJsonText(text: string): unknown {
    const normalized = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    try {
      return JSON.parse(normalized);
    } catch {
      const firstBrace = normalized.indexOf('{');
      const lastBrace = normalized.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        const sliced = normalized.slice(firstBrace, lastBrace + 1);
        return JSON.parse(sliced);
      }
      throw new BadRequestException('Resposta da IA nao esta em JSON valido.');
    }
  }
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly aiClient: AiClient;
  private readonly filterModel: string;
  private readonly dashModel: string;

  private readonly entityDictionary: Record<string, EntityDictionaryEntry> = {
    companies: {
      entityName: 'companies',
      prismaDelegate: 'companies',
      labelPtBr: 'Empresas',
      defaultColumns: ['company_name', 'category', 'sector', 'phone', 'created_at'],
      fields: {
        id: { type: 'uuid', filterable: true, sortable: true, selectable: true },
        company_name: { type: 'string', filterable: true, sortable: true, selectable: true },
        company_number: { type: 'string', filterable: true, sortable: true, selectable: true },
        phone: { type: 'string', filterable: true, sortable: true, selectable: true },
        sector: { type: 'string', filterable: true, sortable: true, selectable: true },
        category: { type: 'string', filterable: true, sortable: true, selectable: true },
        address_city: { type: 'string', filterable: true, sortable: true, selectable: true },
        address_state: { type: 'string', filterable: true, sortable: true, selectable: true },
        language: { type: 'string', filterable: true, sortable: true, selectable: true },
        number_of_invoices: { type: 'number', filterable: true, sortable: true, selectable: true },
        created_at: { type: 'date', filterable: true, sortable: true, selectable: true },
        updated_at: { type: 'date', filterable: true, sortable: true, selectable: true },
      },
      restrictedRoles: ['USER', 'MANAGER', 'ADMIN', 'CUSTOMER'],
    },
    processes: {
      entityName: 'processes',
      prismaDelegate: 'processes',
      labelPtBr: 'Processos',
      defaultColumns: ['process_number', 'status', 'completed', 'invoice', 'created_on'],
      fields: {
        id: { type: 'uuid', filterable: true, sortable: true, selectable: true },
        process_number: { type: 'string', filterable: true, sortable: true, selectable: true },
        status: { type: 'number', filterable: true, sortable: true, selectable: true },
        completed: { type: 'number', filterable: true, sortable: true, selectable: true },
        invoice: { type: 'string', filterable: true, sortable: true, selectable: true },
        company_id: { type: 'uuid', filterable: true, sortable: true, selectable: true },
        primary_contact_id: { type: 'uuid', filterable: true, sortable: true, selectable: true },
        ship_date: { type: 'date', filterable: true, sortable: true, selectable: true },
        created_on: { type: 'date', filterable: true, sortable: true, selectable: true },
      },
      restrictedRoles: ['USER', 'MANAGER', 'ADMIN'],
    },
    invoices: {
      entityName: 'invoices',
      prismaDelegate: 'invoices',
      labelPtBr: 'Faturas',
      defaultColumns: ['invoice_number', 'status', 'total', 'issued_at', 'due_at'],
      fields: {
        id: { type: 'uuid', filterable: true, sortable: true, selectable: true },
        invoice_number: { type: 'string', filterable: true, sortable: true, selectable: true },
        company_id: { type: 'uuid', filterable: true, sortable: true, selectable: true },
        status: { type: 'number', filterable: true, sortable: true, selectable: true },
        subtotal: { type: 'number', filterable: true, sortable: true, selectable: true },
        discount_amount: { type: 'number', filterable: true, sortable: true, selectable: true },
        tax_total: { type: 'number', filterable: true, sortable: true, selectable: true },
        total: { type: 'number', filterable: true, sortable: true, selectable: true },
        quote_at: { type: 'date', filterable: true, sortable: true, selectable: true },
        issued_at: { type: 'date', filterable: true, sortable: true, selectable: true },
        due_at: { type: 'date', filterable: true, sortable: true, selectable: true },
        paid_at: { type: 'date', filterable: true, sortable: true, selectable: true },
        created_at: { type: 'date', filterable: true, sortable: true, selectable: true },
      },
      restrictedRoles: ['USER', 'MANAGER', 'ADMIN'],
    },
    products: {
      entityName: 'products',
      prismaDelegate: 'products',
      labelPtBr: 'Produtos',
      defaultColumns: ['product_code', 'name', 'brand', 'default_unit_price', 'is_active'],
      fields: {
        id: { type: 'uuid', filterable: true, sortable: true, selectable: true },
        product_code: { type: 'string', filterable: true, sortable: true, selectable: true },
        name: { type: 'string', filterable: true, sortable: true, selectable: true },
        brand: { type: 'string', filterable: true, sortable: true, selectable: true },
        unit: { type: 'string', filterable: true, sortable: true, selectable: true },
        currency_id: { type: 'uuid', filterable: true, sortable: true, selectable: true },
        default_unit_price: { type: 'number', filterable: true, sortable: true, selectable: true },
        default_tax_rate: { type: 'number', filterable: true, sortable: true, selectable: true },
        is_active: { type: 'boolean', filterable: true, sortable: true, selectable: true },
        created_at: { type: 'date', filterable: true, sortable: true, selectable: true },
      },
      restrictedRoles: ['USER', 'MANAGER', 'ADMIN'],
    },
    documents: {
      entityName: 'documents',
      prismaDelegate: 'documents',
      labelPtBr: 'Documentos',
      defaultColumns: ['name', 'item_type', 'related_table', 'created_at', 'size_bytes'],
      fields: {
        id: { type: 'uuid', filterable: true, sortable: true, selectable: true },
        account_id: { type: 'uuid', filterable: true, sortable: true, selectable: true },
        parent_id: { type: 'uuid', filterable: true, sortable: true, selectable: true },
        item_type: { type: 'enum', filterable: true, sortable: true, selectable: true },
        name: { type: 'string', filterable: true, sortable: true, selectable: true },
        ext: { type: 'string', filterable: true, sortable: true, selectable: true },
        mime_type: { type: 'string', filterable: true, sortable: true, selectable: true },
        size_bytes: { type: 'number', filterable: true, sortable: true, selectable: true },
        related_table: { type: 'string', filterable: true, sortable: true, selectable: true },
        related_id: { type: 'uuid', filterable: true, sortable: true, selectable: true },
        related_name: { type: 'string', filterable: true, sortable: true, selectable: true },
        upload_status: { type: 'enum', filterable: true, sortable: true, selectable: true },
        created_at: { type: 'date', filterable: true, sortable: true, selectable: true },
        updated_at: { type: 'date', filterable: true, sortable: true, selectable: true },
        deleted_at: { type: 'date', filterable: true, sortable: true, selectable: true },
      },
      restrictedRoles: ['USER', 'MANAGER', 'ADMIN', 'CUSTOMER'],
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey) {
      throw new InternalServerErrorException('OPENAI_API_KEY nao configurada.');
    }

    this.aiClient = new AiClient(apiKey);
    this.filterModel = this.configService.get<string>('OPENAI_MODEL_FILTER') ?? 'gpt-5-mini';
    this.dashModel = this.configService.get<string>('OPENAI_MODEL_DASH') ?? 'gpt-5.2';
  }

  async generateGridFilter(input: {
    user: AuthUser;
    entityName: string;
    naturalLanguage: string;
    currentViewDefinitionJson?: unknown;
  }) {
    const entity = this.resolveEntity(input.entityName);
    this.assertEntityPermission(input.user.role, entity);

    const aiJson = await this.aiClient.generateJson({
      model: this.filterModel,
      systemPrompt: buildGridFilterSystemPrompt(this.getEntityDictionaryArray()),
      userPrompt: buildGridFilterUserPrompt({
        naturalLanguage: input.naturalLanguage,
        entityName: entity.entityName,
        currentViewDefinitionJson: input.currentViewDefinitionJson,
      }),
    });

    const normalizedAiPayload = this.normalizeAiGridFilterPayload(aiJson);
    const parsed = gridFilterAiResponseSchema.safeParse(normalizedAiPayload);
    if (!parsed.success) {
      this.logger.warn(`Invalid grid-filter payload from AI: ${parsed.error.message}`);
      throw new BadRequestException('Nao foi possivel interpretar o filtro solicitado.');
    }

    const normalizedDefinition = this.normalizeGridDefinition(parsed.data.definition_json, entity.entityName);

    return {
      definition_json: normalizedDefinition,
      explanation_ptbr: parsed.data.explanation_ptbr,
    };
  }

  private normalizeAiGridFilterPayload(payload: unknown): unknown {
    if (!payload || typeof payload !== 'object') {
      return payload;
    }

    const root = payload as Record<string, any>;
    const definition = root.definition_json;

    if (!definition || typeof definition !== 'object') {
      return payload;
    }

    const normalizedDefinition = { ...(definition as Record<string, any>) };

    if (Array.isArray(normalizedDefinition.sort)) {
      normalizedDefinition.sort = normalizedDefinition.sort.map((item: any) => {
        if (!item || typeof item !== 'object') {
          return item;
        }

        const rawDirection = item.direction ?? item.dir;
        const normalizedDirection =
          typeof rawDirection === 'string'
            ? rawDirection.toLowerCase() === 'desc'
              ? 'desc'
              : 'asc'
            : item.direction;

        const normalizedItem = {
          ...item,
          direction: normalizedDirection,
        };

        if ('dir' in normalizedItem) {
          delete normalizedItem.dir;
        }

        return normalizedItem;
      });
    }

    return {
      ...root,
      definition_json: normalizedDefinition,
    };
  }

  async generateDashboard(input: { user: AuthUser; naturalLanguage: string; entityHints?: string[] }) {
    const aiJson = await this.aiClient.generateJson({
      model: this.filterModel,
      systemPrompt: buildDashboardSystemPrompt(this.getEntityDictionaryArray()),
      userPrompt: buildDashboardUserPrompt({
        naturalLanguage: input.naturalLanguage,
        entityHints: input.entityHints,
      }),
    });

    const normalizedAiPayload = this.normalizeAiDashboardPayload(aiJson);
    const parsed = dashboardAiResponseSchema.safeParse(normalizedAiPayload);
    let normalizedSpec: DashboardSpec;
    if (!parsed.success) {
      this.logger.warn(`Invalid dashboard payload from AI: ${parsed.error.message}`);
      normalizedSpec = this.buildFallbackDashboardSpec(input.entityHints, input.user.role);
    } else {
      normalizedSpec = this.normalizeDashboardSpec(parsed.data.dashboardSpec, input.user.role);
    }
    const specWithTimeRange = this.applyNaturalLanguageTimeRangeFallback(normalizedSpec, input.naturalLanguage);
    const data = await this.executeDashboardSpec(specWithTimeRange, input.user.tenant_id);

    let insights = parsed.success
      ? parsed.data.insights_ptbr ?? 'Nao foi possivel gerar insights automáticos.'
      : 'Nao foi possivel gerar insights automáticos.';
    try {
      const insightJson = await this.aiClient.generateJson({
        model: this.dashModel,
        systemPrompt: 'Voce resume dados de dashboard em PT-BR de forma objetiva e fiel aos dados.',
        userPrompt: buildInsightsPrompt(data),
      });
      const insightText = dashboardAiResponseSchema.pick({ insights_ptbr: true }).safeParse(insightJson);
      if (insightText.success && insightText.data.insights_ptbr) {
        insights = insightText.data.insights_ptbr;
      }
    } catch (error) {
      this.logger.warn(`Dashboard insights fallback: ${(error as Error).message}`);
    }

    return {
      dashboardSpec: specWithTimeRange,
      data,
      insights_ptbr: insights,
    };
  }

  private buildFallbackDashboardSpec(entityHints?: string[], userRole?: string): DashboardSpec {
    const candidateEntities = (entityHints ?? AI_SUPPORTED_ENTITIES)
      .map((item) => String(item).toLowerCase())
      .filter((item) => AI_SUPPORTED_ENTITIES.includes(item as any));

    const selectedEntity =
      candidateEntities.find((entityName) => {
        try {
          const entity = this.resolveEntity(entityName);
          this.assertEntityPermission(userRole, entity);
          return true;
        } catch {
          return false;
        }
      }) ?? 'invoices';

    const dateField = this.getDefaultDateField(selectedEntity) ?? undefined;

    const fallback: DashboardSpec = {
      title: 'Dashboard basico',
      widgets: [
        {
          id: 'kpi_total_registros',
          type: 'kpi',
          title: 'Total de registros',
          entityName: selectedEntity as any,
          metric: 'count',
        },
        ...(dateField
          ? [
              {
                id: 'serie_mensal_registros',
                type: 'timeSeries' as const,
                title: 'Evolucao mensal',
                entityName: selectedEntity as any,
                metric: 'count' as const,
                dateField,
              },
            ]
          : []),
      ],
    };

    return this.normalizeDashboardSpec(fallback, userRole);
  }

  private normalizeAiDashboardPayload(payload: unknown): unknown {
    if (!payload || typeof payload !== 'object') {
      return payload;
    }

    const root = payload as Record<string, any>;
    const rawDashboardSpec = root.dashboardSpec ?? root.dashboard_spec ?? null;
    const rawSpec =
      rawDashboardSpec && typeof rawDashboardSpec === 'object'
        ? rawDashboardSpec
        : {
            title: root.title,
            widgets: root.widgets,
          };

    const rawWidgets = Array.isArray(rawSpec.widgets) ? rawSpec.widgets : [];
    const widgets = rawWidgets
      .map((rawWidget: any, index: number) => {
        if (!rawWidget || typeof rawWidget !== 'object') {
          return null;
        }

        const rawType = String(rawWidget.type ?? '').trim();
        const type =
          rawType === 'timeseries'
            ? 'timeSeries'
            : rawType === 'topn'
              ? 'topN'
              : ['kpi', 'timeSeries', 'bar', 'pie', 'topN'].includes(rawType)
                ? rawType
                : undefined;

        const rawEntityName = String(rawWidget.entityName ?? rawWidget.entity ?? rawWidget.entity_name ?? '')
          .trim()
          .toLowerCase();

        const entityName = rawEntityName || undefined;
        const rawMetric = String(rawWidget.metric ?? rawWidget.aggregation ?? rawWidget.agg ?? 'count').trim().toLowerCase();
        const metric =
          rawMetric === 'sum' ||
          rawMetric === 'total' ||
          rawMetric === 'amount' ||
          rawMetric === 'soma' ||
          rawMetric === 'valor_total'
            ? 'sum'
            : rawMetric === 'avg' ||
                rawMetric === 'average' ||
                rawMetric === 'mean' ||
                rawMetric === 'media' ||
                rawMetric === 'média'
              ? 'avg'
              : rawMetric === 'count' ||
                  rawMetric === 'qty' ||
                  rawMetric === 'quantity' ||
                  rawMetric === 'quantidade' ||
                  rawMetric === 'qtd' ||
                  rawMetric === 'numero' ||
                  rawMetric === 'número'
                ? 'count'
                : 'count';
        const id = String(rawWidget.id ?? `widget_${index + 1}`).trim();
        const title = String(rawWidget.title ?? rawWidget.name ?? `${type ?? 'kpi'} ${entityName ?? ''}`).trim();
        const topNRaw = rawWidget.topN ?? rawWidget.top_n ?? rawWidget.limit;
        const topN = Number.isFinite(Number(topNRaw)) ? Number(topNRaw) : undefined;

        const normalizedWidget = {
          id,
          type,
          title,
          entityName,
          metric,
          field: rawWidget.field,
          dateField: rawWidget.dateField ?? rawWidget.date_field,
          groupByField: rawWidget.groupByField ?? rawWidget.group_by_field,
          topN,
          filters: Array.isArray(rawWidget.filters) ? rawWidget.filters : undefined,
        };

        return Object.fromEntries(Object.entries(normalizedWidget).filter(([, value]) => value !== undefined));
      })
      .filter((item): item is Record<string, any> => item !== null);

    return {
      dashboardSpec: {
        title: rawSpec.title,
        widgets,
      },
      insights_ptbr: root.insights_ptbr,
    };
  }

  async homeSearch(input: { user: AuthUser; query: string; entities?: string[] }) {
    const requestedEntities = (input.entities ?? AI_SUPPORTED_ENTITIES).map((item) => String(item).toLowerCase());
    const allowedEntities = requestedEntities.filter((item) => AI_SUPPORTED_ENTITIES.includes(item as any));

    const aiJson = await this.aiClient.generateJson({
      model: this.filterModel,
      systemPrompt: 'Retorne JSON puro sem markdown.',
      userPrompt: buildHomeSearchPrompt({
        query: input.query,
        entities: allowedEntities,
        entityDictionary: this.getEntityDictionaryArray(),
      }),
    });

    const parsed = homeSearchAiResponseSchema.safeParse(aiJson);
    if (!parsed.success) {
      throw new BadRequestException('Nao foi possivel interpretar a busca inicial.');
    }

    const results: any[] = [];

    for (const entityName of parsed.data.entities) {
      const entity = this.resolveEntity(entityName);
      this.assertEntityPermission(input.user.role, entity);

      const filters = this.normalizeFilters(parsed.data.filters ?? [], entity);
      const where = this.buildPrismaWhere(entity.entityName, filters, input.user.tenant_id);
      const select = this.buildHomeSearchSelect(entity.entityName);

      const rows = await this.getDelegate(entity.prismaDelegate).findMany({
        where,
        select,
        take: 5,
        orderBy: this.getDefaultOrderBy(entity.entityName),
      });

      for (const row of rows) {
        results.push(this.mapHomeSearchCard(entity.entityName, row));
      }
    }

    return {
      results,
      suggestedFilters: {
        entities: parsed.data.entities,
        filters: parsed.data.filters ?? [],
      },
    };
  }
  public buildPrismaWhere(entityName: string, filters: GridFilterItem[], tenantId: string): PrismaWhere {
    const entity = this.resolveEntity(entityName);
    const normalizedFilters = this.normalizeFilters(filters, entity);
    const andClauses: Prisma.InputJsonObject[] = [{ tenant_id: tenantId }];

    for (const filter of normalizedFilters) {
      const clause = this.filterToPrismaClause(entity, filter);
      if (clause) {
        andClauses.push(clause);
      }
    }

    return andClauses.length === 1 ? andClauses[0] : ({ AND: andClauses } as PrismaWhere);
  }

  public buildPrismaOrderBy(entityName: string, sortItems: GridSortItem[]): PrismaOrderBy {
    const entity = this.resolveEntity(entityName);
    const output: Prisma.InputJsonObject[] = [];

    for (const sortItem of sortItems) {
      const fieldConfig = entity.fields[sortItem.field];
      if (!fieldConfig || !fieldConfig.sortable) {
        continue;
      }
      output.push({ [sortItem.field]: sortItem.direction });
    }

    return output;
  }

  public buildPrismaSelect(entityName: string, columns: string[]): PrismaSelect {
    const entity = this.resolveEntity(entityName);
    const fallbackColumns = entity.defaultColumns.filter((column) => entity.fields[column]?.selectable);
    const finalColumns = (columns.length > 0 ? columns : fallbackColumns).filter((column) => entity.fields[column]?.selectable);

    const select: Record<string, boolean> = { id: true };
    for (const column of finalColumns) {
      select[column] = true;
    }

    return select as PrismaSelect;
  }

  private getDelegate(delegate: string): any {
    const target = (this.prisma as any)[delegate];
    if (!target) {
      throw new BadRequestException(`Delegate Prisma nao encontrado para ${delegate}.`);
    }
    return target;
  }

  private resolveEntity(entityName: string): EntityDictionaryEntry {
    const normalizedEntityName = String(entityName).toLowerCase().trim();
    const entity = this.entityDictionary[normalizedEntityName];
    if (!entity) {
      throw new BadRequestException('Entidade nao suportada para IA.');
    }
    return entity;
  }

  private assertEntityPermission(userRole: string | undefined, entity: EntityDictionaryEntry): void {
    const normalizedRole = (userRole ?? 'USER').toUpperCase();
    if (!entity.restrictedRoles || entity.restrictedRoles.includes(normalizedRole)) {
      return;
    }

    throw new ForbiddenException('Seu perfil nao possui permissao para consultar essa entidade.');
  }

  private getEntityDictionaryArray(): EntityDictionaryEntry[] {
    return Object.values(this.entityDictionary);
  }

  private normalizeGridDefinition(definition: GridDefinitionJson, forcedEntityName: string): GridDefinitionJson {
    const parsedDefinition = gridDefinitionSchema.parse({
      ...definition,
      entityName: forcedEntityName,
    });

    const entity = this.resolveEntity(parsedDefinition.entityName);
    const columns = parsedDefinition.columns.filter((column) => entity.fields[column]?.selectable);
    const filters = this.normalizeFilters(parsedDefinition.filters, entity);
    const sort = parsedDefinition.sort.filter((sortItem) => entity.fields[sortItem.field]?.sortable);
    const pageSize = Math.min(parsedDefinition.pageSize ?? 50, 200);

    const aggregations =
      parsedDefinition.aggregations
        ?.filter((aggregation) => {
          if (aggregation.metric === 'count') return true;
          if (!aggregation.field) return false;
          return entity.fields[aggregation.field]?.type === 'number';
        })
        .slice(0, 10) ?? [];

    return {
      entityName: entity.entityName,
      columns,
      filters,
      sort,
      pageSize,
      ...(aggregations.length > 0 ? { aggregations } : {}),
    };
  }

  private normalizeDashboardSpec(spec: DashboardSpec, userRole?: string): DashboardSpec {
    const parsed = dashboardSpecSchema.parse(spec);
    const widgets: DashboardWidgetSpec[] = [];

    for (const widget of parsed.widgets) {
      const entity = this.resolveEntity(widget.entityName);
      this.assertEntityPermission(userRole, entity);

      const normalizedWidget: DashboardWidgetSpec = {
        ...widget,
        topN: Math.min(widget.topN ?? 10, 50),
        filters: this.normalizeFilters(widget.filters ?? [], entity),
      };

      if (normalizedWidget.field && !entity.fields[normalizedWidget.field]) {
        continue;
      }
      if (normalizedWidget.groupByField && !entity.fields[normalizedWidget.groupByField]) {
        continue;
      }
      if (normalizedWidget.dateField && !entity.fields[normalizedWidget.dateField]) {
        continue;
      }

      const numericFields = this.getEntityFieldsByType(entity, ['number']);
      const groupableFields = this.getEntityFieldsByType(entity, ['string', 'enum', 'boolean']);
      const defaultDateField = this.getDefaultDateField(entity.entityName) ?? this.getEntityFieldsByType(entity, ['date'])[0];
      const preferredMetricField = this.getPreferredMetricField(entity.entityName, numericFields);

      if (
        normalizedWidget.metric !== 'count' &&
        normalizedWidget.field &&
        this.isLikelyCategoricalNumericField(entity.entityName, normalizedWidget.field)
      ) {
        if (preferredMetricField) {
          normalizedWidget.field = preferredMetricField;
        } else if (numericFields.length > 0) {
          normalizedWidget.field = numericFields[0];
        } else {
          normalizedWidget.metric = 'count';
          delete (normalizedWidget as any).field;
        }
      }

      if (normalizedWidget.metric !== 'count' && !normalizedWidget.field) {
        if (preferredMetricField) {
          normalizedWidget.field = preferredMetricField;
        } else if (numericFields.length > 0) {
          normalizedWidget.field = numericFields[0];
        } else {
          normalizedWidget.metric = 'count';
          delete (normalizedWidget as any).field;
        }
      }

      if (normalizedWidget.type === 'topN' && !normalizedWidget.field) {
        const fallbackTopField = numericFields[0] ?? groupableFields[0] ?? defaultDateField;
        if (!fallbackTopField) {
          continue;
        }
        normalizedWidget.field = fallbackTopField;
      }

      if ((normalizedWidget.type === 'bar' || normalizedWidget.type === 'pie') && !normalizedWidget.groupByField) {
        const fallbackGroupField = groupableFields[0] ?? defaultDateField;
        if (!fallbackGroupField) {
          continue;
        }
        normalizedWidget.groupByField = fallbackGroupField;
      }

      if (normalizedWidget.type === 'timeSeries') {
        if (!normalizedWidget.dateField && defaultDateField) {
          normalizedWidget.dateField = defaultDateField;
        }
        if (!normalizedWidget.dateField) {
          continue;
        }
      }

      widgets.push(normalizedWidget);
    }

    if (widgets.length === 0) {
      throw new BadRequestException('Nenhum widget valido foi gerado para o dashboard.');
    }

    return {
      title: parsed.title,
      widgets,
    };
  }

  private applyNaturalLanguageTimeRangeFallback(spec: DashboardSpec, naturalLanguage: string): DashboardSpec {
    const dateRange = resolveRelativeDateRange(naturalLanguage, new Date(), 'America/Sao_Paulo');
    if (!dateRange) {
      return spec;
    }

    const widgets = spec.widgets.map((widget) => {
      const entity = this.resolveEntity(widget.entityName);
      const dateField = widget.dateField ?? this.getDefaultDateField(widget.entityName);
      if (!dateField || !entity.fields[dateField] || entity.fields[dateField].type !== 'date') {
        return widget;
      }

      const hasDateFilter = (widget.filters ?? []).some((filter) => filter.field === dateField);
      if (hasDateFilter) {
        return widget;
      }

      return {
        ...widget,
        dateField,
        filters: [
          ...(widget.filters ?? []),
          {
            field: dateField,
            operator: 'between' as const,
            from: dateRange.from.toISOString(),
            to: dateRange.to.toISOString(),
          },
        ],
      };
    });

    return {
      ...spec,
      widgets,
    };
  }

  private getEntityFieldsByType(entity: EntityDictionaryEntry, types: string[]): string[] {
    return Object.entries(entity.fields)
      .filter(([, config]) => types.includes(config.type))
      .map(([field]) => field);
  }

  private getPreferredMetricField(entityName: string, numericFields: string[]): string | undefined {
    const preferredByEntity: Record<string, string[]> = {
      invoices: ['total', 'subtotal', 'tax_total'],
      products: ['default_unit_price', 'default_tax_rate'],
      companies: ['number_of_invoices'],
      documents: ['size_bytes'],
      processes: [],
    };

    const preferredList = preferredByEntity[entityName] ?? [];
    const matched = preferredList.find((field) => numericFields.includes(field));
    if (matched) return matched;

    return numericFields.find((field) => !this.isLikelyCategoricalNumericField(entityName, field));
  }

  private isLikelyCategoricalNumericField(entityName: string, field: string): boolean {
    const blockedByEntity: Record<string, Set<string>> = {
      invoices: new Set(['status', 'version', 'discount_percent']),
      processes: new Set(['status', 'completed']),
      products: new Set([]),
      companies: new Set([]),
      documents: new Set([]),
    };

    const blocked = blockedByEntity[entityName] ?? new Set<string>();
    return blocked.has(field);
  }

  private normalizeFilters(filters: GridFilterItem[], entity: EntityDictionaryEntry): GridFilterItem[] {
    const normalizedFilters: GridFilterItem[] = [];

    for (const filter of filters) {
      const fieldConfig = entity.fields[filter.field];
      if (!fieldConfig || !fieldConfig.filterable) {
        continue;
      }

      const normalized = this.normalizeFilterByFieldType(filter, fieldConfig.type);
      if (normalized) {
        normalizedFilters.push(normalized);
      }
    }

    return normalizedFilters;
  }

  private normalizeFilterByFieldType(filter: GridFilterItem, fieldType: string): GridFilterItem | null {
    const normalized: GridFilterItem = {
      field: filter.field,
      operator: filter.operator,
    };

    if (filter.operator === 'isNull' || filter.operator === 'isNotNull') {
      return normalized;
    }

    if (fieldType === 'number') {
      if (Array.isArray(filter.values)) {
        normalized.values = filter.values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
      }
      if (filter.value !== undefined) {
        const numericValue = Number(filter.value);
        if (!Number.isFinite(numericValue)) return null;
        normalized.value = numericValue;
      }
      if (filter.from !== undefined) {
        const fromValue = Number(filter.from);
        if (!Number.isFinite(fromValue)) return null;
        normalized.from = fromValue;
      }
      if (filter.to !== undefined) {
        const toValue = Number(filter.to);
        if (!Number.isFinite(toValue)) return null;
        normalized.to = toValue;
      }
      return normalized;
    }

    if (fieldType === 'boolean') {
      if (filter.value !== undefined) {
        if (typeof filter.value === 'boolean') {
          normalized.value = filter.value;
        } else if (String(filter.value).toLowerCase() === 'true') {
          normalized.value = true;
        } else if (String(filter.value).toLowerCase() === 'false') {
          normalized.value = false;
        } else {
          return null;
        }
      }
      return normalized;
    }

    if (fieldType === 'date') {
      const relativeRangeFromValue =
        typeof filter.value === 'string' ? resolveRelativeDateRange(filter.value, new Date(), 'America/Sao_Paulo') : null;
      if (relativeRangeFromValue) {
        return {
          field: filter.field,
          operator: 'between',
          from: relativeRangeFromValue.from.toISOString(),
          to: relativeRangeFromValue.to.toISOString(),
        };
      }

      const relativeRangeFromFrom =
        typeof filter.from === 'string' ? resolveRelativeDateRange(filter.from, new Date(), 'America/Sao_Paulo') : null;
      if (relativeRangeFromFrom) {
        normalized.from = relativeRangeFromFrom.from.toISOString();
        normalized.to = relativeRangeFromFrom.to.toISOString();
        normalized.operator = 'between';
        return normalized;
      }

      if (filter.value !== undefined) {
        const date = new Date(String(filter.value));
        if (Number.isNaN(date.getTime())) return null;
        normalized.value = date.toISOString();
      }
      if (filter.from !== undefined) {
        const fromDate = new Date(String(filter.from));
        if (Number.isNaN(fromDate.getTime())) return null;
        normalized.from = fromDate.toISOString();
      }
      if (filter.to !== undefined) {
        const toDate = new Date(String(filter.to));
        if (Number.isNaN(toDate.getTime())) return null;
        normalized.to = toDate.toISOString();
      }

      return normalized;
    }

    if (filter.value !== undefined) {
      normalized.value = String(filter.value);
    }

    if (Array.isArray(filter.values)) {
      normalized.values = filter.values.map((value) => String(value));
    }

    if (filter.from !== undefined) {
      normalized.from = String(filter.from);
    }

    if (filter.to !== undefined) {
      normalized.to = String(filter.to);
    }

    return normalized;
  }

  private filterToPrismaClause(entity: EntityDictionaryEntry, filter: GridFilterItem): Prisma.InputJsonObject | null {
    const fieldConfig = entity.fields[filter.field];
    if (!fieldConfig) {
      return null;
    }

    const field = filter.field;

    switch (filter.operator) {
      case 'eq':
        return { [field]: filter.value as any };
      case 'neq':
        return { [field]: { not: filter.value as any } };
      case 'contains':
        return { [field]: { contains: filter.value as any, mode: 'insensitive' } };
      case 'startsWith':
        return { [field]: { startsWith: filter.value as any, mode: 'insensitive' } };
      case 'endsWith':
        return { [field]: { endsWith: filter.value as any, mode: 'insensitive' } };
      case 'in':
        return { [field]: { in: (filter.values ?? []) as any } };
      case 'notIn':
        return { [field]: { notIn: (filter.values ?? []) as any } };
      case 'gte':
        return { [field]: { gte: filter.value as any } };
      case 'lte':
        return { [field]: { lte: filter.value as any } };
      case 'between':
        return { [field]: { gte: filter.from as any, lte: filter.to as any } };
      case 'isNull':
        return { [field]: null };
      case 'isNotNull':
        return { NOT: { [field]: null } };
      default:
        return null;
    }
  }
  private async executeDashboardSpec(spec: DashboardSpec, tenantId: string) {
    const output: Record<string, unknown> = {};

    for (const widget of spec.widgets) {
      const entity = this.resolveEntity(widget.entityName);
      const where = this.buildPrismaWhere(entity.entityName, widget.filters ?? [], tenantId);

      if (widget.type === 'kpi') {
        output[widget.id] = await this.executeKpiWidget(widget, entity.prismaDelegate, where);
        continue;
      }

      if (widget.type === 'topN') {
        output[widget.id] = await this.executeTopNWidget(widget, entity.entityName, entity.prismaDelegate, where);
        continue;
      }

      if (widget.type === 'timeSeries') {
        output[widget.id] = await this.executeTimeSeriesWidget(widget, entity.entityName, entity.prismaDelegate, where);
        continue;
      }

      if (widget.type === 'bar' || widget.type === 'pie') {
        output[widget.id] = await this.executeGroupedWidget(widget, entity.prismaDelegate, where);
      }
    }

    return output;
  }

  private async executeKpiWidget(widget: DashboardWidgetSpec, delegate: string, where: PrismaWhere) {
    const prismaDelegate = this.getDelegate(delegate);

    if (widget.metric === 'count') {
      const total = await prismaDelegate.count({ where });
      return { value: total };
    }

    if (!widget.field) {
      throw new BadRequestException(`Widget ${widget.id} exige campo para metrica ${widget.metric}.`);
    }

    const aggregateResult = await prismaDelegate.aggregate({
      where,
      ...(widget.metric === 'sum' ? { _sum: { [widget.field]: true } } : {}),
      ...(widget.metric === 'avg' ? { _avg: { [widget.field]: true } } : {}),
    });

    const value = widget.metric === 'sum' ? aggregateResult?._sum?.[widget.field] : aggregateResult?._avg?.[widget.field];

    return {
      value: value == null ? 0 : Number(value),
    };
  }

  private async executeTopNWidget(
    widget: DashboardWidgetSpec,
    entityName: string,
    delegate: string,
    where: PrismaWhere,
  ) {
    if (!widget.field) {
      throw new BadRequestException(`Widget ${widget.id} exige field para topN.`);
    }

    const select = this.buildPrismaSelect(entityName, ['id', widget.field]);
    const prismaDelegate = this.getDelegate(delegate);

    return prismaDelegate.findMany({
      where,
      select,
      orderBy: [{ [widget.field]: 'desc' }],
      take: Math.min(widget.topN ?? 10, 50),
    });
  }

  private async executeGroupedWidget(widget: DashboardWidgetSpec, delegate: string, where: PrismaWhere) {
    if (!widget.groupByField) {
      throw new BadRequestException(`Widget ${widget.id} exige groupByField.`);
    }

    const prismaDelegate = this.getDelegate(delegate);
    const by = [widget.groupByField];

    if (widget.metric === 'count') {
      const rows = await prismaDelegate.groupBy({
        by,
        where,
        _count: { _all: true },
        take: Math.min(widget.topN ?? 20, 50),
        orderBy: { _count: { _all: 'desc' } },
      });

      return rows.map((row: any) => ({
        label: row[widget.groupByField ?? ''],
        value: Number(row._count?._all ?? 0),
      }));
    }

    if (!widget.field) {
      throw new BadRequestException(`Widget ${widget.id} exige field para metrica ${widget.metric}.`);
    }
    const metricField = widget.field;

    const rows = await prismaDelegate.groupBy({
      by,
      where,
      ...(widget.metric === 'sum' ? { _sum: { [metricField]: true } } : {}),
      ...(widget.metric === 'avg' ? { _avg: { [metricField]: true } } : {}),
      take: Math.min(widget.topN ?? 20, 50),
      orderBy:
        widget.metric === 'sum'
          ? { _sum: { [metricField]: 'desc' } }
          : { _avg: { [metricField]: 'desc' } },
    });

    return rows.map((row: any) => ({
      label: row[widget.groupByField ?? ''],
      value: Number(widget.metric === 'sum' ? row._sum?.[metricField] ?? 0 : row._avg?.[metricField] ?? 0),
    }));
  }

  private async executeTimeSeriesWidget(
    widget: DashboardWidgetSpec,
    entityName: string,
    delegate: string,
    where: PrismaWhere,
  ) {
    const dateField = widget.dateField ?? this.getDefaultDateField(entityName);
    if (!dateField) {
      throw new BadRequestException(`Widget ${widget.id} nao possui campo de data valido.`);
    }

    const select: Record<string, boolean> = {
      [dateField]: true,
    };
    if (widget.metric !== 'count' && widget.field) {
      select[widget.field] = true;
    }

    const rows = await this.getDelegate(delegate).findMany({
      where,
      select,
      orderBy: [{ [dateField]: 'asc' }],
      take: 5000,
    });

    const bucket = new Map<string, { sum: number; count: number }>();

    for (const row of rows) {
      const date = row[dateField] ? new Date(row[dateField]) : null;
      if (!date || Number.isNaN(date.getTime())) {
        continue;
      }

      const key = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
      })
        .format(date)
        .split('/')
        .reverse()
        .join('-');

      const current = bucket.get(key) ?? { sum: 0, count: 0 };
      current.count += 1;
      if (widget.metric !== 'count' && widget.field) {
        current.sum += Number(row[widget.field] ?? 0);
      }
      bucket.set(key, current);
    }

    return Array.from(bucket.entries())
      .map(([period, values]) => ({
        period,
        value:
          widget.metric === 'count'
            ? values.count
            : widget.metric === 'sum'
              ? values.sum
              : values.count > 0
                ? values.sum / values.count
                : 0,
      }))
      .sort((left, right) => left.period.localeCompare(right.period));
  }

  private getDefaultDateField(entityName: string): string | null {
    if (entityName === 'companies') return 'created_at';
    if (entityName === 'processes') return 'created_on';
    if (entityName === 'invoices') return 'issued_at';
    if (entityName === 'products') return 'created_at';
    if (entityName === 'documents') return 'created_at';
    return null;
  }

  private getDefaultOrderBy(entityName: string): PrismaOrderBy {
    if (entityName === 'processes') return [{ created_on: 'desc' }];
    return [{ created_at: 'desc' }];
  }

  private buildHomeSearchSelect(entityName: string): PrismaSelect {
    if (entityName === 'companies') {
      return { id: true, company_name: true, category: true, phone: true, created_at: true };
    }
    if (entityName === 'processes') {
      return { id: true, process_number: true, status: true, invoice: true, created_on: true };
    }
    if (entityName === 'invoices') {
      return { id: true, invoice_number: true, total: true, status: true, due_at: true };
    }
    if (entityName === 'products') {
      return { id: true, product_code: true, name: true, default_unit_price: true, is_active: true };
    }
    return { id: true, name: true, item_type: true, related_name: true, created_at: true };
  }

  private mapHomeSearchCard(entityName: string, row: Record<string, any>) {
    if (entityName === 'companies') {
      return {
        entityName,
        id: row.id,
        title: row.company_name,
        subtitle: row.category ?? 'Sem categoria',
        metadata: {
          phone: row.phone,
        },
      };
    }

    if (entityName === 'processes') {
      return {
        entityName,
        id: row.id,
        title: row.process_number,
        subtitle: `Status ${row.status}`,
        metadata: {
          invoice: row.invoice,
        },
      };
    }

    if (entityName === 'invoices') {
      return {
        entityName,
        id: row.id,
        title: row.invoice_number,
        subtitle: `Status ${row.status}`,
        metadata: {
          total: row.total,
          due_at: row.due_at,
        },
      };
    }

    if (entityName === 'products') {
      return {
        entityName,
        id: row.id,
        title: row.name,
        subtitle: row.product_code,
        metadata: {
          price: row.default_unit_price,
          is_active: row.is_active,
        },
      };
    }

    return {
      entityName,
      id: row.id,
      title: row.name,
      subtitle: row.item_type,
      metadata: {
        related_name: row.related_name,
      },
    };
  }
}

