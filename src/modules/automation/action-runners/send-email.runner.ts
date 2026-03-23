import { Injectable } from '@nestjs/common';
import { MailerService } from '../../mailer/mailer.service';
import { AutomationActionRunner, ActionRunnerArgs } from './automation-action-runner.interface';
import { renderTemplateValue } from './template.util';

@Injectable()
export class SendEmailActionRunner implements AutomationActionRunner {
  readonly type = 'SEND_EMAIL' as const;

  constructor(private readonly mailerService: MailerService) {}

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

    const toRaw = renderTemplateValue(String(config.to ?? ''), templateSource);
    const ccRaw = renderTemplateValue(String(config.cc ?? ''), templateSource);
    const bccRaw = renderTemplateValue(String(config.bcc ?? ''), templateSource);
    const subject = renderTemplateValue(String(config.subject ?? ''), templateSource);
    const bodyHtml = renderTemplateValue(String(config.body_html ?? config.body ?? ''), templateSource);
    const from = renderTemplateValue(String(config.from ?? ''), templateSource);

    const to = this.parseRecipients(toRaw);
    const cc = this.parseRecipients(ccRaw);
    const bcc = this.parseRecipients(bccRaw);

    if (!to.length) {
      return {
        skipped: true,
        reason: 'SEND_EMAIL sem destinatario (to).',
      };
    }

    const subjectFinal = subject || 'Notificacao de automacao';
    const textFallback = this.stripHtml(bodyHtml);

    await this.mailerService.sendAutomationEmail({
      to: to.length === 1 ? to[0] : to,
      ...(cc.length ? { cc: cc.length === 1 ? cc[0] : cc } : {}),
      ...(bcc.length ? { bcc: bcc.length === 1 ? bcc[0] : bcc } : {}),
      subject: subjectFinal,
      html: bodyHtml || undefined,
      text: textFallback || undefined,
      ...(from ? { from } : {}),
    });

    return {
      simulated: false,
      provider: 'smtp',
      to,
      cc,
      bcc,
      subject: subjectFinal,
      sentAt: new Date().toISOString(),
    };
  }

  private parseRecipients(raw: string): string[] {
    return String(raw || '')
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private stripHtml(value: string): string {
    return String(value || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
