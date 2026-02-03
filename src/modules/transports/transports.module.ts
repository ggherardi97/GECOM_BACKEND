import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { TransportsRepository } from './transports.repository';
import { TransportsController } from './transports.controller';
import { TransportsService } from './transports.service';

@Module({
  imports: [PrismaModule],
  controllers: [TransportsController],
  providers: [TransportsRepository, TransportsService],
  exports: [TransportsService],
})
export class TransportsModule {}
