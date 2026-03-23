
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import OpenAI from 'openai';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveRelativeDateRange } from '../../common/utils/date-range.util';
import { ENTITY_REGISTRY_BY_ENTITY } from '../admin-config/entity-registry';
import {
  AutomationMetadataService,
  type AutomationAiEntityCatalog,
  type AutomationRecordLookupItem,
} from '../automation/automation-metadata.service';
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

  async generateConversationJson(args: {
    model: string;
    systemPrompt: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  }): Promise<unknown> {
    const response = await this.client.responses.create({
      model: args.model,
      input: [
        { role: 'system', content: args.systemPrompt },
        ...args.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
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
  private readonly chatModel: string;
  private readonly createRecordSystemFields = new Set([
    'id',
    'tenant_id',
    'created_at',
    'updated_at',
    'deleted_at',
    'created_on',
    'updated_on',
    'created_by_user_id',
    'updated_by_user_id',
    'opened_by_user_id',
  ]);

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
    private readonly automationMetadataService: AutomationMetadataService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey) {
      throw new InternalServerErrorException('OPENAI_API_KEY nao configurada.');
    }

    this.aiClient = new AiClient(apiKey);
    this.filterModel = this.configService.get<string>('OPENAI_MODEL_FILTER') ?? 'gpt-5-mini';
    this.dashModel = this.configService.get<string>('OPENAI_MODEL_DASH') ?? 'gpt-5.2';
    this.chatModel = this.configService.get<string>('OPENAI_MODEL_AI_HUB') ?? this.dashModel;
  }

  async chat(input: {
    user: AuthUser;
    lang?: string;
    confirmed?: boolean;
    draft?: Record<string, unknown>;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  }) {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = Array.isArray(input.messages)
      ? input.messages
          .map((message) => ({
            role: (message?.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
            content: String(message?.content || '').trim(),
          }))
          .filter((message) => message.content)
      : [];

    if (!messages.length) {
      throw new BadRequestException('Informe um pedido para a IA.');
    }

    const catalog = await this.automationMetadataService.buildAiCatalog(input.user.tenant_id);
    const relevantCatalog = this.selectRelevantCatalog(messages, catalog);

    if (input.confirmed && input.draft && typeof input.draft === 'object') {
      const draftIntent = String((input.draft as Record<string, unknown>).intent || '').trim().toLowerCase();
      if (draftIntent === 'create_record') {
        const created = await this.createRecordFromDraft(input.user, input.draft as Record<string, unknown>, relevantCatalog);
        return {
          status: 'created',
          reply: created.reply,
          intent: 'create_record',
          artifact: created.artifact,
        };
      }
    }

    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === 'user');
    const latestPrompt = String(latestUserMessage?.content || '').trim();

    const aiJson = await this.aiClient.generateConversationJson({
      model: this.chatModel,
      systemPrompt: this.buildAiHubPlannerPrompt(input.lang, relevantCatalog),
      messages,
    });

    const plan = this.normalizeHubChatPlan(aiJson, latestPrompt);
    if (plan.mode === 'needs_clarification') {
      return {
        status: 'needs_clarification',
        reply: plan.reply,
        intent: plan.intent || null,
        missing: plan.missing || [],
        questions: plan.questions || [],
      };
    }

    if (plan.intent === 'create_record') {
      const validation = await this.validateRecordDraft(input.user, plan.record_draft || {}, relevantCatalog);
      if (!validation.ok) {
        return {
          status: 'needs_clarification',
          reply: validation.reply,
          intent: 'create_record',
          missing: validation.missing,
          questions: validation.questions,
        };
      }

      return {
        status: 'needs_confirmation',
        reply: plan.reply,
        intent: 'create_record',
        summary: plan.summary || 'Revise o registro antes de criar.',
        draft: {
          intent: 'create_record',
          record_draft: validation.draft,
        },
      };
    }

    if (plan.intent === 'dashboard') {
      const naturalLanguage = String(plan.dashboard_request?.natural_language || latestPrompt).trim();
      const entityHints = Array.isArray(plan.dashboard_request?.entity_hints)
        ? plan.dashboard_request?.entity_hints?.map((item: unknown) => String(item || '').trim().toLowerCase()).filter(Boolean)
        : [];
      const dashboard = await this.generateDashboard({
        user: input.user,
        naturalLanguage,
        entityHints,
      });

      return {
        status: 'completed',
        reply: plan.reply,
        intent: 'dashboard',
        artifact: {
          type: 'dashboard',
          title: String(plan.title || dashboard.dashboardSpec?.title || 'Dashboard'),
          summary: String(plan.summary || dashboard.insights_ptbr || '').trim(),
          dashboardSpec: dashboard.dashboardSpec,
          data: dashboard.data,
          insights_ptbr: dashboard.insights_ptbr,
        },
      };
    }

    const queryArtifact = await this.executeGenericQueryPlan(
      input.user,
      plan.intent === 'report' ? 'report' : 'information',
      plan.query || {},
      relevantCatalog,
      {
        latestPrompt,
        title: plan.title,
        summary: plan.summary,
      },
    );

    return {
      status: 'completed',
      reply: plan.reply,
      intent: plan.intent,
      artifact: queryArtifact,
    };
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

  private buildAiHubPlannerPrompt(
    lang: string | undefined,
    catalog: AutomationAiEntityCatalog[],
  ): string {
    const language = this.resolveConversationLanguage(lang);
    const catalogText = catalog.map((entity) => this.formatCatalogEntity(entity)).join('\n\n');

    return [
      `Voce e a central de IA do ERP. Responda em ${language}.`,
      'Voce ajuda o usuario com dashboards, relatorios, criacao de registros e consultas gerais do sistema.',
      'Voce entende linguagem natural de negocio. Nao peca UUID, IDs tecnicos ou nomes de campos desnecessariamente.',
      'Voce deve usar o catalogo real do ERP para mapear tabelas, campos, lookups, options e rotas.',
      'Sempre responda somente JSON puro, sem markdown.',
      'Use exatamente um dos formatos abaixo:',
      '{"mode":"needs_clarification","reply":"texto curto","intent":"information","missing":["entity_name"],"questions":["Sobre qual area voce quer consultar?"]}',
      '{"mode":"completed","reply":"texto curto","intent":"dashboard","title":"Titulo curto","summary":"resumo curto","dashboard_request":{"natural_language":"pedido reescrito","entity_hints":["invoices"]}}',
      '{"mode":"completed","reply":"texto curto","intent":"report","title":"Titulo curto","summary":"resumo curto","query":{"entity_name":"incidents","columns":["number","title","status"],"filters":[{"field":"status","operator":"eq","value":"OPEN"}],"sort":[{"field":"created_at","direction":"desc"}],"limit":20}}',
      '{"mode":"completed","reply":"texto curto","intent":"information","title":"Titulo curto","summary":"resumo curto","query":{"entity_name":"companies","columns":["company_name","phone"],"filters":[{"field":"company_name","operator":"contains","value":"Disney"}],"sort":[{"field":"company_name","direction":"asc"}],"limit":10}}',
      '{"mode":"needs_confirmation","reply":"texto curto","intent":"create_record","summary":"resumo amigavel","record_draft":{"entity_name":"incidents","values":{"title":"Chamado Walt Disney","description":"...","status":"NEW"},"lookup_searches":[{"field":"company_id","entity_name":"companies","search":"THE WALT DISNEY COMPANY (BRASIL) LTDA"}]}}',
      'Regras obrigatorias:',
      '- intent permitido: dashboard, report, create_record, information.',
      '- Para dashboard, use dashboard_request. Nao use query.',
      '- Para report e information, use query com entity_name, columns, filters, sort e limit.',
      '- Operadores permitidos em query.filters: eq, neq, contains, startsWith, endsWith, in, notIn, gte, lte, between, isNull, isNotNull.',
      '- Para create_record, use needs_confirmation e record_draft.',
      '- Em record_draft.values, use apenas campos diretos e valores literais. Para lookups por nome humano, use lookup_searches.',
      '- lookup_searches formato: { field, entity_name, search }. Nunca peca IDs ao usuario.',
      '- Se faltar um campo realmente obrigatorio para criar um registro, use needs_clarification com uma pergunta humana simples.',
      '- Se o usuario so quiser consultar dados, nao force criacao nem confirmacao.',
      '- Para dashboards analiticos, prefira entidades com metricas claras como invoices, processes, companies, products, incidents, financial_receivables e financial_payables.',
      '- Para listagens, topicos operacionais e respostas tabulares, prefira report ou information.',
      '- Use nomes e valores conforme o catalogo. Se um campo tiver options, prefira essas options.',
      '- Seja objetivo e amigavel no campo reply.',
      'Catalogo relevante do ERP:',
      catalogText || 'Sem catalogo disponivel.',
    ].join('\n');
  }

  private normalizeHubChatPlan(payload: unknown, latestPrompt: string): Record<string, any> {
    const root = payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, any>) : {};
    const mode = String(root.mode || '').trim().toLowerCase();
    const intent = String(root.intent || '').trim().toLowerCase();

    if (mode === 'needs_confirmation' && intent === 'create_record') {
      return {
        mode: 'needs_confirmation',
        intent: 'create_record',
        reply: String(root.reply || 'Preparei um registro para sua confirmacao.').trim(),
        summary: String(root.summary || 'Confira os dados antes de criar.').trim(),
        record_draft:
          root.record_draft && typeof root.record_draft === 'object' && !Array.isArray(root.record_draft)
            ? (root.record_draft as Record<string, unknown>)
            : {},
      };
    }

    if (mode === 'completed' && ['dashboard', 'report', 'information'].includes(intent)) {
      return {
        mode: 'completed',
        intent,
        reply: String(root.reply || 'Conclui sua solicitacao.').trim(),
        title: String(root.title || '').trim(),
        summary: String(root.summary || '').trim(),
        dashboard_request:
          root.dashboard_request && typeof root.dashboard_request === 'object' && !Array.isArray(root.dashboard_request)
            ? (root.dashboard_request as Record<string, unknown>)
            : {},
        query: root.query && typeof root.query === 'object' && !Array.isArray(root.query) ? root.query : {},
      };
    }

    return {
      mode: 'needs_clarification',
      intent: intent || this.inferFallbackIntent(latestPrompt),
      reply: String(root.reply || 'Preciso de mais detalhes para continuar.').trim(),
      missing: Array.isArray(root.missing)
        ? root.missing.map((item) => String(item || '').trim()).filter(Boolean)
        : [],
      questions: Array.isArray(root.questions)
        ? root.questions.map((item) => String(item || '').trim()).filter(Boolean)
        : [],
    };
  }

  private inferFallbackIntent(prompt: string): string {
    const text = this.normalizeSearchText(prompt);
    if (/\b(dashboard|grafico|gráfico|kpi|indicador)\b/.test(text)) return 'dashboard';
    if (/\b(criar|cadastre|cadastro|novo registro|abrir chamado|novo incidente)\b/.test(text)) return 'create_record';
    if (/\b(relatorio|relatório|listar|liste|mostre tabela|exportar)\b/.test(text)) return 'report';
    return 'information';
  }

  private selectRelevantCatalog(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    catalog: AutomationAiEntityCatalog[],
  ): AutomationAiEntityCatalog[] {
    if (!catalog.length) return [];

    const conversation = this.normalizeSearchText(messages.map((message) => message.content).join(' '));
    const scored = catalog
      .map((entity) => ({ entity, score: this.scoreCatalogEntity(conversation, entity) }))
      .sort((left, right) => right.score - left.score);

    const top = scored.filter((item) => item.score > 0).slice(0, 16).map((item) => item.entity);
    const selected = top.length ? top : scored.slice(0, 16).map((item) => item.entity);
    const expanded = new Map<string, AutomationAiEntityCatalog>(selected.map((entity) => [entity.name, entity]));

    selected.forEach((entity) => {
      entity.fields.forEach((field) => {
        if (!field.relationEntity) return;
        const relation = catalog.find((item) => item.name === field.relationEntity);
        if (relation && expanded.size < 20) {
          expanded.set(relation.name, relation);
        }
      });
    });

    return Array.from(expanded.values()).slice(0, 20);
  }

  private scoreCatalogEntity(searchText: string, entity: AutomationAiEntityCatalog): number {
    let score = 0;

    entity.aliases.slice(0, 12).forEach((alias) => {
      const normalized = this.normalizeSearchText(alias);
      if (normalized && searchText.includes(normalized)) {
        score += normalized.includes(' ') ? 18 : 12;
      }
    });

    entity.fields.slice(0, 25).forEach((field) => {
      field.aliases.slice(0, 10).forEach((alias) => {
        const normalized = this.normalizeSearchText(alias);
        if (normalized && searchText.includes(normalized)) {
          score += field.required ? 5 : 3;
        }
      });

      (field.options || []).slice(0, 12).forEach((option) => {
        const label = this.normalizeSearchText(option.label);
        const value = this.normalizeSearchText(option.value);
        if (label && searchText.includes(label)) score += 5;
        if (value && searchText.includes(value)) score += 4;
      });
    });

    return score;
  }

  private formatCatalogEntity(entity: AutomationAiEntityCatalog): string {
    const aliases = entity.aliases.slice(0, 10).join(', ');
    const fields = entity.fields
      .slice(0, 30)
      .map((field) => {
        const parts = [
          `${field.name} [${field.label}]`,
          field.dataType,
          field.required ? 'required' : field.writable ? 'optional' : 'readonly',
        ];

        if (field.relationEntity) {
          parts.push(`lookup:${field.relationEntity}`);
        }

        if (field.options?.length) {
          parts.push(
            `options:${field.options
              .slice(0, 8)
              .map((option) => `${option.label}${option.value && option.value !== option.label ? `=${option.value}` : ''}`)
              .join(', ')}`,
          );
        }

        return `- ${parts.join(' | ')}`;
      })
      .join('\n');

    return [
      `ENTITY ${entity.name} | ${entity.label}${entity.route ? ` | route:${entity.route}` : ''}`,
      `ALIASES: ${aliases}`,
      'FIELDS:',
      fields || '- none',
    ].join('\n');
  }

  private resolveConversationLanguage(lang?: string): string {
    const normalized = String(lang || '').trim().toLowerCase();
    if (normalized.startsWith('en')) return 'ingles';
    if (normalized.startsWith('es')) return 'espanhol';
    return 'portugues do Brasil';
  }

  private async executeGenericQueryPlan(
    user: AuthUser,
    intent: 'report' | 'information',
    query: Record<string, unknown>,
    catalog: AutomationAiEntityCatalog[],
    meta: { latestPrompt: string; title?: string; summary?: string },
  ) {
    const entityName = String(query.entity_name || query.entityName || '').trim().toLowerCase();
    if (!entityName) {
      throw new BadRequestException('A IA nao definiu a tabela da consulta.');
    }

    const entity = catalog.find((item) => item.name === entityName);
    if (!entity) {
      throw new BadRequestException(`A entidade ${entityName} nao esta disponivel neste tenant.`);
    }

    const columns = await this.automationMetadataService.listEntityColumns(entityName, user.tenant_id);
    const columnByName = new Map(columns.map((column) => [column.name, column]));
    if (!columnByName.has('tenant_id') || !columnByName.has('id')) {
      throw new BadRequestException('A tabela informada nao e compativel com consultas da IA.');
    }

    const requestedColumns = Array.isArray(query.columns)
      ? query.columns.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const validColumns = (requestedColumns.length ? requestedColumns : this.getDefaultQueryColumns(entity, columns))
      .filter((field) => columnByName.has(field))
      .slice(0, 8);

    const filters = Array.isArray(query.filters) ? query.filters : [];
    const sort = Array.isArray(query.sort) ? query.sort : [];
    const limit = this.normalizeChatLimit(query.limit);

    const whereClauses: Prisma.Sql[] = [Prisma.sql`CAST("tenant_id" AS TEXT) = ${user.tenant_id}`];
    filters.forEach((rawFilter) => {
      const clause = this.buildGenericFilterClause(rawFilter, columnByName);
      if (clause) whereClauses.push(clause);
    });

    const tableSql = Prisma.raw(`"${entityName}"`);
    const whereSql = Prisma.join(whereClauses, ' AND ');
    const selectColumns = validColumns.length ? validColumns : ['id'];
    const selectSql = Prisma.join(
      selectColumns.map((columnName) => Prisma.raw(`"${columnName}"`)),
      ', ',
    );
    const orderSql = this.buildGenericOrderClause(sort, columnByName);

    const rows = await this.prisma.raw.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT ${selectSql}
      FROM ${tableSql}
      WHERE ${whereSql}
      ${orderSql}
      LIMIT ${limit}
    `);

    const countRows = await this.prisma.raw.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM ${tableSql}
      WHERE ${whereSql}
    `);

    return {
      type: intent,
      title: String(meta.title || this.buildQueryTitle(intent, entity)).trim(),
      summary: String(meta.summary || '').trim(),
      entityName,
      entityLabel: entity.label,
      route: ENTITY_REGISTRY_BY_ENTITY.get(entityName)?.route || entity.route || null,
      total: Number(countRows?.[0]?.total || 0),
      columns: selectColumns.map((columnName) => ({
        name: columnName,
        label: entity.fields.find((field) => field.name === columnName)?.label || this.humanizeLabel(columnName),
      })),
      rows,
      prompt: meta.latestPrompt,
    };
  }

  private buildQueryTitle(intent: 'report' | 'information', entity: AutomationAiEntityCatalog): string {
    if (intent === 'report') {
      return `Relatorio de ${entity.label}`;
    }
    return `Consulta de ${entity.label}`;
  }

  private buildGenericOrderClause(sort: unknown[], columnByName: Map<string, { name: string }>): Prisma.Sql {
    const items = Array.isArray(sort)
      ? sort
          .map((item) => {
            const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
            const field = String(row.field || '').trim().toLowerCase();
            const direction = String(row.direction || 'asc').trim().toLowerCase() === 'desc' ? 'DESC' : 'ASC';
            if (!field || !columnByName.has(field)) return null;
            return Prisma.sql`${Prisma.raw(`"${field}"`)} ${Prisma.raw(direction)}`;
          })
          .filter((item): item is Prisma.Sql => !!item)
      : [];

    if (!items.length) {
      if (columnByName.has('updated_at')) return Prisma.sql`ORDER BY "updated_at" DESC`;
      if (columnByName.has('created_at')) return Prisma.sql`ORDER BY "created_at" DESC`;
      return Prisma.empty;
    }

    return Prisma.sql`ORDER BY ${Prisma.join(items, ', ')}`;
  }

  private buildGenericFilterClause(
    rawFilter: unknown,
    columnByName: Map<string, { name: string; dataType: string; udtName: string }>,
  ): Prisma.Sql | null {
    const filter = rawFilter && typeof rawFilter === 'object' ? (rawFilter as Record<string, unknown>) : {};
    const field = String(filter.field || '').trim().toLowerCase();
    const operator = String(filter.operator || '').trim();
    if (!field || !operator || !columnByName.has(field)) return null;

    const column = columnByName.get(field)!;
    const fieldSql = Prisma.raw(`"${field}"`);

    switch (operator) {
      case 'eq':
        return Prisma.sql`${fieldSql} = ${this.toColumnValueSql(column, filter.value)}`;
      case 'neq':
        return Prisma.sql`${fieldSql} <> ${this.toColumnValueSql(column, filter.value)}`;
      case 'contains':
        return Prisma.sql`CAST(${fieldSql} AS TEXT) ILIKE ${`%${String(filter.value ?? '').trim()}%`}`;
      case 'startsWith':
        return Prisma.sql`CAST(${fieldSql} AS TEXT) ILIKE ${`${String(filter.value ?? '').trim()}%`}`;
      case 'endsWith':
        return Prisma.sql`CAST(${fieldSql} AS TEXT) ILIKE ${`%${String(filter.value ?? '').trim()}`}`;
      case 'in': {
        const values = Array.isArray(filter.values) ? filter.values : [];
        if (!values.length) return null;
        return Prisma.sql`CAST(${fieldSql} AS TEXT) IN (${Prisma.join(values.map((value) => Prisma.sql`${String(value ?? '')}`), ', ')})`;
      }
      case 'notIn': {
        const values = Array.isArray(filter.values) ? filter.values : [];
        if (!values.length) return null;
        return Prisma.sql`CAST(${fieldSql} AS TEXT) NOT IN (${Prisma.join(values.map((value) => Prisma.sql`${String(value ?? '')}`), ', ')})`;
      }
      case 'gte':
        return Prisma.sql`${fieldSql} >= ${this.toColumnValueSql(column, filter.value)}`;
      case 'lte':
        return Prisma.sql`${fieldSql} <= ${this.toColumnValueSql(column, filter.value)}`;
      case 'between':
        if (filter.from === undefined || filter.to === undefined) return null;
        return Prisma.sql`${fieldSql} BETWEEN ${this.toColumnValueSql(column, filter.from)} AND ${this.toColumnValueSql(column, filter.to)}`;
      case 'isNull':
        return Prisma.sql`${fieldSql} IS NULL`;
      case 'isNotNull':
        return Prisma.sql`${fieldSql} IS NOT NULL`;
      default:
        return null;
    }
  }

  private getDefaultQueryColumns(
    entity: AutomationAiEntityCatalog,
    columns: Array<{ name: string }>,
  ): string[] {
    const preferred = ['number', 'title', 'name', 'company_name', 'status', 'created_at', 'updated_at'];
    const available = new Set(columns.map((column) => column.name));
    const ordered = preferred.filter((column) => available.has(column));
    if (ordered.length) return ordered;
    return entity.fields.slice(0, 6).map((field) => field.name);
  }

  private normalizeChatLimit(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return 20;
    return Math.max(1, Math.min(Math.trunc(num), 50));
  }

  private async validateRecordDraft(
    user: AuthUser,
    draft: Record<string, unknown>,
    catalog: AutomationAiEntityCatalog[],
  ): Promise<
    | { ok: true; draft: Record<string, unknown> }
    | { ok: false; reply: string; missing: string[]; questions: string[] }
  > {
    const entityName = String(draft.entity_name || '').trim().toLowerCase();
    if (!entityName) {
      return {
        ok: false,
        reply: 'Preciso saber em qual tabela devo criar o registro.',
        missing: ['entity_name'],
        questions: ['Qual registro voce quer criar?'],
      };
    }

    const entity = catalog.find((item) => item.name === entityName);
    if (!entity) {
      return {
        ok: false,
        reply: `A tabela ${entityName} nao esta disponivel neste ambiente.`,
        missing: ['entity_name'],
        questions: ['Qual outra tabela devo usar?'],
      };
    }

    const rawValues =
      draft.values && typeof draft.values === 'object' && !Array.isArray(draft.values)
        ? { ...(draft.values as Record<string, unknown>) }
        : {};
    const lookupSearches = Array.isArray(draft.lookup_searches) ? draft.lookup_searches : [];
    const fields = await this.automationMetadataService.listFields(entityName, user.tenant_id, { writableOnly: true });
    const fieldByName = new Map(fields.map((field) => [field.name, field]));

    for (const rawLookup of lookupSearches) {
      const lookup = rawLookup && typeof rawLookup === 'object' ? (rawLookup as Record<string, unknown>) : {};
      const field = String(lookup.field || '').trim().toLowerCase();
      const relationEntity = String(lookup.entity_name || '').trim().toLowerCase();
      const search = String(lookup.search || '').trim();
      if (!field || !relationEntity || !search || !fieldByName.has(field)) continue;

      const matches = await this.automationMetadataService.searchRecords({
        tenantId: user.tenant_id,
        entityName: relationEntity,
        query: search,
        limit: 6,
      });

      if (!matches.length) {
        return {
          ok: false,
          reply: `Nao encontrei um registro de ${this.humanizeLabel(relationEntity)} para "${search}".`,
          missing: [field],
          questions: [`Qual ${fieldByName.get(field)?.label || field} devo relacionar?`],
        };
      }

      const resolved = this.pickResolvedMatch(search, matches);
      if (!resolved) {
        return {
          ok: false,
          reply: `Encontrei mais de uma opcao para "${search}".`,
          missing: [field],
          questions: [
            `Qual voce quer usar em ${fieldByName.get(field)?.label || field}? Opcoes: ${matches
              .slice(0, 5)
              .map((item) => item.label)
              .join(', ')}`,
          ],
        };
      }

      rawValues[field] = resolved.id;
    }

    const missingRequired = fields
      .filter((field) => field.required && !this.createRecordSystemFields.has(field.name))
      .filter((field) => rawValues[field.name] === undefined || rawValues[field.name] === null || rawValues[field.name] === '')
      .map((field) => field.label || field.name);

    if (missingRequired.length) {
      return {
        ok: false,
        reply: 'Ainda faltam alguns dados obrigatorios para criar o registro.',
        missing: missingRequired,
        questions: [`Pode me informar: ${missingRequired.join(', ')}?`],
      };
    }

    const sanitizedValues: Record<string, unknown> = {};
    Object.entries(rawValues).forEach(([key, value]) => {
      const normalized = String(key || '').trim().toLowerCase();
      if (!fieldByName.has(normalized)) return;
      sanitizedValues[normalized] = value;
    });

    return {
      ok: true,
      draft: {
        entity_name: entityName,
        values: sanitizedValues,
      },
    };
  }

  private pickResolvedMatch(query: string, matches: AutomationRecordLookupItem[]): AutomationRecordLookupItem | null {
    if (matches.length === 1) return matches[0];

    const normalizedQuery = this.normalizeSearchText(query);
    const exact = matches.filter((item) => {
      const label = this.normalizeSearchText(item.label);
      const subtitle = this.normalizeSearchText(item.subtitle || '');
      return label === normalizedQuery || subtitle === normalizedQuery;
    });
    if (exact.length === 1) return exact[0];

    const startsWith = matches.filter((item) => this.normalizeSearchText(item.label).startsWith(normalizedQuery));
    if (startsWith.length === 1) return startsWith[0];

    return null;
  }

  private async createRecordFromDraft(
    user: AuthUser,
    draft: Record<string, unknown>,
    catalog: AutomationAiEntityCatalog[],
  ): Promise<{ reply: string; artifact: Record<string, unknown> }> {
    const normalized = await this.validateRecordDraft(
      user,
      draft.record_draft && typeof draft.record_draft === 'object'
        ? (draft.record_draft as Record<string, unknown>)
        : draft,
      catalog,
    );

    if (!normalized.ok) {
      throw new BadRequestException(normalized.reply);
    }

    const recordDraft = normalized.draft;
    const entityName = String(recordDraft.entity_name || '').trim().toLowerCase();
    const values =
      recordDraft.values && typeof recordDraft.values === 'object' && !Array.isArray(recordDraft.values)
        ? { ...(recordDraft.values as Record<string, unknown>) }
        : {};

    const columns = await this.automationMetadataService.listEntityColumns(entityName, user.tenant_id);
    const columnByName = new Map(columns.map((column) => [column.name, column]));
    if (!columns.length || !columnByName.has('tenant_id')) {
      throw new BadRequestException('Nao foi possivel preparar a criacao deste registro.');
    }

    if (columnByName.has('tenant_id') && values.tenant_id === undefined) values.tenant_id = user.tenant_id;
    if (columnByName.has('created_at') && values.created_at === undefined) values.created_at = new Date();
    if (columnByName.has('updated_at') && values.updated_at === undefined) values.updated_at = new Date();
    if (columnByName.has('created_by_user_id') && values.created_by_user_id === undefined) values.created_by_user_id = user.id;
    if (columnByName.has('updated_by_user_id') && values.updated_by_user_id === undefined) values.updated_by_user_id = user.id;

    const idColumn = columnByName.get('id');
    if (
      idColumn &&
      !idColumn.isNullable &&
      !idColumn.isIdentity &&
      !idColumn.columnDefault &&
      values.id === undefined
    ) {
      values.id = randomUUID();
    }

    const finalEntries = Object.entries(values).filter(([field]) => columnByName.has(field));
    if (!finalEntries.length) {
      throw new BadRequestException('Nenhum campo valido foi informado para criar o registro.');
    }

    const tableSql = Prisma.raw(`"${entityName}"`);
    const insertColumns = Prisma.join(finalEntries.map(([field]) => Prisma.raw(`"${field}"`)), ', ');
    const insertValues = Prisma.join(
      finalEntries.map(([field, value]) => this.toColumnValueSql(columnByName.get(field)!, value)),
      ', ',
    );

    const inserted = await this.prisma.raw.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO ${tableSql} (${insertColumns})
      VALUES (${insertValues})
      RETURNING CAST("id" AS TEXT) AS id
    `);

    const recordId = String(inserted?.[0]?.id || values.id || '').trim();
    const entity = catalog.find((item) => item.name === entityName);
    const fetched = recordId
      ? await this.automationMetadataService.findRecordById({
          tenantId: user.tenant_id,
          entityName,
          recordId,
        })
      : null;

    return {
      reply: `${entity?.label || this.humanizeLabel(entityName)} criado com sucesso.`,
      artifact: {
        type: 'create_record',
        entityName,
        entityLabel: entity?.label || this.humanizeLabel(entityName),
        route: ENTITY_REGISTRY_BY_ENTITY.get(entityName)?.route || entity?.route || null,
        recordId: recordId || null,
        record: fetched || null,
      },
    };
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
      dataType === 'smallint' ||
      dataType === 'bigint' ||
      udtName === 'int2' ||
      udtName === 'int4' ||
      udtName === 'int8'
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
      return Prisma.sql`CAST(${['1', 'true', 'yes', 'sim'].includes(normalized)} AS BOOLEAN)`;
    }

    if (dataType === 'json' || dataType === 'jsonb' || udtName === 'json' || udtName === 'jsonb') {
      return Prisma.sql`CAST(${JSON.stringify(value)} AS JSONB)`;
    }

    if (dataType === 'user-defined' && column.udtNameRaw) {
      return Prisma.sql`CAST(${String(value ?? '').trim()} AS ${Prisma.raw(`"${column.udtNameRaw}"`)})`;
    }

    return Prisma.sql`${value as any}`;
  }

  private humanizeLabel(value: string): string {
    return String(value || '')
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private normalizeSearchText(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .toLowerCase();
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

