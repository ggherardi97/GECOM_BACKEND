import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ResourceAvailabilityService } from '../common/resource-availability.service';
import { ScheduleBoardController } from './schedule-board.controller';
import { ScheduleBoardService } from './schedule-board.service';

@Module({
  imports: [PrismaModule],
  controllers: [ScheduleBoardController],
  providers: [ScheduleBoardService, ResourceAvailabilityService],
})
export class ScheduleBoardModule {}
