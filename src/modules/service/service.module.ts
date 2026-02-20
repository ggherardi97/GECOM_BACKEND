import { Module } from '@nestjs/common';
import { IncidentsModule } from './incidents/incidents.module';
import { SlaModule } from './sla/sla.module';
import { QueuesModule } from './queues/queues.module';
import { AssetsModule } from './assets/assets.module';
import { SubjectsModule } from './subjects/subjects.module';
import { CalendarsModule } from './calendars/calendars.module';
import { ResourcesModule } from './resources/resources.module';
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
  ],
})
export class ServiceModule {}
