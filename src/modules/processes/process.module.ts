import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { EventModule } from '../events/event.module';
import { ProcessController } from './process.controller';
import { ProcessService } from './process.service';
import { ProcessRepository } from './process.repository';

@Module({
  imports: [
    PrismaModule,
    EventModule,
  ],
  controllers: [ProcessController],
  providers: [ProcessService, ProcessRepository],
  exports: [ProcessService],
})
export class ProcessModule {}
