import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailModule } from '../mailer/mailer.module';
import { FlyCheckerController } from './fly-checker.controller';
import { FlyCheckerRepository } from './fly-checker.repository';
import { FlyCheckerService } from './fly-checker.service';
import { FlyCheckerScheduler } from './fly-checker.scheduler';
import { OpportunityService } from './opportunity.service';
import { AmadeusProvider } from './providers/amadeus.provider';
import { SerpApiProvider } from './providers/serpapi.provider';
import { FLIGHT_PROVIDER } from './fly-checker.types';
@Module({
  imports: [PrismaModule, MailModule],
  controllers: [FlyCheckerController],
  providers: [
    FlyCheckerRepository,
    FlyCheckerService,
    FlyCheckerScheduler,
    OpportunityService,
    AmadeusProvider,
    SerpApiProvider,
    {
      provide: FLIGHT_PROVIDER,
      inject: [ConfigService, AmadeusProvider, SerpApiProvider],
      useFactory: (config: ConfigService, amadeus: AmadeusProvider, serpapi: SerpApiProvider) => {
        const provider = config.get('FLY_CHECKER_PROVIDER', 'serpapi');
        if (provider === 'amadeus') return amadeus;
        if (provider === 'serpapi') return serpapi;
        throw new Error('FLY_CHECKER_PROVIDER deve ser serpapi ou amadeus.');
      },
    },
  ],
})
export class FlyCheckerModule {}
