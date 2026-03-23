import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { LeadsModule } from '../leads/leads.module';
import { WhatsappSalesController } from './whatsapp-sales.controller';
import { WhatsappSalesService } from './whatsapp-sales.service';

@Module({
  imports: [PrismaModule, ConfigModule, forwardRef(() => LeadsModule)],
  controllers: [WhatsappSalesController],
  providers: [WhatsappSalesService],
  exports: [WhatsappSalesService],
})
export class WhatsappSalesModule {}
