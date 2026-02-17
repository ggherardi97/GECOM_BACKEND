import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TrackingController } from './tracking.controller';
import { FlightradarProvider } from './providers/flightradar.provider';
import { MarineTrafficProvider } from './providers/marinetraffic.provider';
import { FeatureFlagsService, TrackingService } from './tracking.service';

@Module({
  imports: [PrismaModule],
  controllers: [TrackingController],
  providers: [TrackingService, FeatureFlagsService, FlightradarProvider, MarineTrafficProvider],
  exports: [TrackingService],
})
export class TrackingModule {}
