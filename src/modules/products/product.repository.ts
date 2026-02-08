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

      // tenant_id is injected by Prisma middleware for findMany (per your architecture)
      return await this.prisma.products.findMany({
        where,
        orderBy: { name: 'asc' },
        include: { currencies: true },
      });
    } catch (error) {
      handlePrismaError(error, 'fetching products');
    }
  }

  async findById(id: string, tenantId: string) {
    try {
      // IMPORTANT: do not use findUnique here; we must enforce tenant_id
      return await this.prisma.products.findFirst({
        where: { id, tenant_id: tenantId } as any,
        include: { currencies: true },
      });
    } catch (error) {
      handlePrismaError(error, 'fetching product by id');
    }
  }

  async findByCode(product_code: string, tenantId: string) {
    try {
      // IMPORTANT: product_code may be unique globally in older schema,
      // but in multi-tenant we must enforce tenant_id
      return await this.prisma.products.findFirst({
        where: { product_code, tenant_id: tenantId } as any,
        include: { currencies: true },
      });
    } catch (error) {
      handlePrismaError(error, 'fetching product by code');
    }
  }

  async create(data: Prisma.productsCreateInput) {
    try {
      // tenant_id is injected by Prisma middleware in create (per your architecture)
      return await this.prisma.products.create({
        data,
        include: { currencies: true },
      });
    } catch (e) {
      this.logger.error(e);
      return null;
    }
  }

async update(id: string, tenantId: string, data: Prisma.productsUncheckedUpdateInput) {
  try {
    const result = await this.prisma.products.updateMany({
      where: { id, tenant_id: tenantId } as any,
      data,
    });

    if (!result || result.count === 0) return null;

    return await this.findById(id, tenantId);
  } catch (error) {
    // mantém teu handle
    throw error;
  }
}

  async remove(id: string, tenantId: string) {
    try {
      // Return the deleted entity (same behavior as delete), but tenant-safe
      const existing = await this.findById(id, tenantId);
      if (!existing) return null;

      await this.prisma.products.deleteMany({
        where: { id, tenant_id: tenantId } as any,
      });

      return existing;
    } catch (error) {
      handlePrismaError(error, 'deleting product');
    }
  }
}
