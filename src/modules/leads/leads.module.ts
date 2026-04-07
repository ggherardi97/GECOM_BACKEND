import { Module, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { LeadsController } from './leads.controller';
import { LeadRepository } from './leads.repository';
import { LeadsService } from './leads.service';
import { StatusConfigModule } from '../status-config/status-config.module';
import { AutomationModule } from '../automation/automation.module';
import { MailModule } from '../mailer/mailer.module';

@Module({
  imports: [MailModule, StatusConfigModule, forwardRef(() => AutomationModule)],
  controllers: [LeadsController],
  providers: [PrismaService, LeadRepository, LeadsService, JwtAuthGuard, RolesGuard],
  exports: [LeadRepository, LeadsService],
})
export class LeadsModule {}
