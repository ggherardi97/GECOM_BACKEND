import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProductRepository } from './product.repository';
import { CreateProductDTO } from './dto/create.dto';
import { UpdateProductDTO } from './dto/update.dto';

@Injectable()
export class ProductService {
  constructor(private readonly repository: ProductRepository) {}

  async findAll(query?: { currency_id?: string; is_active?: string; q?: string }) {
    const is_active =
      query?.is_active !== undefined && String(query.is_active).trim().length > 0
        ? String(query.is_active).toLowerCase() === 'true'
        : undefined;

    return this.repository.findAll({
      currency_id: query?.currency_id,
      is_active,
      q: query?.q,
    });
  }

  async findById(id: string) {
    const product = await this.repository.findById(id);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(data: CreateProductDTO) {
    // Basic validation for tax rate
    if (data.default_tax_rate !== undefined) {
      const taxRate = new Prisma.Decimal(data.default_tax_rate);
      if (taxRate.isNegative() || taxRate.greaterThan(1)) {
        throw new BadRequestException('default_tax_rate must be between 0 and 1');
      }
    }

    const created = await this.repository.create({
      product_code: data.product_code,
      name: data.name,
      brand: data.brand ?? null,
      unit: data.unit ?? null,
      description: data.description ?? null,

      currencies: { connect: { id: data.currency_id } },

      default_unit_price: data.default_unit_price ? new Prisma.Decimal(data.default_unit_price) : new Prisma.Decimal(0),
      default_tax_rate: data.default_tax_rate ? new Prisma.Decimal(data.default_tax_rate) : new Prisma.Decimal(0),

      is_active: data.is_active ?? true,
    });

    if (!created) throw new BadRequestException('Failed to create product');
    return created;
  }

  async update(id: string, data: UpdateProductDTO) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Product not found');

    if (data.default_tax_rate !== undefined) {
      const taxRate = new Prisma.Decimal(data.default_tax_rate);
      if (taxRate.isNegative() || taxRate.greaterThan(1)) {
        throw new BadRequestException('default_tax_rate must be between 0 and 1');
      }
    }

    return this.repository.update(id, {
      product_code: data.product_code !== undefined ? data.product_code : undefined,
      name: data.name !== undefined ? data.name : undefined,
      brand: data.brand !== undefined ? data.brand ?? null : undefined,
      unit: data.unit !== undefined ? data.unit ?? null : undefined,
      description: data.description !== undefined ? data.description ?? null : undefined,

      currencies: data.currency_id !== undefined ? { connect: { id: data.currency_id } } : undefined,

      default_unit_price:
        data.default_unit_price !== undefined ? new Prisma.Decimal(data.default_unit_price) : undefined,

      default_tax_rate:
        data.default_tax_rate !== undefined ? new Prisma.Decimal(data.default_tax_rate) : undefined,

      is_active: data.is_active !== undefined ? data.is_active : undefined,

      updated_at: new Date(),
    });
  }

  async remove(id: string) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Product not found');
    return this.repository.remove(id);
  }
}
