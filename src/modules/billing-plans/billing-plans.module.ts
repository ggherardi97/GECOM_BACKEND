import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import {
  BillingMeController,
  BillingPlansAdminController,
  BillingPublicController,
  BillingTenantsAdminController,
} from './billing-plans.controller';
import { ModulesService } from './modules.service';
import { PlansService } from './plans.service';
import { TenantSubscriptionService } from './tenant-subscription.service';
import { TenantModulesResolverService } from './tenant-modules-resolver.service';
import { AdminOnlyGuard } from './guards/admin-only.guard';

@Module({
  imports: [PrismaModule],
  controllers: [
    BillingPlansAdminController,
    BillingTenantsAdminController,
    BillingMeController,
    BillingPublicController,
  ],
  providers: [
    ModulesService,
    PlansService,
    TenantSubscriptionService,
    TenantModulesResolverService,
    AdminOnlyGuard,
  ],
  exports: [TenantModulesResolverService],
})
export class BillingPlansModule {}
