import { Injectable, Logger } from '@nestjs/common';
import { automations } from '@prisma/client';
import { AutomationRepository } from './automation.repository';
import { AutomationService } from './automation.service';
import { AutomationEventDispatchPayload } from './automation.types';
import { WorkflowValidator } from './workflow-validator';

@Injectable()
export class AutomationDispatcherService {
  private readonly logger = new Logger(AutomationDispatcherService.name);

  constructor(
    private readonly repository: AutomationRepository,
    private readonly automationService: AutomationService,
  ) {}

  dispatch(event: AutomationEventDispatchPayload): void {
    setImmediate(async () => {
      try {
        await this.dispatchInternal(event);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao despachar automação';
        this.logger.error(`Falha no dispatcher: ${message}`);
      }
    });
  }

  private async dispatchInternal(event: AutomationEventDispatchPayload) {
    const entityName = String(event.entityName ?? '').trim().toLowerCase();
    if (!entityName) return;

    const automations = await this.repository.findEntityActive(event.tenantId, entityName);
    if (!automations.length) return;

    for (const automation of automations) {
      if (!this.matchesEvent(automation, event)) continue;

      try {
        await this.automationService.executeFromEvent(automation, {
          ...event,
          entityName,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao executar automação de evento';
        this.logger.error(`Falha ao executar automação ${automation.id}: ${message}`);
      }
    }
  }

  private matchesEvent(automation: automations, event: AutomationEventDispatchPayload): boolean {
    try {
      const workflow = WorkflowValidator.validate(automation.workflow_json as unknown);
      if (workflow.trigger.type !== 'ENTITY_EVENT') return false;

      const config = (workflow.trigger.config ?? {}) as Record<string, unknown>;
      const configuredEntity = String(config.entityName ?? automation.entity_name ?? '')
        .trim()
        .toLowerCase();

      const configuredEvent = String(config.eventType ?? '')
        .trim()
        .toUpperCase();

      if (configuredEntity && configuredEntity !== String(event.entityName).trim().toLowerCase()) {
        return false;
      }

      if (configuredEvent && configuredEvent !== String(event.eventType).trim().toUpperCase()) {
        return false;
      }

      const fieldChanged = String(config.fieldChanged ?? '')
        .trim()
        .toLowerCase();

      if (fieldChanged) {
        const changedSet = new Set(
          [
            ...(event.changedFields ?? []),
            ...this.extractChangedFieldsFromPayload(event.payload),
          ]
            .map((item) => String(item).trim().toLowerCase())
            .filter(Boolean),
        );

        if (!changedSet.has(fieldChanged)) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  private extractChangedFieldsFromPayload(payload?: Record<string, unknown>): string[] {
    if (!payload) return [];

    const changedFields = payload.changedFields;
    if (Array.isArray(changedFields)) {
      return changedFields.map((item) => String(item));
    }

    const changedField = payload.fieldChanged;
    if (changedField) {
      return [String(changedField)];
    }

    return [];
  }
}

