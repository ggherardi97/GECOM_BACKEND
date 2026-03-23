import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailModule } from '../mailer/mailer.module';
import { BillingPlansModule } from '../billing-plans/billing-plans.module';
import { WhatsappSalesModule } from '../whatsapp-sales/whatsapp-sales.module';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { AutomationRepository } from './automation.repository';
import { AutomationExecutionRepository } from './automation-execution.repository';
import { AutomationDispatcherService } from './automation-dispatcher.service';
import { UpdateFieldActionRunner } from './action-runners/update-field.runner';
import { SendEmailActionRunner } from './action-runners/send-email.runner';
import { CreateTaskActionRunner } from './action-runners/create-task.runner';
import { WebhookActionRunner } from './action-runners/webhook.runner';
import { AiActionRunner } from './action-runners/ai-action.runner';
import { AutomationAiService } from './ai.service';
import { AutomationMetadataService } from './automation-metadata.service';
import { CreateRegisterActionRunner } from './action-runners/create-register.runner';
import { WhatsappActionRunner } from './action-runners/whatsapp.runner';

@Module({
  imports: [PrismaModule, ConfigModule, MailModule, BillingPlansModule, forwardRef(() => WhatsappSalesModule)],
  controllers: [AutomationController],
  providers: [
    AutomationService,
    AutomationRepository,
    AutomationExecutionRepository,
    AutomationDispatcherService,
    UpdateFieldActionRunner,
    SendEmailActionRunner,
    CreateTaskActionRunner,
    WebhookActionRunner,
    AiActionRunner,
    CreateRegisterActionRunner,
    WhatsappActionRunner,
    AutomationAiService,
    AutomationMetadataService,
  ],
  exports: [AutomationService, AutomationDispatcherService],
})
export class AutomationModule {}
