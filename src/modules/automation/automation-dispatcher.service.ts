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

      const conditions = this.normalizeConditions(config);
      if (!conditions.every((condition) => this.matchesCondition(condition, event.payload))) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  private matchesCondition(conditionRaw: unknown, payload?: Record<string, unknown>): boolean {
    if (!conditionRaw || typeof conditionRaw !== 'object' || Array.isArray(conditionRaw)) {
      return true;
    }

    const condition = conditionRaw as Record<string, unknown>;
    const field = String(condition.field ?? '').trim();
    const operator = String(condition.operator ?? '').trim().toUpperCase();
    if (!field || !operator) return true;

    const beforeSource = this.asObject(payload?.before);
    const afterSource = this.asObject(payload?.after);
    const fallbackSource = this.asObject(payload);
    const sourceName = String(condition.source ?? 'after')
      .trim()
      .toLowerCase();
    const currentSource = sourceName === 'before' ? beforeSource : Object.keys(afterSource).length ? afterSource : fallbackSource;

    const currentValue = this.getPathValue(currentSource, field);
    const beforeValue = this.getPathValue(beforeSource, field);
    const afterValue = this.getPathValue(Object.keys(afterSource).length ? afterSource : fallbackSource, field);
    const expectedValue = condition.value;

    if (operator === 'CHANGED_TO') {
      return this.compareValues(afterValue, expectedValue) && !this.compareValues(beforeValue, afterValue);
    }

    if (operator === 'CHANGED_FROM') {
      return this.compareValues(beforeValue, expectedValue) && !this.compareValues(beforeValue, afterValue);
    }

    if (operator === 'IS_TRUE') return this.toBoolean(currentValue) === true;
    if (operator === 'IS_FALSE') return this.toBoolean(currentValue) === false;
    if (operator === 'NOT_EMPTY') return !this.isEmptyValue(currentValue);
    if (operator === 'IS_EMPTY') return this.isEmptyValue(currentValue);
    if (operator === 'EQUALS') return this.compareValues(currentValue, expectedValue);
    if (operator === 'NOT_EQUALS') return !this.compareValues(currentValue, expectedValue);
    if (operator === 'CONTAINS') {
      return this.normalizeValue(currentValue).includes(this.normalizeValue(expectedValue));
    }

    const currentNumber = this.toNumber(currentValue);
    const expectedNumber = this.toNumber(expectedValue);
    if (currentNumber === null || expectedNumber === null) return false;

    if (operator === 'GREATER_THAN') return currentNumber > expectedNumber;
    if (operator === 'LESS_THAN') return currentNumber < expectedNumber;
    if (operator === 'GREATER_OR_EQUAL') return currentNumber >= expectedNumber;
    if (operator === 'LESS_OR_EQUAL') return currentNumber <= expectedNumber;

    return true;
  }

  private normalizeConditions(config: Record<string, unknown>): unknown[] {
    const conditions = Array.isArray(config.conditions) ? config.conditions : [];
    if (conditions.length) return conditions;
    return config.condition ? [config.condition] : [];
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

  private asObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  private getPathValue(source: Record<string, unknown>, path: string): unknown {
    const segments = String(path || '')
      .split('.')
      .map((item) => item.trim())
      .filter(Boolean);

    let current: unknown = source;
    for (const segment of segments) {
      if (!current || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[segment];
    }

    return current;
  }

  private compareValues(left: unknown, right: unknown): boolean {
    if (left === right) return true;
    return this.normalizeValue(left) === this.normalizeValue(right);
  }

  private normalizeValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    return String(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  private toBoolean(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value;
    const normalized = this.normalizeValue(value);
    if (!normalized) return null;
    if (['true', '1', 'sim', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'nao', 'não', 'no'].includes(normalized)) return false;
    return null;
  }

  private isEmptyValue(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return !value.trim();
    if (Array.isArray(value)) return value.length === 0;
    return false;
  }

  private toNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}

