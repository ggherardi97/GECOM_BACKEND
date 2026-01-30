import { Module } from '@nestjs/common';
import { TransportsRepository } from './transports.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { TransportsController } from './transports.controller';
import { TransportsService } from './transports.service';

@Module({
  imports: [],
  controllers: [TransportsController],
  providers: [TransportsRepository, PrismaService, TransportsService],
  exports: [TransportsService],
})
export class TransportsModule {}
