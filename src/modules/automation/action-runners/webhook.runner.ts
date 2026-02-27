import { Injectable } from '@nestjs/common';
import { AutomationActionRunner, ActionRunnerArgs } from './automation-action-runner.interface';
import { parseJsonLikeObject, renderTemplateValue } from './template.util';

@Injectable()
export class WebhookActionRunner implements AutomationActionRunner {
  readonly type = 'WEBHOOK' as const;

  async run({ action, context, accumulatedOutput }: ActionRunnerArgs): Promise<Record<string, unknown>> {
    const config = (action.config ?? {}) as Record<string, unknown>;
    const url = String(config.url ?? '').trim();

    if (!url) {
      throw new Error('WEBHOOK.url é obrigatório.');
    }

    const method = String(config.method ?? 'POST').trim().toUpperCase() || 'POST';

    const templateSource = {
      tenantId: context.tenantId,
      userId: context.userId,
      recordId: context.recordId,
      entityName: context.entityName,
      payload: context.payload ?? {},
      output: accumulatedOutput,
    } as Record<string, unknown>;

    const renderedHeaders = renderTemplateValue(config.headers ?? {}, templateSource);
    const headers = parseJsonLikeObject(renderedHeaders);

    const renderedBody = renderTemplateValue(config.body ?? {}, templateSource);
    const timeoutMs = Number(config.timeout_ms ?? config.timeoutMs ?? 10000);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 10000);

    let body: string | undefined;
    if (method !== 'GET' && method !== 'HEAD') {
      if (typeof renderedBody === 'string') {
        body = renderedBody;
      } else {
        headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
        body = JSON.stringify(renderedBody ?? {});
      }
    }

    try {
      const response = await fetch(url, {
        method,
        headers: headers as Record<string, string>,
        body,
        signal: controller.signal,
      });

      const responseText = await response.text().catch(() => '');
      let responseJson: unknown = null;
      try {
        responseJson = responseText ? JSON.parse(responseText) : null;
      } catch {
        responseJson = null;
      }

      return {
        status: response.status,
        ok: response.ok,
        response: responseJson ?? responseText,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha no webhook';
      throw new Error(`WEBHOOK falhou: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

