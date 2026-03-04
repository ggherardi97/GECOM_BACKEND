import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import {
  BillingBootstrapController,
  BillingMeController,
  BillingPlansAdminController,
  BillingPublicController,
  BillingTenantsAdminController,
} from './billing-plans.controller';
import { ModulesService } from './modules.service';
import { PlansService } from './plans.service';
import { TenantSubscriptionService } from './tenant-subscription.service';
import { TenantModulesResolverService } from './tenant-modules-resolver.service';
import { BillingAreaEntityConfigService } from './billing-area-entity-config.service';
import { AdminOnlyGuard } from './guards/admin-only.guard';
import { BillingBootstrapGuard } from './guards/billing-bootstrap.guard';

@Module({
  imports: [PrismaModule],
  controllers: [
    BillingPlansAdminController,
    BillingTenantsAdminController,
    BillingMeController,
    BillingPublicController,
    BillingBootstrapController,
  ],
  providers: [
    ModulesService,
    PlansService,
    TenantSubscriptionService,
    TenantModulesResolverService,
    BillingAreaEntityConfigService,
    AdminOnlyGuard,
    BillingBootstrapGuard,
  ],
  exports: [TenantModulesResolverService, BillingAreaEntityConfigService],
})
export class BillingPlansModule {}
