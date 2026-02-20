import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { IncidentsController } from './incidents.controller';
import { IncidentsRepository } from './incidents.repository';
import { IncidentsService } from './incidents.service';

@Module({
  imports: [PrismaModule],
  controllers: [IncidentsController],
  providers: [IncidentsService, IncidentsRepository],
})
export class IncidentsModule {}
