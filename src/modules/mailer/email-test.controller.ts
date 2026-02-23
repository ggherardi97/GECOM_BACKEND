import { Controller, Get, Query } from '@nestjs/common';
import { MailerService } from './mailer.service';

@Controller('email-test')
export class EmailTestController {
  constructor(private readonly mailerService: MailerService) {}

  @Get('send')
  async send(@Query('to') to?: string) {
    const target = to || process.env.EMAIL_TO_TEST;
    if (!target) {
      return {
        ok: false,
        message: 'Provide ?to= or set EMAIL_TO_TEST in .env',
      };
    }

    await this.mailerService.sendTestEmail(target);
    return { ok: true, sentTo: target };
  }
}
