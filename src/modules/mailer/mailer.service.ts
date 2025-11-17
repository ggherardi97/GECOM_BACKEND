import { Inject, Injectable } from '@nestjs/common';
import { MailerService as Service } from '@nestjs-modules/mailer';
import * as nodemailer from 'nodemailer';
import { handlePrismaError } from '../utils/errors';

@Injectable()
export class MailerService {
  constructor(
    @Inject('MAIL_TRANSPORTER')
    private readonly transporter: nodemailer.Transporter
  ) {}

  async sendWelcomeEmail(to: string, subject: string, html: string) {
    try {
      await this.transporter.sendMail({
        from: process.env.MAIL_FROM,
        to,
        subject,
        html,
      });
    } catch (error) {
      handlePrismaError(error, 'Failed to send email');
    }
  }
}
