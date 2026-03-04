import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ContractsModule } from '../contracts/contracts.module';
import { CalendarActivitiesController } from './calendar-activities.controller';
import { CalendarActivitiesService } from './calendar-activities.service';

@Module({
  imports: [PrismaModule, ContractsModule],
  controllers: [CalendarActivitiesController],
  providers: [CalendarActivitiesService],
})
export class CalendarActivitiesModule {}

