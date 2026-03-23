import { Module } from '@nestjs/common';
import { AssetsModule } from './assets/assets.module';
import { CalendarsModule } from './calendars/calendars.module';
import { IncidentsModule } from './incidents/incidents.module';
import { QueuesModule } from './queues/queues.module';
import { ResourcesModule } from './resources/resources.module';
import { ScheduleBoardModule } from './schedule-board/schedule-board.module';
import { SlaModule } from './sla/sla.module';
import { SubjectsModule } from './subjects/subjects.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [
    IncidentsModule,
    SlaModule,
    QueuesModule,
    AssetsModule,
    SubjectsModule,
    CalendarsModule,
    ResourcesModule,
    TasksModule,
    ScheduleBoardModule,
  ],
})
export class ServiceModule {}
