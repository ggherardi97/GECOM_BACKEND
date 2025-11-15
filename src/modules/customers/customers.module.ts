import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { CustomersRepository } from './customers.repository';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [],
  controllers: [CustomersController],
  providers: [CustomersService, CustomersRepository, PrismaService],
  exports: [CustomersService],
})
export class CustomersModule {}
