import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AutomationExecutionStatus, automations } from '@prisma/client';
import { AutomationRepository } from './automation.repository';
import { AutomationExecutionRepository } from './automation-execution.repository';
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

    const context: AutomationExecutionContext = {
      tenantId: user.tenant_id,
      userId: user.id,
      automationId: automation.id,
      entityName: automation.entity_name,
      recordId: dto.record_id,
      payload: dto.payload ?? {},
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
      const output: Record<string, unknown> = {};
      Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
        output[key] = this.toJsonSafe(item);
      });
      return output;
    }
    return value;
  }
}

