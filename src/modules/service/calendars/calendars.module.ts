import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CalendarsController } from './calendars.controller';
import { CalendarsRepository } from './calendars.repository';
import { CalendarsService } from './calendars.service';

@Module({
  imports: [PrismaModule],
  controllers: [CalendarsController],
  providers: [CalendarsService, CalendarsRepository],
})
export class CalendarsModule {}
