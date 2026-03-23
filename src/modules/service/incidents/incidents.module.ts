import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AutomationModule } from '../../automation/automation.module';
import { ProjectOperationsModule } from '../../project-operations/project-operations.module';
import { ResourceAvailabilityService } from '../common/resource-availability.service';
import { IncidentAutomationService } from './incident-automation.service';
import { IncidentsController } from './incidents.controller';
import { IncidentsRepository } from './incidents.repository';
import { IncidentsService } from './incidents.service';

@Module({
  imports: [PrismaModule, AutomationModule, ProjectOperationsModule],
  controllers: [IncidentsController],
  providers: [IncidentsService, IncidentsRepository, ResourceAvailabilityService, IncidentAutomationService],
  exports: [ResourceAvailabilityService],
})
export class IncidentsModule {}
