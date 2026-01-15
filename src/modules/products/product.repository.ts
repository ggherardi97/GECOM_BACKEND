import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { handlePrismaError } from '../utils/errors';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProductRepository {
  private logger = new Logger(ProductRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(params?: { currency_id?: string; is_active?: boolean; q?: string }) {
    try {
      const q = params?.q?.trim();
      const where: Prisma.productsWhereInput = {
        ...(params?.currency_id ? { currency_id: params.currency_id } : {}),
        ...(params?.is_active !== undefined ? { is_active: params.is_active } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { product_code: { contains: q, mode: 'insensitive' } },
                { brand: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      };

      return await this.prisma.products.findMany({
        where,
        orderBy: { name: 'asc' },
        include: { currencies: true },
      });
    } catch (error) {
      handlePrismaError(error, 'fetching products');
    }
  }

  async findById(id: string) {
    try {
      return await this.prisma.products.findUnique({
        where: { id },
        include: { currencies: true },
      });
    } catch (error) {
      handlePrismaError(error, 'fetching product by id');
    }
  }

  async findByCode(product_code: string) {
    try {
      return await this.prisma.products.findUnique({
        where: { product_code },
        include: { currencies: true },
      });
    } catch (error) {
      handlePrismaError(error, 'fetching product by code');
    }
  }

  async create(data: Prisma.productsCreateInput) {
    try {
      return await this.prisma.products.create({
        data,
        include: { currencies: true },
      });
    } catch (e) {
      this.logger.error(e);
      return null;
    }
  }

  async update(id: string, data: Prisma.productsUpdateInput) {
    try {
      return await this.prisma.products.update({
        where: { id },
        data,
        include: { currencies: true },
      });
    } catch (error) {
      handlePrismaError(error, 'updating product');
    }
  }

  async remove(id: string) {
    try {
      return await this.prisma.products.delete({ where: { id } });
    } catch (error) {
      handlePrismaError(error, 'deleting product');
    }
  }
}