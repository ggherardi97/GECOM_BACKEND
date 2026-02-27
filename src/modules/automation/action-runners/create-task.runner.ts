import { Injectable } from '@nestjs/common';
import { AutomationActionRunner, ActionRunnerArgs } from './automation-action-runner.interface';
import { renderTemplateValue } from './template.util';

@Injectable()
export class CreateTaskActionRunner implements AutomationActionRunner {
  readonly type = 'CREATE_TASK' as const;

  async run({ action, context, accumulatedOutput }: ActionRunnerArgs): Promise<Record<string, unknown>> {
    const config = (action.config ?? {}) as Record<string, unknown>;
    const templateSource = {
      tenantId: context.tenantId,
      userId: context.userId,
      recordId: context.recordId,
      entityName: context.entityName,
      payload: context.payload ?? {},
      output: accumulatedOutput,
    } as Record<string, unknown>;

    return {
      simulated: true,
      message: 'CREATE_TASK executado em modo stub (MVP).',
      title: renderTemplateValue(String(config.title ?? ''), templateSource),
      description: renderTemplateValue(String(config.description ?? ''), templateSource),
    };
  }
}

