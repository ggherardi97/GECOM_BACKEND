import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SavedViewsController } from './saved-views.controller';
import { SavedViewsRepository } from './saved-views.repository';
import { SavedViewsService } from './saved-views.service';

@Module({
  controllers: [SavedViewsController],
  providers: [PrismaService, SavedViewsRepository, SavedViewsService],
  exports: [SavedViewsService, SavedViewsRepository],
})
export class SavedViewsModule {}
