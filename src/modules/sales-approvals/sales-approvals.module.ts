import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SalesApprovalsController } from './sales-approvals.controller';
import { SalesApprovalsService } from './sales-approvals.service';
import { SalesApprovalsRepository } from './sales-approvals.repository';

@Module({
  imports: [PrismaModule],
  controllers: [SalesApprovalsController],
  providers: [SalesApprovalsService, SalesApprovalsRepository],
  exports: [SalesApprovalsService],
})
export class SalesApprovalsModule {}
