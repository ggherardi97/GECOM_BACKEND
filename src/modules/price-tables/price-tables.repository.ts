import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PriceTablesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, q?: string, fields?: string) {
    const query = String(q || '').trim();
    const mode = String(fields || '').trim().toLowerCase();

    if (mode === 'summary') {
      return this.prisma.price_tables.findMany({
        where: {
          tenant_id: tenantId,
          ...(query
            ? {
                OR: [
                  { name: { contains: query, mode: 'insensitive' } },
                  { description: { contains: query, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: [{ name: 'asc' }],
        select: {
          id: true,
          name: true,
          is_active: true,
          currency_id: true,
          currency: { select: { id: true, code: true, symbol: true } },
        },
      });
    }

    if (mode === 'header') {
      return this.prisma.price_tables.findMany({
        where: {
          tenant_id: tenantId,
          ...(query
            ? {
                OR: [
                  { name: { contains: query, mode: 'insensitive' } },
                  { description: { contains: query, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: [{ name: 'asc' }],
        select: {
          id: true,
          name: true,
          description: true,
          is_default: true,
          is_active: true,
          valid_from: true,
          valid_to: true,
          currency_id: true,
          currency: { select: { id: true, code: true, symbol: true, decimals: true } },
          _count: { select: { items: true } },
        },
      });
    }

    return this.prisma.price_tables.findMany({
      where: {
        tenant_id: tenantId,
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ name: 'asc' }],
      include: {
        currency: { select: { id: true, code: true, symbol: true } },
        _count: { select: { items: true, contracts: true } },
      },
    });
  }

  async findById(tenantId: string, id: string) {
    return this.prisma.price_tables.findFirst({
      where: { tenant_id: tenantId, id },
      include: {
        currency: { select: { id: true, code: true, symbol: true } },
        items: {
          orderBy: [{ created_at: 'asc' }],
          include: {
            product: { select: { id: true, name: true, product_code: true, default_unit_price: true } },
          },
        },
      },
    });
  }

  async create(data: Prisma.price_tablesCreateInput) {
    return this.prisma.price_tables.create({
      data,
      include: {
        currency: { select: { id: true, code: true, symbol: true } },
        items: true,
      },
    });
  }

  async update(id: string, tenantId: string, data: Prisma.price_tablesUncheckedUpdateInput) {
    const result = await this.prisma.price_tables.updateMany({
      where: { id, tenant_id: tenantId },
      data,
    });

    if (!result || result.count === 0) return null;
    return this.findById(tenantId, id);
  }

  async remove(id: string, tenantId: string) {
    const existing = await this.findById(tenantId, id);
    if (!existing) return null;

    await this.prisma.price_tables.deleteMany({
      where: { id, tenant_id: tenantId },
    });

    return existing;
  }

  async replaceItems(params: {
    tenantId: string;
    tableId: string;
    items: Prisma.price_table_itemsCreateManyInput[];
  }) {
    await this.prisma.price_table_items.deleteMany({
      where: {
        tenant_id: params.tenantId,
        price_table_id: params.tableId,
      },
    });

    if (params.items.length > 0) {
      await this.prisma.price_table_items.createMany({ data: params.items });
    }

    return this.prisma.price_table_items.findMany({
      where: {
        tenant_id: params.tenantId,
        price_table_id: params.tableId,
      },
      orderBy: [{ created_at: 'asc' }],
    });
  }
}
