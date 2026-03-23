import { Injectable } from '@nestjs/common';
import { WhatsappSalesService } from '../../whatsapp-sales/whatsapp-sales.service';
import { AutomationActionRunner, ActionRunnerArgs } from './automation-action-runner.interface';
import { renderTemplateValue } from './template.util';

@Injectable()
export class WhatsappActionRunner implements AutomationActionRunner {
  readonly type = 'WHATSAPP' as const;

  constructor(private readonly whatsappSalesService: WhatsappSalesService) {}

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

    const integrationId = String(config.integrationId ?? config.integration_id ?? '').trim();
    const toRaw = renderTemplateValue(String(config.to ?? config.phoneNumber ?? ''), templateSource);
    const message = renderTemplateValue(String(config.message ?? config.body ?? ''), templateSource);

    const recipients = String(toRaw || '')
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (!recipients.length) {
      return {
        skipped: true,
        reason: 'WHATSAPP sem destinatario configurado.',
      };
    }

    if (!String(message || '').trim()) {
      return {
        skipped: true,
        reason: 'WHATSAPP sem mensagem configurada.',
      };
    }

    const deliveries: Array<Record<string, unknown>> = [];
    for (const phoneNumber of recipients) {
      const delivery = await this.whatsappSalesService.sendAutomationMessage({
        tenantId: context.tenantId,
        integrationId: integrationId || undefined,
        phoneNumber,
        message,
      });
      deliveries.push(delivery);
    }

    return {
      integrationId: integrationId || (deliveries[0] && deliveries[0].integration_id) || null,
      deliveredCount: deliveries.length,
      deliveries,
    };
  }
}
