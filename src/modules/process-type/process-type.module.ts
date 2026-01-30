import { Module } from '@nestjs/common';
import { ProcessTypeController } from './process-type.controller';
import { ProcessTypeService } from './process-type.service';
import { ProcessTypeRepository } from './process-type.repository';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [ProcessTypeController],
  providers: [ProcessTypeService, ProcessTypeRepository, PrismaService],
  exports: [ProcessTypeService],
})
export class ProcessTypeModule {}
