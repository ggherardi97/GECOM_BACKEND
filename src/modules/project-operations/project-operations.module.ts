import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProjectOperationsController } from './project-operations.controller';
import { ProjectOperationsService } from './project-operations.service';

@Module({
  imports: [PrismaModule],
  controllers: [ProjectOperationsController],
  providers: [ProjectOperationsService],
  exports: [ProjectOperationsService],
})
export class ProjectOperationsModule {}
