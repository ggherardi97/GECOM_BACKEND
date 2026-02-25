import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SalesGoalsController } from './sales-goals.controller';
import { SalesCommissionsController } from './sales-commissions.controller';
import { SalesGoalsService } from './sales-goals.service';
import { SalesGoalsRepository } from './sales-goals.repository';

@Module({
  imports: [PrismaModule],
  controllers: [SalesGoalsController, SalesCommissionsController],
  providers: [SalesGoalsService, SalesGoalsRepository],
  exports: [SalesGoalsService],
})
export class SalesGoalsModule {}
