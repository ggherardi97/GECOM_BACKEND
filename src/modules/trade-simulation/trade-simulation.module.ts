import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { TradeSimulationController } from './trade-simulation.controller';
import { TradeSimulationService } from './trade-simulation.service';
import { TradeSimulationRepository } from './trade-simulation.repository';
import { PortalUnicoTtceProvider } from './providers/portal-unico-ttce.provider';
import { TTCE_PROVIDER } from './providers/ttce-provider.interface';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [TradeSimulationController],
  providers: [
    TradeSimulationService,
    TradeSimulationRepository,
    PortalUnicoTtceProvider,
    {
      provide: TTCE_PROVIDER,
      useExisting: PortalUnicoTtceProvider,
    },
  ],
  exports: [TradeSimulationService],
})
export class TradeSimulationModule {}


