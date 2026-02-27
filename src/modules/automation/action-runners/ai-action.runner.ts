import { Injectable } from '@nestjs/common';
import { AutomationAiService } from '../ai.service';
import { AutomationActionRunner, ActionRunnerArgs } from './automation-action-runner.interface';
import { renderTemplateValue } from './template.util';

@Injectable()
export class AiActionRunner implements AutomationActionRunner {
  readonly type = 'AI_ACTION' as const;

  constructor(private readonly aiService: AutomationAiService) {}

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

    const prompt = renderTemplateValue(String(config.prompt ?? ''), templateSource);
    const outputKey = String(config.outputKey ?? 'ai_result').trim() || 'ai_result';

    if (!prompt) {
      return {
        skipped: true,
        reason: 'AI_ACTION sem prompt configurado.',
      };
    }

    const result = await this.aiService.runPrompt({
      prompt,
      context: templateSource,
    });

    return {
      outputKey,
      text: result.text,
      provider: result.provider,
      model: result.model,
      simulated: result.stub,
    };
  }
}

