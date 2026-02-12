import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SavedViewsController } from './saved-views.controller';
import { SavedViewsRepository } from './saved-views.repository';
import { SavedViewsService } from './saved-views.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  controllers: [SavedViewsController],
  providers: [PrismaService, SavedViewsRepository, SavedViewsService, JwtAuthGuard, RolesGuard],
  exports: [SavedViewsService, SavedViewsRepository],
})
export class SavedViewsModule {}
