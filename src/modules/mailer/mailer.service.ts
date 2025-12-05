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
}
