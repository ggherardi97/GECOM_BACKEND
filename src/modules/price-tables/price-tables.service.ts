import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PriceTablesRepository } from './price-tables.repository';
import { CreatePriceTableDto, CreatePriceTableItemDto } from './dto/create-price-table.dto';
import { UpdatePriceTableDto } from './dto/update-price-table.dto';

type AuthUser = {
  id: string;
  tenant_id: string;
};

@Injectable()
export class PriceTablesService {
  constructor(private readonly repository: PriceTablesRepository) {}

  async list(user: AuthUser, q?: string, fields?: string) {
    return this.repository.list(user.tenant_id, q, fields);
  }

  async findById(user: AuthUser, id: string) {
    const found = await this.repository.findById(user.tenant_id, id);
    if (!found) throw new NotFoundException('Price table not found');
    return found;
  }

  async create(user: AuthUser, dto: CreatePriceTableDto) {
    const created = await this.repository.create({
      tenant_id: user.tenant_id,
      name: dto.name,
      description: dto.description ?? null,
      is_default: dto.is_default ?? false,
      is_active: dto.is_active ?? true,
      valid_from: dto.valid_from ? new Date(dto.valid_from) : null,
      valid_to: dto.valid_to ? new Date(dto.valid_to) : null,
      ...(dto.currency_id ? { currency: { connect: { id: dto.currency_id } } } : {}),
      ...(dto.items?.length
        ? {
            items: {
              create: this.normalizeItems(dto.items, user.tenant_id),
            },
          }
        : {}),
    });

    return this.findById(user, created.id);
  }

  async update(user: AuthUser, id: string, dto: UpdatePriceTableDto) {
    const existing = await this.repository.findById(user.tenant_id, id);
    if (!existing) throw new NotFoundException('Price table not found');

    const patch: Prisma.price_tablesUncheckedUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
      ...(dto.currency_id !== undefined ? { currency_id: dto.currency_id ?? null } : {}),
      ...(dto.is_default !== undefined ? { is_default: dto.is_default } : {}),
      ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
      ...(dto.valid_from !== undefined ? { valid_from: dto.valid_from ? new Date(dto.valid_from) : null } : {}),
      ...(dto.valid_to !== undefined ? { valid_to: dto.valid_to ? new Date(dto.valid_to) : null } : {}),
      updated_at: new Date(),
    };

    const updated = await this.repository.update(id, user.tenant_id, patch);
    if (!updated) throw new NotFoundException('Price table not found');

    if (dto.items !== undefined) {
      await this.repository.replaceItems({
        tenantId: user.tenant_id,
        tableId: id,
        items: this.normalizeItems(dto.items || [], user.tenant_id, id).map((item) => ({
          tenant_id: user.tenant_id,
          price_table_id: id,
          product_id: item.product_id,
          min_quantity: item.min_quantity,
          max_quantity: item.max_quantity,
          unit_price: item.unit_price,
          discount_percent: item.discount_percent,
          notes: item.notes,
        })),
      });
    }

    return this.findById(user, id);
  }

  async remove(user: AuthUser, id: string) {
    const removed = await this.repository.remove(id, user.tenant_id);
    if (!removed) throw new NotFoundException('Price table not found');
    return removed;
  }

  private normalizeItems(items: CreatePriceTableItemDto[], tenantId: string, tableId?: string) {
    return (items || []).map((item) => ({
      tenant_id: tenantId,
      ...(tableId ? { price_table_id: tableId } : {}),
      product_id: item.product_id,
      min_quantity: new Prisma.Decimal(String(item.min_quantity ?? '1')),
      max_quantity: item.max_quantity ? new Prisma.Decimal(String(item.max_quantity)) : null,
      unit_price: new Prisma.Decimal(String(item.unit_price ?? '0')),
      discount_percent: this.normalizePercent(item.discount_percent),
      notes: item.notes ?? null,
    }));
  }

  private normalizePercent(value: number | null | undefined): number {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.trunc(n)));
  }
}
