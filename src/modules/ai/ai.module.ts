import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BillingPlansModule } from '../billing-plans/billing-plans.module';
import { AutomationMetadataService } from '../automation/automation-metadata.service';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [PrismaModule, BillingPlansModule],
  controllers: [AiController],
  providers: [AiService, AutomationMetadataService],
  exports: [AiService],
})
export class AiModule {}
