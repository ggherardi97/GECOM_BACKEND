import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AutomationModule } from '../automation/automation.module';
import { KanbanController } from './kanban.controller';
import { KanbanRepository } from './kanban.repository';
import { KanbanService } from './kanban.service';

@Module({
  imports: [AutomationModule],
  controllers: [KanbanController],
  providers: [PrismaService, KanbanRepository, KanbanService, JwtAuthGuard, RolesGuard],
  exports: [KanbanRepository, KanbanService],
})
export class KanbanModule {}
