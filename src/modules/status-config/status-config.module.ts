import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { StatusConfigController } from './status-config.controller';
import { StatusConfigRepository } from './status-config.repository';
import { StatusConfigService } from './status-config.service';

@Module({
  imports: [PrismaModule],
  controllers: [StatusConfigController],
  providers: [StatusConfigRepository, StatusConfigService],
  exports: [StatusConfigService],
})
export class StatusConfigModule {}

