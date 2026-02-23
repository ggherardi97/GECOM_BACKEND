import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerService } from './mailer.service';
import { EmailTestController } from './email-test.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const provider = (config.get<string>('EMAIL_PROVIDER') ?? '').toLowerCase();
        const isBrevo = provider === 'brevo';

        const host = isBrevo
          ? config.get<string>('BREVO_SMTP_HOST')
          : config.get<string>('MAIL_HOST');
        const portRaw = isBrevo
          ? config.get<string>('BREVO_SMTP_PORT')
          : config.get<string>('MAIL_PORT');
        const port = Number(portRaw ?? (isBrevo ? '587' : '1025'));
        const user = isBrevo
          ? config.get<string>('BREVO_SMTP_USER')
          : config.get<string>('MAIL_USER');
        const pass = isBrevo
          ? config.get<string>('BREVO_SMTP_PASS')
          : config.get<string>('MAIL_PASS');

        if (isBrevo && (!host || Number.isNaN(port) || !user || !pass)) {
          throw new Error(
            'Missing Brevo SMTP env vars (BREVO_SMTP_HOST/PORT/USER/PASS).',
          );
        }

        return {
          transport: {
            host,
            port,
            secure: port === 465,
            auth: user && pass ? { user, pass } : undefined,
            ignoreTLS: !isBrevo,
          },
          defaults: {
            from: config.get<string>('EMAIL_FROM') ?? config.get<string>('MAIL_FROM'),
          },
          preview: config.get<boolean>('MAIL_PREVIEW') ?? false,
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [EmailTestController],
  providers: [MailerService],
  exports: [MailerService],
})
export class MailModule {}
