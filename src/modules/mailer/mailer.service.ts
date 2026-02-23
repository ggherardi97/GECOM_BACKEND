import { Injectable } from '@nestjs/common';
import { MailerService as NestMailerService } from '@nestjs-modules/mailer';
import { handlePrismaError } from '../utils/errors';

@Injectable()
export class MailerService {
  constructor(
    private readonly nestMailerService: NestMailerService
  ) {}

  async sendWelcomeEmail(to: string, subject: string, html: string) {
    try {
      await this.nestMailerService.sendMail({
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
}
