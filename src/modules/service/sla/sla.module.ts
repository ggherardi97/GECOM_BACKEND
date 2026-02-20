import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { SlaController } from './sla.controller';
import { SlaRepository } from './sla.repository';
import { SlaService } from './sla.service';

@Module({
  imports: [PrismaModule],
  controllers: [SlaController],
  providers: [SlaService, SlaRepository],
})
export class SlaModule {}
