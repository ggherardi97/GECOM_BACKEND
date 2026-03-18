import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ContractsModule } from '../contracts/contracts.module';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module';
import { CalendarActivitiesController } from './calendar-activities.controller';
import { CalendarActivitiesService } from './calendar-activities.service';

@Module({
  imports: [PrismaModule, ContractsModule, GoogleCalendarModule],
  controllers: [CalendarActivitiesController],
  providers: [CalendarActivitiesService],
})
export class CalendarActivitiesModule {}
