import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '../../prisma/prisma.module';
import { BillingPlansModule } from '../billing-plans/billing-plans.module';
import { AdminAccessController, MeAccessController } from './access-control.controller';
import { AccessControlService } from './access-control.service';
import { AccessPermissionGuard } from './guards/access-permission.guard';

@Module({
  imports: [PrismaModule, BillingPlansModule],
  controllers: [AdminAccessController, MeAccessController],
  providers: [
    AccessControlService,
    {
      provide: APP_GUARD,
      useClass: AccessPermissionGuard,
    },
  ],
  exports: [AccessControlService],
})
export class AccessControlModule {}
