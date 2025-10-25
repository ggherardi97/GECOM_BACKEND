import { Injectable } from '@nestjs/common';
import { MailerService as Service } from '@nestjs-modules/mailer';

@Injectable()
export class MailerService {
  constructor(private readonly mailerService: Service) {}

  async sendWelcomeEmail(to: string) {
    await this.mailerService.sendMail({
      to,
      subject: 'Bem-vindo a Gecom!',
      text: 'Olá, seja bem-vindo à nossa plataforma!',
    });
  }
}
