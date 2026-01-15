import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { handlePrismaError } from '../utils/errors';
import { Prisma } from '@prisma/client';

@Injectable()
export class CurrencyRepository {
  private logger = new Logger(CurrencyRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(params?: { is_active?: boolean; q?: string }) {
    try {
      const q = params?.q?.trim();

      const where: Prisma.currenciesWhereInput = {
        ...(params?.is_active !== undefined ? { is_active: params.is_active } : {}),
        ...(q
          ? {
              OR: [
                { code: { contains: q, mode: 'insensitive' } },
                { name: { contains: q, mode: 'insensitive' } },
                { symbol: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      };

      return await this.prisma.currencies.findMany({
        where,
        orderBy: { code: 'asc' },
      });
    } catch (error) {
      handlePrismaError(error, 'fetching currencies');
    }
  }

  async findById(id: string) {
    try {
      return await this.prisma.currencies.findUnique({ where: { id } });
    } catch (error) {
      handlePrismaError(error, 'fetching currency by id');
    }
  }

  async findByCode(code: string) {
    try {
      return await this.prisma.currencies.findUnique({ where: { code } });
    } catch (error) {
      handlePrismaError(error, 'fetching currency by code');
    }
  }

  async create(data: Prisma.currenciesCreateInput) {
    try {
      return await this.prisma.currencies.create({ data });
    } catch (e) {
      this.logger.error(e);
      return null;
    }
  }

  async update(id: string, data: Prisma.currenciesUpdateInput) {
    try {
      return await this.prisma.currencies.update({ where: { id }, data });
    } catch (error) {
      handlePrismaError(error, 'updating currency');
    }
  }

  async remove(id: string) {
    try {
      return await this.prisma.currencies.delete({ where: { id } });
    } catch (error) {
      handlePrismaError(error, 'deleting currency');
    }
  }
}