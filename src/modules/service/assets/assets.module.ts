import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AssetsController } from './assets.controller';
import { AssetsRepository } from './assets.repository';
import { AssetsService } from './assets.service';

@Module({
  imports: [PrismaModule],
  controllers: [AssetsController],
  providers: [AssetsService, AssetsRepository],
})
export class AssetsModule {}
