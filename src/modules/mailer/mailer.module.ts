import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerService } from './mailer.service';
import * as nodemailer from 'nodemailer';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.get<string>('MAIL_HOST'),
          port: config.get<number>('MAIL_PORT'),
          auth: config.get('MAIL_USER')
            ? {
                user: config.get<string>('MAIL_USER'),
                pass: config.get<string>('MAIL_PASS'),
              }
            : undefined,
          ignoreTLS: true,
        },
        defaults: {
          from: config.get<string>('MAIL_FROM'),
        },
        preview: config.get<boolean>('MAIL_PREVIEW') ?? false,
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    {
      provide: 'MAIL_TRANSPORTER',
      useFactory: async () => {
        return nodemailer.createTransport({
          host: process.env.MAIL_HOST,
          port: Number(process.env.MAIL_PORT || 1025),
          secure: false,
          auth: process.env.MAIL_USER
            ? {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASS,
              }
            : undefined,
        });
      },
    },
    MailerService,
  ],
  exports: ['MAIL_TRANSPORTER', MailerService],
})
export class MailModule {}
