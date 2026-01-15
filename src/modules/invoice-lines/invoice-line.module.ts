import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { InvoiceLineController } from './invoice-line.controller';
import { InvoiceLineRepository } from './invoice-line.repository';
import { InvoiceLineService } from './invoice-line.service';

@Module({
  imports: [PrismaModule],
  controllers: [InvoiceLineController],
  providers: [InvoiceLineService, InvoiceLineRepository],
  exports: [InvoiceLineService],
})
export class InvoiceLineModule {}