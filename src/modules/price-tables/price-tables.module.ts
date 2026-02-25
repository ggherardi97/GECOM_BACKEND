import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PriceTablesController } from './price-tables.controller';
import { PriceTablesService } from './price-tables.service';
import { PriceTablesRepository } from './price-tables.repository';

@Module({
  imports: [PrismaModule],
  controllers: [PriceTablesController],
  providers: [PriceTablesService, PriceTablesRepository],
  exports: [PriceTablesService],
})
export class PriceTablesModule {}
