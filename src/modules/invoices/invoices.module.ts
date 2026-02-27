import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { InvoiceController } from './invoices.controller';
import { InvoiceRepository } from './invoices.repository';
import { InvoiceService } from './invoices.service';
import { InvoiceJsonInterceptor } from './interceptors/invoice-json.interceptor';
import { StatusConfigModule } from '../status-config/status-config.module';
import { AutomationModule } from '../automation/automation.module';

@Module({
  imports: [PrismaModule, StatusConfigModule, AutomationModule],
  controllers: [InvoiceController],
  providers: [InvoiceService, InvoiceRepository, InvoiceJsonInterceptor],
  exports: [InvoiceService],
})
export class InvoiceModule {}
