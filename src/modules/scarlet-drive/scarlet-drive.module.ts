import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ScarletDriveController } from './scarlet-drive.controller';
import { ScarletDriveRepository } from './scarlet-drive.repository';
import { ScarletDriveService } from './scarlet-drive.service';

@Module({
  imports: [PrismaModule],
  controllers: [ScarletDriveController],
  providers: [ScarletDriveRepository, ScarletDriveService],
  exports: [ScarletDriveService],
})
export class ScarletDriveModule {}
