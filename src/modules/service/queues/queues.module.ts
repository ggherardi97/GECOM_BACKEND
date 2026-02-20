import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { QueuesController } from './queues.controller';
import { QueuesRepository } from './queues.repository';
import { QueuesService } from './queues.service';

@Module({
  imports: [PrismaModule],
  controllers: [QueuesController],
  providers: [QueuesService, QueuesRepository],
})
export class QueuesModule {}
