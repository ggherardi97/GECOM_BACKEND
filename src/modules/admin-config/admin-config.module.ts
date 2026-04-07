import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BillingPlansModule } from '../billing-plans/billing-plans.module';
import { AdminConfigController } from './admin-config.controller';
import { AdminConfigService } from './admin-config.service';
import { PublicLandingPageController } from './public-landing-page.controller';

@Module({
  imports: [PrismaModule, BillingPlansModule],
  controllers: [AdminConfigController, PublicLandingPageController],
  providers: [AdminConfigService],
  exports: [AdminConfigService],
})
export class AdminConfigModule {}
