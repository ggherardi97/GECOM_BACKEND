import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AutomationExecutionStatus, automations } from '@prisma/client';
import { AutomationRepository } from './automation.repository';
import { AutomationExecutionRepository } from './automation-execution.repository';
import {
  AutomationMetadataService,
  type AutomationRecordLookupItem,
} from './automation-metadata.service';
import {
  AutomationAiService,
  type AutomationAiAmbiguousReference,
  type AutomationAiLiveContext,
  type AutomationAiResolvedReference,
} from './ai.service';
import { AutomationAiChatDto } from './dto/automation-ai-chat.dto';
import { CreateAutomationDto } from './dto/create-automation.dto';
import { UpdateAutomationDto } from './dto/update-automation.dto';
import { ExecuteAutomationDto } from './dto/execute-automation.dto';
import {
  AutomationEventDispatchPayload,
  AutomationExecutionContext,
  AutomationTriggerType,
  AutomationWorkflow,
} from './automation.types';
import { WorkflowValidator } from './workflow-validator';
import { UpdateFieldActionRunner } from './action-runners/update-field.runner';
import { SendEmailActionRunner } from './action-runners/send-email.runner';
import { CreateTaskActionRunner } from './action-runners/create-task.runner';
import { WebhookActionRunner } from './action-runners/webhook.runner';
import { AiActionRunner } from './action-runners/ai-action.runner';
import { AutomationActionRunner } from './action-runners/automation-action-runner.interface';
import { CreateRegisterActionRunner } from './action-runners/create-register.runner';
import { WhatsappActionRunner } from './action-runners/whatsapp.runner';
import { TenantModulesResolverService } from '../billing-plans/tenant-modules-resolver.service';
import { BillingAreaEntityConfigService } from '../billing-plans/billing-area-entity-config.service';

type AuthUser = {
  id: string;
  tenant_id: string;
  role?: string;
};

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);
  private readonly runnerByType = new Map<string, AutomationActionRunner>();

  constructor(
    private readonly repository: AutomationRepository,
    private readonly executionRepository: AutomationExecutionRepository,
    updateFieldRunner: UpdateFieldActionRunner,
    sendEmailRunner: SendEmailActionRunner,
    createTaskRunner: CreateTaskActionRunner,
    webhookRunner: WebhookActionRunner,
    aiActionRunner: AiActionRunner,
    createRegisterRunner: CreateRegisterActionRunner,
    whatsappRunner: WhatsappActionRunner,
    private readonly metadataService: AutomationMetadataService,
    private readonly automationAiService: AutomationAiService,
    private readonly tenantModulesResolverService: TenantModulesResolverService,
    private readonly billingAreaEntityConfigService: BillingAreaEntityConfigService,
  ) {
    [
      updateFieldRunner,
      sendEmailRunner,
      createTaskRunner,
      webhookRunner,
      aiActionRunner,
      createRegisterRunner,
      whatsappRunner,
    ].forEach((runner) => {
      this.runnerByType.set(runner.type, runner);
    });
  }

  async list(user: AuthUser) {
    const rows = await this.repository.list(user.tenant_id);
    return rows.map((row) => this.serializeAutomation(row));
  }

  async getById(user: AuthUser, id: string) {
    const automation = await this.repository.findById(user.tenant_id, id);
    if (!automation) throw new NotFoundException('Automação não encontrada.');
    return this.serializeAutomation(automation);
  }

  async create(user: AuthUser, dto: CreateAutomationDto) {
    const normalizedEntity = dto.entity_name.trim().toLowerCase();
    await this.assertEntityAllowed(user.tenant_id, normalizedEntity);

    const workflow = dto.workflow_json
      ? WorkflowValidator.validate(dto.workflow_json)
      : this.buildDefaultWorkflow(dto.entity_name, dto.trigger_type, dto.trigger_config);

    const created = await this.repository.create({
      tenant_id: user.tenant_id,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      entity_name: normalizedEntity,
      is_active: dto.is_active ?? true,
      workflow_json: workflow as unknown as object,
      created_by_user_id: user.id,
      updated_by_user_id: null,
    });

    return this.getById(user, created.id);
  }

  async createFromAiConversation(user: AuthUser, dto: AutomationAiChatDto) {
    const messages = Array.isArray(dto.messages)
      ? dto.messages
          .map((message) => ({
            role: (message?.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
            content: String(message?.content || '').trim(),
          }))
          .filter((message) => message.content)
      : [];

    if (!messages.length) {
      throw new BadRequestException('Informe o prompt da automação.');
    }

    const catalog = await this.metadataService.buildAiCatalog(user.tenant_id);
    const entities = catalog.map((entity) => ({ name: entity.name, label: entity.label }));
    const liveContext = await this.buildAiLiveContext(user.tenant_id, messages);

    if (dto.confirmed && dto.draft_automation && typeof dto.draft_automation === 'object') {
      const createDto = this.normalizeAiAutomation(dto.draft_automation as Record<string, unknown>, entities);
      const automation = await this.create(user, createDto);
      return {
        status: 'created',
        reply: 'Automação confirmada e criada com sucesso.',
        automation,
      };
    }

    const aiResult = await this.automationAiService.planAutomationConversation({
      lang: dto.lang,
      catalog,
      messages,
      liveContext,
    });

    if (aiResult.mode === 'needs_clarification') {
      return {
        status: 'needs_clarification',
        reply: aiResult.reply,
        missing: aiResult.missing ?? [],
        questions: aiResult.questions ?? [],
      };
    }

    try {
      const draft = this.normalizeAiAutomation(aiResult.automation, entities);
      return {
        status: 'needs_confirmation',
        reply: aiResult.reply,
        summary: aiResult.summary,
        draft_automation: draft,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível interpretar a automação.';
      return {
        status: 'needs_clarification',
        reply: message,
        missing: [],
        questions: [],
      };
    }
  }

  private async buildAiLiveContext(
    tenantId: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<AutomationAiLiveContext | undefined> {
    const userMessages = messages
      .filter((message) => message.role === 'user')
      .map((message) => String(message.content || '').trim())
      .filter(Boolean);
    const conversation = userMessages.join('\n');

    const resolved: AutomationAiResolvedReference[] = [];
    const ambiguous: AutomationAiAmbiguousReference[] = [];

    const boardName = this.extractBoardName(userMessages);
    const boardReference = boardName
      ? await this.resolveAiReference({
          tenantId,
          key: 'board',
          entityName: 'boards',
          query: boardName,
        })
      : null;

    this.pushAiReference(boardReference, resolved, ambiguous);

    const move = this.extractBoardMove(userMessages);
    if (move?.from) {
      const sourceReference = await this.resolveAiReference({
        tenantId,
        key: 'source_column',
        entityName: 'board_columns',
        query: move.from,
        filters: boardReference?.resolved ? { board_id: boardReference.resolved.id } : undefined,
        notes: boardReference?.resolved ? [`board_id=${boardReference.resolved.id}`] : undefined,
      });
      this.pushAiReference(sourceReference, resolved, ambiguous);
    }

    if (move?.to) {
      const targetReference = await this.resolveAiReference({
        tenantId,
        key: 'target_column',
        entityName: 'board_columns',
        query: move.to,
        filters: boardReference?.resolved ? { board_id: boardReference.resolved.id } : undefined,
        notes: boardReference?.resolved ? [`board_id=${boardReference.resolved.id}`] : undefined,
      });
      this.pushAiReference(targetReference, resolved, ambiguous);
    }

    const companyName = this.extractCompanyName(userMessages);
    const companyReference = companyName
      ? await this.resolveAiReference({
          tenantId,
          key: 'company',
          entityName: 'companies',
          query: companyName,
        })
      : null;
    this.pushAiReference(companyReference, resolved, ambiguous);

    if (!resolved.length && !ambiguous.length) return undefined;
    return { resolved, ambiguous };
  }

  private async resolveAiReference(input: {
    tenantId: string;
    key: string;
    entityName: string;
    query: string;
    filters?: Record<string, unknown>;
    notes?: string[];
  }): Promise<{ resolved?: AutomationAiResolvedReference; ambiguous?: AutomationAiAmbiguousReference } | null> {
    const query = String(input.query || '').trim();
    if (!query) return null;

    const matches = await this.metadataService.searchRecords({
      tenantId: input.tenantId,
      entityName: input.entityName,
      query,
      limit: 6,
      filters: input.filters,
    });

    if (!matches.length) return null;

    const best = this.pickResolvedMatch(query, matches);
    if (best) {
      return {
        resolved: {
          key: input.key,
          entityName: input.entityName,
          query,
          id: best.id,
          label: best.label,
          ...(best.subtitle ? { subtitle: best.subtitle } : {}),
          ...(input.notes?.length ? { notes: input.notes } : {}),
        },
      };
    }

    return {
      ambiguous: {
        key: input.key,
        entityName: input.entityName,
        query,
        matches: matches.slice(0, 5).map((item) => ({
          id: item.id,
          label: item.label,
          ...(item.subtitle ? { subtitle: item.subtitle } : {}),
        })),
      },
    };
  }

  private pushAiReference(
    reference:
      | {
          resolved?: AutomationAiResolvedReference;
          ambiguous?: AutomationAiAmbiguousReference;
        }
      | null,
    resolved: AutomationAiResolvedReference[],
    ambiguous: AutomationAiAmbiguousReference[],
  ) {
    if (!reference) return;
    if (reference.resolved) resolved.push(reference.resolved);
    if (reference.ambiguous) ambiguous.push(reference.ambiguous);
  }

  private pickResolvedMatch(query: string, matches: AutomationRecordLookupItem[]): AutomationRecordLookupItem | null {
    if (matches.length === 1) return matches[0];

    const normalizedQuery = this.normalizeSearchText(query);
    if (!normalizedQuery) return null;

    const exactMatches = matches.filter((item) => {
      const label = this.normalizeSearchText(item.label);
      const subtitle = this.normalizeSearchText(item.subtitle || '');
      return label === normalizedQuery || subtitle === normalizedQuery;
    });

    if (exactMatches.length === 1) return exactMatches[0];

    const startsWithMatches = matches.filter((item) => {
      const label = this.normalizeSearchText(item.label);
      return label.startsWith(normalizedQuery);
    });

    if (startsWithMatches.length === 1) return startsWithMatches[0];
    return null;
  }

  private extractBoardName(messages: string[]): string {
    const text = messages.join('\n');
    const patterns = [
      /\bboard\s+(?:chamado|chamada|called|named)\s+["“]?(.+?)["”]?(?=\s+(?:quando|ao|se|e|que|para|com)\b|$)/i,
      /\bquadro\s+(?:chamado|chamada|called|named)\s+["“]?(.+?)["”]?(?=\s+(?:quando|ao|se|e|que|para|com)\b|$)/i,
      /\bboard\s+["“]?(.+?)["”]?(?=\s+(?:quando|ao|se|e|que|para|com)\b|$)/i,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(text);
      const value = String(match?.[1] || '').trim();
      if (value) return value;
    }

    return '';
  }

  private extractBoardMove(messages: string[]): { from?: string; to?: string } | null {
    const text = messages.join('\n');
    const match = /\barrast(?:ar|e|o|ou)\s+de\s+(.+?)\s+para\s+(.+?)(?=\s+(?:cria|criar|gera|gerar|abre|abrir|faz|fazer)\b|$)/i.exec(
      text,
    );
    if (!match) return null;

    const from = String(match[1] || '').trim().replace(/^["“]|["”]$/g, '');
    const to = String(match[2] || '').trim().replace(/^["“]|["”]$/g, '');
    if (!from && !to) return null;
    return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
  }

  private extractCompanyName(messages: string[]): string {
    const explicitPatterns = [
      /\bnome\s+exato\s*(?:e|é)\s+(.+?)(?=\s+(?:da\s+company|da\s+empresa|na\s+company|na\s+empresa|quando|ao|para|com)\b|$)/i,
      /\bempresa\s+exata\s*(?:e|é)\s+(.+?)(?=\s+(?:da\s+company|da\s+empresa|quando|ao|para|com)\b|$)/i,
      /\bcompany\s+exata\s*(?:e|é)\s+(.+?)(?=\s+(?:da\s+company|da\s+empresa|quando|ao|para|com)\b|$)/i,
    ];
    const genericPatterns = [
      /\bcliente\s+de\s+["“]?(.+?)["”]?(?=\s+(?:com|para|e|que|quando|ao)\b|$)/i,
      /\bempresa\s+chamada\s+["“]?(.+?)["”]?(?=\s+(?:com|para|e|que|quando|ao)\b|$)/i,
      /\bempresa\s+["“]?(.+?)["”]?(?=\s+(?:com|para|e|que|quando|ao)\b|$)/i,
      /\bcompany\s+["“]?(.+?)["”]?(?=\s+(?:com|para|e|que|quando|ao)\b|$)/i,
    ];

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      for (const pattern of explicitPatterns) {
        const match = pattern.exec(message);
        const value = this.cleanEntityReference(match?.[1]);
        if (value) return value;
      }
    }

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      for (const pattern of genericPatterns) {
        const match = pattern.exec(message);
        const value = this.cleanEntityReference(match?.[1]);
        if (value) return value;
      }
    }

    return '';
  }

  private cleanEntityReference(value: unknown): string {
    return String(value || '')
      .replace(/^["“”'\s]+|["“”'\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeSearchText(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .toLowerCase();
  }

  async update(user: AuthUser, id: string, dto: UpdateAutomationDto) {
    const current = await this.repository.findById(user.tenant_id, id);
    if (!current) throw new NotFoundException('Automação não encontrada.');

    if (dto.entity_name !== undefined) {
      await this.assertEntityAllowed(user.tenant_id, dto.entity_name.trim().toLowerCase());
    }

    const workflow = dto.workflow_json
      ? WorkflowValidator.validate(dto.workflow_json)
      : WorkflowValidator.validate(current.workflow_json as unknown);

    const updated = await this.repository.update(id, user.tenant_id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
      ...(dto.entity_name !== undefined ? { entity_name: dto.entity_name.trim().toLowerCase() } : {}),
      ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
      ...(dto.workflow_json !== undefined ? { workflow_json: workflow as unknown as object } : {}),
      updated_by_user_id: user.id,
      updated_at: new Date(),
    });

    if (!updated) throw new NotFoundException('Automação não encontrada.');
    return this.serializeAutomation(updated);
  }

  private async assertEntityAllowed(tenantId: string, entityName: string): Promise<void> {
    const [enabledAreas, entityAreaMap] = await Promise.all([
      this.tenantModulesResolverService.getEnabledAreas(tenantId),
      this.billingAreaEntityConfigService.getEntityAreaMapSnapshot(),
    ]);
    const enabledAreaSet = new Set((enabledAreas || []).map((item) => String(item || '').toLowerCase()));
    if (!this.billingAreaEntityConfigService.isEntityAllowedWithMap(entityName, enabledAreaSet, entityAreaMap)) {
      throw new NotFoundException('Entidade não disponível para os módulos ativos do tenant.');
    }
  }

  async executeManual(user: AuthUser, id: string, dto: ExecuteAutomationDto) {
    const automation = await this.repository.findById(user.tenant_id, id);
    if (!automation) throw new NotFoundException('Automação não encontrada.');

    const payload =
      dto.payload && typeof dto.payload === 'object' && !Array.isArray(dto.payload)
        ? ({ ...(dto.payload as Record<string, unknown>) } as Record<string, unknown>)
        : {};

    if (dto.record_id) {
      const record = await this.metadataService.findRecordById({
        tenantId: user.tenant_id,
        entityName: automation.entity_name,
        recordId: dto.record_id,
      });

      if (record) {
        if (!Object.prototype.hasOwnProperty.call(payload, 'after')) {
          payload.after = record;
        }

        if (!Object.prototype.hasOwnProperty.call(payload, 'record')) {
          payload.record = record;
        }
      }
    }

    const context: AutomationExecutionContext = {
      tenantId: user.tenant_id,
      userId: user.id,
      automationId: automation.id,
      entityName: automation.entity_name,
      recordId: dto.record_id,
      payload,
      executionMode: 'MANUAL',
    };

    return this.runAutomation(automation, context);
  }

  async listExecutions(
    user: AuthUser,
    id: string,
    filters?: {
      status?: 'SUCCESS' | 'ERROR';
      from?: Date;
      to?: Date;
      search?: string;
      limit?: number;
    },
  ) {
    const automation = await this.repository.findById(user.tenant_id, id);
    if (!automation) throw new NotFoundException('Automação não encontrada.');
    return this.executionRepository.listByAutomation(user.tenant_id, id, filters);
  }

  async executeFromEvent(automation: automations, event: AutomationEventDispatchPayload) {
    const context: AutomationExecutionContext = {
      tenantId: event.tenantId,
      userId: event.userId,
      automationId: automation.id,
      entityName: event.entityName,
      recordId: event.recordId,
      payload: event.payload ?? {},
      eventType: event.eventType,
      executionMode: 'EVENT',
    };

    return this.runAutomation(automation, context);
  }

  private async runAutomation(automation: automations, context: AutomationExecutionContext) {
    const workflow = WorkflowValidator.validate(automation.workflow_json as unknown);

    const inputPayload = {
      context,
      trigger: workflow.trigger,
    };

    const outputPayload: Record<string, unknown> = {
      automationId: automation.id,
      actions: [] as Array<Record<string, unknown>>,
    };

    try {
      for (const action of workflow.actions) {
        const runner = this.runnerByType.get(action.type);
        if (!runner) {
          throw new Error(`Runner não implementado para ${action.type}.`);
        }

        const result = await runner.run({
          action,
          context,
          accumulatedOutput: outputPayload,
        });

        (outputPayload.actions as Array<Record<string, unknown>>).push({
          id: action.id,
          type: action.type,
          result,
        });
      }

      const execution = await this.executionRepository.create({
        tenant_id: context.tenantId,
        automation_id: automation.id,
        status: AutomationExecutionStatus.SUCCESS,
        input_payload: this.toJsonSafe(inputPayload) as unknown as object,
        output_payload: this.toJsonSafe(outputPayload) as unknown as object,
        error_message: null,
      });

      return execution;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao executar automação';
      this.logger.error(`Falha na automação ${automation.id}: ${message}`);

      const execution = await this.executionRepository.create({
        tenant_id: context.tenantId,
        automation_id: automation.id,
        status: AutomationExecutionStatus.ERROR,
        input_payload: this.toJsonSafe(inputPayload) as unknown as object,
        output_payload: this.toJsonSafe(outputPayload) as unknown as object,
        error_message: message,
      });

      return execution;
    }
  }

  private normalizeAiAutomation(
    input: Record<string, unknown>,
    entities: Array<{ name: string; label: string }>,
  ): CreateAutomationDto {
    const entityName = this.resolveEntityName(input.entity_name ?? input.entityName, entities);
    if (!entityName) {
      throw new BadRequestException('A IA não identificou a tabela da automação. Informe o nome da tabela.');
    }

    const triggerType = this.normalizeTriggerType(input.trigger_type ?? input.triggerType);
    if (!triggerType) {
      throw new BadRequestException('A IA não identificou o trigger. Informe se é manual, por evento ou agendado.');
    }

    const triggerConfig = this.normalizeTriggerConfig(
      triggerType,
      input.trigger_config ?? input.triggerConfig,
      entityName,
    );

    const workflowSource =
      input.workflow_json && typeof input.workflow_json === 'object'
        ? (input.workflow_json as Record<string, unknown>)
        : this.buildAiWorkflow({
            entityName,
            triggerType,
            triggerConfig,
            actions: input.actions,
          });

    const workflow = WorkflowValidator.validate(
      this.ensureWorkflowStructure(workflowSource, entityName, triggerType, triggerConfig),
    );

    if (!workflow.actions.length) {
      throw new BadRequestException('A automação precisa ter ao menos uma ação.');
    }

    const name =
      String(input.name || '').trim() ||
      `${this.humanizeValue(entityName)} - ${this.humanizeTriggerType(triggerType)}`;

    return {
      name,
      description: String(input.description || '').trim() || undefined,
      entity_name: entityName,
      trigger_type: triggerType,
      trigger_config: triggerConfig,
      is_active: true,
      workflow_json: workflow as unknown as Record<string, unknown>,
    };
  }

  private buildDefaultWorkflow(
    entityName: string,
    triggerType: AutomationTriggerType,
    triggerConfig?: Record<string, unknown>,
  ): AutomationWorkflow {
    const normalizedEntity = String(entityName ?? '').trim().toLowerCase();

    const config = {
      ...(triggerType === 'ENTITY_EVENT'
        ? {
            entityName: normalizedEntity,
            eventType: 'CREATE',
          }
        : {}),
      ...(triggerConfig ?? {}),
    };

    return {
      version: 1,
      trigger: {
        type: triggerType,
        config: config as any,
      },
      actions: [],
      ui: {
        nodes: [{ id: 'trigger', x: 120, y: 80 }],
      },
    };
  }

  private buildAiWorkflow(input: {
    entityName: string;
    triggerType: AutomationTriggerType;
    triggerConfig: Record<string, unknown>;
    actions: unknown;
  }): Record<string, unknown> {
    return {
      version: 1,
      trigger: {
        type: input.triggerType,
        config: input.triggerConfig,
      },
      actions: Array.isArray(input.actions) ? input.actions : [],
      ui: {
        nodes: [{ id: 'trigger', x: 120, y: 80 }],
      },
    };
  }

  private ensureWorkflowStructure(
    workflowSource: Record<string, unknown>,
    entityName: string,
    triggerType: AutomationTriggerType,
    triggerConfig: Record<string, unknown>,
  ): Record<string, unknown> {
    const workflow = {
      version: 1,
      ...(workflowSource || {}),
      trigger: {
        type: triggerType,
        config: triggerConfig,
      },
    } as Record<string, unknown>;

    const actionsInput = Array.isArray(workflow.actions) ? workflow.actions : [];
    const actions = actionsInput
      .map((action, index) => this.normalizeWorkflowAction(action, index, entityName))
      .filter((action): action is { id: string; type: string; config: Record<string, unknown> } => !!action);

    workflow.actions = actions;
    workflow.ui = {
      nodes: [
        { id: 'trigger', x: 120, y: 80 },
        ...actions.map((action, index) => ({
          id: action.id,
          x: 380 + index * 250,
          y: 80,
        })),
      ],
    };

    return workflow;
  }

  private normalizeWorkflowAction(action: unknown, index: number, entityName: string) {
    if (!action || typeof action !== 'object') return null;

    const item = action as Record<string, unknown>;
    const type = this.normalizeActionType(item.type ?? item.action_type);
    if (!type) return null;

    return {
      id: String(item.id || `action_${index + 1}`).trim() || `action_${index + 1}`,
      type,
      config: this.normalizeActionConfig(type, item.config, entityName),
    };
  }

  private normalizeTriggerConfig(
    triggerType: AutomationTriggerType,
    rawConfig: unknown,
    entityName: string,
  ): Record<string, unknown> {
    const source =
      rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)
        ? { ...(rawConfig as Record<string, unknown>) }
        : {};

    if (triggerType === 'ENTITY_EVENT') {
      const condition = this.normalizeTriggerCondition(source.condition);
      return {
        entityName,
        eventType: this.normalizeEventType(source.eventType ?? source.event_type) || 'CREATE',
        ...(source.fieldChanged || source.field_changed
          ? { fieldChanged: String(source.fieldChanged ?? source.field_changed).trim().toLowerCase() }
          : {}),
        ...(condition ? { condition } : {}),
      };
    }

    if (triggerType === 'SCHEDULE') {
      const cron = String(source.cron || '').trim();
      if (!cron) {
        throw new BadRequestException('Para trigger agendado, informe o cron da automação.');
      }

      return {
        cron,
        timezone: String(source.timezone || 'America/Sao_Paulo').trim() || 'America/Sao_Paulo',
      };
    }

    return {};
  }

  private normalizeTriggerCondition(rawCondition: unknown): Record<string, unknown> | null {
    if (!rawCondition || typeof rawCondition !== 'object' || Array.isArray(rawCondition)) {
      return null;
    }

    const input = rawCondition as Record<string, unknown>;
    const field = String(input.field ?? '').trim();
    const operator = this.normalizeConditionOperator(input.operator);
    if (!field || !operator) return null;

    const source = String(input.source ?? 'after')
      .trim()
      .toLowerCase();

    return {
      source: source === 'before' ? 'before' : 'after',
      field,
      operator,
      ...(input.value !== undefined ? { value: input.value } : {}),
    };
  }

  private normalizeActionConfig(
    type: string,
    rawConfig: unknown,
    entityName: string,
  ): Record<string, unknown> {
    const config =
      rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)
        ? { ...(rawConfig as Record<string, unknown>) }
        : {};
    const actionName = String(config.name ?? config.actionName ?? '').trim();
    const nameConfig = actionName ? { name: actionName } : {};

    if (type === 'UPDATE_FIELD') {
      return {
        ...nameConfig,
        entityName: this.resolveLooseEntityName(config.entityName ?? config.entity_name, entityName),
        recordId: String(config.recordId ?? config.record_id ?? '').trim(),
        recordLabel: String(config.recordLabel ?? config.record_label ?? '').trim(),
        field: String(config.field ?? '').trim().toLowerCase(),
        value: config.value ?? '',
      };
    }

    if (type === 'SEND_EMAIL') {
      const body = String(config.body_html ?? config.body ?? '').trim();
      return {
        ...nameConfig,
        to: String(config.to ?? '').trim(),
        cc: String(config.cc ?? '').trim(),
        bcc: String(config.bcc ?? '').trim(),
        subject: String(config.subject ?? '').trim(),
        body,
        body_html: body,
      };
    }

    if (type === 'WEBHOOK') {
      return {
        ...nameConfig,
        url: String(config.url ?? '').trim(),
        method: String(config.method ?? 'POST').trim().toUpperCase() || 'POST',
        headers:
          config.headers && typeof config.headers === 'object' && !Array.isArray(config.headers)
            ? (config.headers as Record<string, unknown>)
            : {},
        body:
          config.body && typeof config.body === 'object' && !Array.isArray(config.body)
            ? (config.body as Record<string, unknown>)
            : {},
      };
    }

    if (type === 'CREATE_TASK') {
      return {
        ...nameConfig,
        title: String(config.title ?? '').trim(),
        description: String(config.description ?? '').trim(),
      };
    }

    if (type === 'AI_ACTION') {
      return {
        ...nameConfig,
        prompt: String(config.prompt ?? '').trim(),
        outputKey: String(config.outputKey ?? config.output_key ?? 'ai_result').trim() || 'ai_result',
        ...(String(config.instructions ?? '').trim()
          ? { instructions: String(config.instructions ?? '').trim() }
          : {}),
      };
    }

    if (type === 'CREATE_REGISTER') {
      const mappings = Array.isArray(config.fieldMappings)
        ? config.fieldMappings
        : Array.isArray(config.field_mappings)
          ? config.field_mappings
          : Array.isArray(config.fields)
            ? config.fields
            : [];

      return {
        ...nameConfig,
        entityName: this.resolveLooseEntityName(config.entityName ?? config.entity_name, entityName),
        fieldMappings: mappings
          .map((row) => {
            if (!row || typeof row !== 'object') return null;
            const item = row as Record<string, unknown>;
            const field = String(item.field ?? '').trim().toLowerCase();
            if (!field) return null;
            return {
              field,
              value: item.value ?? '',
            };
          })
          .filter((row) => row !== null),
      };
    }

    if (type === 'WHATSAPP') {
      return {
        ...nameConfig,
        integrationId: String(config.integrationId ?? config.integration_id ?? '').trim(),
        to: String(config.to ?? config.phoneNumber ?? config.phone_number ?? '').trim(),
        message: String(config.message ?? config.body ?? '').trim(),
      };
    }

    return config;
  }

  private resolveEntityName(
    rawValue: unknown,
    entities: Array<{ name: string; label: string }>,
  ): string | null {
    const normalized = String(rawValue || '').trim().toLowerCase();
    if (!normalized) return null;

    const direct = entities.find((entity) => entity.name === normalized);
    if (direct) return direct.name;

    const byLabel = entities.find((entity) => String(entity.label || '').trim().toLowerCase() === normalized);
    if (byLabel) return byLabel.name;

    return null;
  }

  private resolveLooseEntityName(rawValue: unknown, fallback: string): string {
    const normalized = String(rawValue || '').trim().toLowerCase();
    return normalized || fallback;
  }

  private normalizeTriggerType(rawValue: unknown): AutomationTriggerType | null {
    const normalized = String(rawValue || '').trim().toUpperCase();
    if (!normalized) return null;
    if (normalized === 'MANUAL') return 'MANUAL';
    if (normalized === 'ENTITY_EVENT' || normalized === 'EVENT' || normalized === 'ON_EVENT') return 'ENTITY_EVENT';
    if (normalized === 'SCHEDULE' || normalized === 'CRON' || normalized === 'SCHEDULED') return 'SCHEDULE';
    return null;
  }

  private normalizeEventType(rawValue: unknown): 'CREATE' | 'UPDATE' | null {
    const normalized = String(rawValue || '').trim().toUpperCase();
    if (!normalized) return null;
    if (normalized === 'CREATE' || normalized === 'CREATED') return 'CREATE';
    if (normalized === 'UPDATE' || normalized === 'UPDATED') return 'UPDATE';
    return null;
  }

  private normalizeActionType(rawValue: unknown): string | null {
    const normalized = String(rawValue || '').trim().toUpperCase();
    if (!normalized) return null;
    if (normalized === 'UPDATE_FIELD' || normalized === 'UPDATE') return 'UPDATE_FIELD';
    if (normalized === 'SEND_EMAIL' || normalized === 'EMAIL') return 'SEND_EMAIL';
    if (normalized === 'CREATE_TASK' || normalized === 'TASK') return 'CREATE_TASK';
    if (normalized === 'WEBHOOK' || normalized === 'HTTP_REQUEST') return 'WEBHOOK';
    if (normalized === 'AI_ACTION' || normalized === 'AI') return 'AI_ACTION';
    if (normalized === 'CREATE_REGISTER' || normalized === 'CREATE_RECORD' || normalized === 'CREATE_ROW') {
      return 'CREATE_REGISTER';
    }
    if (normalized === 'WHATSAPP' || normalized === 'SEND_WHATSAPP' || normalized === 'WHATSAPP_MESSAGE') {
      return 'WHATSAPP';
    }
    return null;
  }

  private normalizeConditionOperator(rawValue: unknown): string | null {
    const normalized = String(rawValue || '').trim().toUpperCase();
    if (!normalized) return null;

    const aliases = new Map<string, string>([
      ['EQUALS', 'EQUALS'],
      ['EQ', 'EQUALS'],
      ['NOT_EQUALS', 'NOT_EQUALS'],
      ['NEQ', 'NOT_EQUALS'],
      ['CONTAINS', 'CONTAINS'],
      ['GREATER_THAN', 'GREATER_THAN'],
      ['GT', 'GREATER_THAN'],
      ['LESS_THAN', 'LESS_THAN'],
      ['LT', 'LESS_THAN'],
      ['GREATER_OR_EQUAL', 'GREATER_OR_EQUAL'],
      ['GTE', 'GREATER_OR_EQUAL'],
      ['LESS_OR_EQUAL', 'LESS_OR_EQUAL'],
      ['LTE', 'LESS_OR_EQUAL'],
      ['CHANGED_TO', 'CHANGED_TO'],
      ['CHANGED_FROM', 'CHANGED_FROM'],
      ['IS_TRUE', 'IS_TRUE'],
      ['IS_FALSE', 'IS_FALSE'],
      ['NOT_EMPTY', 'NOT_EMPTY'],
      ['IS_EMPTY', 'IS_EMPTY'],
    ]);

    return aliases.get(normalized) || null;
  }

  private humanizeValue(value: string): string {
    return String(value || '')
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private humanizeTriggerType(value: AutomationTriggerType): string {
    if (value === 'ENTITY_EVENT') return 'Evento';
    if (value === 'SCHEDULE') return 'Agendada';
    return 'Manual';
  }

  private serializeAutomation(row: any) {
    const workflow = WorkflowValidator.validate(row.workflow_json as unknown);
    const lastRun = Array.isArray(row.executions) && row.executions.length > 0 ? row.executions[0] : null;

    return {
      ...row,
      trigger_type: workflow.trigger.type,
      trigger_config: workflow.trigger.config ?? {},
      last_run: lastRun?.executed_at ?? null,
    };
  }

  private toJsonSafe(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map((item) => this.toJsonSafe(item));
    if (typeof value === 'object') {
      const candidate = value as { toJSON?: () => unknown };
      if (typeof candidate.toJSON === 'function') {
        const jsonValue = candidate.toJSON();
        if (jsonValue !== value) {
          return this.toJsonSafe(jsonValue);
        }
      }

      if (!this.isPlainObject(value)) {
        return String(value);
      }

      const output: Record<string, unknown> = {};
      Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
        output[key] = this.toJsonSafe(item);
      });
      return output;
    }
    return value;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== 'object') return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
}
