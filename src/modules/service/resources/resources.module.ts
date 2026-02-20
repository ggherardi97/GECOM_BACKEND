import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ResourcesController } from './resources.controller';
import { ResourcesRepository } from './resources.repository';
import { ResourcesService } from './resources.service';

@Module({
  imports: [PrismaModule],
  controllers: [ResourcesController],
  providers: [ResourcesService, ResourcesRepository],
})
export class ResourcesModule {}
