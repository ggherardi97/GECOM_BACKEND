import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDTO } from './dto/create-customer.dto';
import { UpdateCustomerDTO } from './dto/update-customer.dto';
import { paginate } from '../../common/pagination/paginate';

@Injectable()
export class CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateCustomerDTO) {
    try {
      return await this.prisma.customers.create({
        data: {
          full_name: data.full_name,
          email: data.email,
        },
      });
    } catch (error) {
      this.handlePrismaError(error, 'creating customer');
    }
  }

  async findAll(page = 1, limit = 10) {
    try {
      return await paginate(this.prisma.customers, {
        page,
        limit,
        where: { deleted_at: null },
        orderBy: { created_at: 'desc' },
      });
    } catch (error) {
      this.handlePrismaError(error, 'fetching customers');
    }
  }

  async findOne(id: string) {
    try {
      const customer = await this.prisma.customers.findUnique({
        where: {
          id: id,
          deleted_at: null,
        },
      });

      if (!customer) {
        throw new NotFoundException(`Customer with ID ${id} not found.`);
      }

      return customer;
    } catch (error) {
      this.handlePrismaError(error, 'fetching customer');
    }
  }

  async update(id: string, data: UpdateCustomerDTO) {
    try {
      return await this.prisma.customers.update({
        where: { id },
        data,
      });
    } catch (error) {
      this.handlePrismaError(error, 'updating customer');
    }
  }

  async remove(id: string) {
    try {
      return await this.prisma.customers.update({
        where: { id },
        data: {
          deleted_at: new Date(),
        },
      });
    } catch (error) {
      this.handlePrismaError(error, 'deleting customer');
    }
  }

  private isPrismaError(error: unknown): error is { code: string } {
    if (typeof error !== 'object' || error === null) return false;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return (
      Object.prototype.hasOwnProperty.call(error, 'code') &&
      typeof (error as { code: unknown }).code === ('string' as any)
    );
  }

  private handlePrismaError(error: unknown, action: string): never {
    console.error(`❌ Prisma error while ${action}:`, error);

    if (this.isPrismaError(error)) {
      switch (error.code) {
        case 'P2002':
          throw new ConflictException(`Record already exists (unique constraint failed).`);

        case 'P2025':
          throw new NotFoundException(`Record not found when ${action}.`);

        case 'P2000':
        case 'P2001':
          throw new BadRequestException(`Invalid data provided when ${action}.`);
      }
    }

    // Fallback error
    throw new InternalServerErrorException(`Unexpected database error occurred while ${action}.`);
  }
}
