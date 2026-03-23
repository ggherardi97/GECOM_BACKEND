import { Injectable } from '@nestjs/common';
import { MailerService as NestMailerService } from '@nestjs-modules/mailer';
import { getPortalEmailFrom } from '../../common/branding/portal-brand.util';
import { handlePrismaError } from '../utils/errors';

@Injectable()
export class MailerService {
  constructor(
    private readonly nestMailerService: NestMailerService
  ) {}

  async sendWelcomeEmail(to: string, subject: string, html: string, from?: string) {
    try {
      await this.nestMailerService.sendMail({
        ...(from ? { from } : {}),
        to,
        subject,
        html,
      });
    } catch (error) {
      handlePrismaError(error, 'Failed to send email');
    }
  }

  async sendTestEmail(to: string): Promise<void> {
    const from = process.env.EMAIL_FROM ?? process.env.MAIL_FROM;
    if (!from) {
      throw new Error('Missing EMAIL_FROM env var.');
    }

    await this.nestMailerService.sendMail({
      from,
      to,
      subject: 'GECOM - Test email (Brevo SMTP)',
      text: 'If you received this, your Brevo SMTP setup is working.',
      html: '<p>If you received this, your <b>Brevo SMTP</b> setup is working.</p>',
    });
  }

  async sendAutomationEmail(options: {
    to: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    subject: string;
    html?: string;
    text?: string;
    from?: string;
  }): Promise<void> {
    try {
      const from = options.from || process.env.EMAIL_FROM || process.env.MAIL_FROM || getPortalEmailFrom('convert');
      const html = options.html ? this.wrapAutomationEmailHtml(options.html, options.subject) : undefined;
      await this.nestMailerService.sendMail({
        from,
        to: options.to,
        ...(options.cc ? { cc: options.cc } : {}),
        ...(options.bcc ? { bcc: options.bcc } : {}),
        subject: options.subject,
        ...(html ? { html } : {}),
        ...(options.text ? { text: options.text } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send automation email';
      throw new Error(message);
    }
  }

  private wrapAutomationEmailHtml(bodyHtml: string, subject: string): string {
    const safeBody = String(bodyHtml || '').trim() || '<p></p>';
    const safeSubject = String(subject || 'Notificacao');

    return `
      <div style="margin:0;padding:32px 12px;background:#f4f7fb;font-family:Arial,sans-serif;color:#203040;">
        <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dce6ef;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(26,48,74,.08);">
          <div style="padding:24px 28px;background:linear-gradient(135deg,#17324f 0%,#24608a 100%);color:#ffffff;">
            <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.8;">Convert Plus</div>
            <div style="margin-top:8px;font-size:24px;font-weight:700;">${safeSubject}</div>
          </div>
          <div style="padding:28px;line-height:1.65;font-size:14px;color:#30485f;">
            ${safeBody}
          </div>
          <div style="padding:16px 28px;background:#f7fafc;border-top:1px solid #e4edf5;font-size:12px;color:#6c8296;">
            Esta mensagem foi enviada automaticamente pela Convert Plus.
          </div>
        </div>
      </div>
    `;
  }
}
