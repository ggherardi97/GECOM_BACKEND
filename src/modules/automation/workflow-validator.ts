import { BadRequestException } from '@nestjs/common';
import {
  AUTOMATION_ACTION_TYPES,
  AUTOMATION_TRIGGER_TYPES,
  type AutomationWorkflow,
  type AutomationWorkflowAction,
} from './automation.types';

export class WorkflowValidator {
  static validate(input: unknown): AutomationWorkflow {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException('workflow_json inválido.');
    }

    const workflow = input as Record<string, unknown>;

    if (workflow.version !== 1) {
      throw new BadRequestException('workflow_json.version deve ser 1.');
    }

    const trigger = workflow.trigger as Record<string, unknown> | undefined;
    if (!trigger || typeof trigger !== 'object') {
      throw new BadRequestException('workflow_json.trigger é obrigatório.');
    }

    const triggerType = String(trigger.type ?? '').trim().toUpperCase();
    if (!AUTOMATION_TRIGGER_TYPES.includes(triggerType as any)) {
      throw new BadRequestException('workflow_json.trigger.type inválido.');
    }

    const actionsInput = Array.isArray(workflow.actions) ? workflow.actions : [];
    const actions = actionsInput.map((action, index) => this.validateAction(action, index));

    const normalized: AutomationWorkflow = {
      version: 1,
      trigger: {
        type: triggerType as any,
        config:
          trigger.config && typeof trigger.config === 'object'
            ? (trigger.config as Record<string, unknown>)
            : {},
      },
      actions,
      ui:
        workflow.ui && typeof workflow.ui === 'object'
          ? (workflow.ui as { nodes: Array<{ id: string; x: number; y: number }> })
          : { nodes: [{ id: 'trigger', x: 120, y: 80 }] },
    };

    return normalized;
  }

  private static validateAction(action: unknown, index: number): AutomationWorkflowAction {
    if (!action || typeof action !== 'object') {
      throw new BadRequestException(`workflow_json.actions[${index}] inválido.`);
    }

    const item = action as Record<string, unknown>;
    const id = String(item.id ?? '').trim();
    const type = String(item.type ?? '').trim().toUpperCase();

    if (!id) {
      throw new BadRequestException(`workflow_json.actions[${index}].id é obrigatório.`);
    }

    if (!AUTOMATION_ACTION_TYPES.includes(type as any)) {
      throw new BadRequestException(`workflow_json.actions[${index}].type inválido.`);
    }

    return {
      id,
      type: type as any,
      config: item.config && typeof item.config === 'object' ? (item.config as Record<string, unknown>) : {},
    };
  }
}

