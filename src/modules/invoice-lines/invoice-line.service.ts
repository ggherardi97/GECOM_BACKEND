import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InvoiceLineRepository } from './invoice-line.repository';
import { CreateInvoiceLineDTO } from './dto/create.dto';
import { UpdateInvoiceLineDTO } from './dto/update.dto';

@Injectable()
export class InvoiceLineService {
  constructor(private readonly repository: InvoiceLineRepository) {}

  async findAll(query?: { invoice_id?: string; product_id?: string }) {
    return this.repository.findAll({
      invoice_id: query?.invoice_id,
      product_id: query?.product_id,
    });
  }

  async findById(id: string) {
    const line = await this.repository.findById(id);
    if (!line) throw new NotFoundException('Invoice line not found');
    return line;
  }

  async create(data: CreateInvoiceLineDTO) {
    const unitPrice = new Prisma.Decimal(data.unit_price);
    const quantity = new Prisma.Decimal(data.quantity);

    if (unitPrice.isNegative() || quantity.isNegative()) {
      throw new BadRequestException('unit_price and quantity must be >= 0');
    }

    const taxRate = data.tax_rate ? new Prisma.Decimal(data.tax_rate) : new Prisma.Decimal(0);
    if (taxRate.isNegative() || taxRate.greaterThan(1)) {
      throw new BadRequestException('tax_rate must be between 0 and 1');
    }

    const discountPercent = data.discount_percent ?? 0;
    if (discountPercent < 0 || discountPercent > 100) {
      throw new BadRequestException('discount_percent must be between 0 and 100');
    }

    // compute derived fields
    const lineSubtotal = unitPrice.mul(quantity);
    const lineDiscountAmount = lineSubtotal.mul(new Prisma.Decimal(discountPercent)).div(100);
    const taxableBase = Prisma.Decimal.max(new Prisma.Decimal(0), lineSubtotal.sub(lineDiscountAmount));
    const taxAmount = taxableBase.mul(taxRate);
    const lineTotal = taxableBase.add(taxAmount);

    const created = await this.repository.create({
      invoices: { connect: { id: data.invoice_id } },
      line_number: data.line_number,

      // ✅ Prisma CreateInput expects relation connect (not product_id)
      ...(data.product_id ? { products: { connect: { id: data.product_id } } } : {}),

      description: data.description ?? null,
      unit: data.unit ?? null,

      unit_price: unitPrice,
      quantity,

      tax_rate: taxRate,
      tax_amount: taxAmount,

      discount_percent: discountPercent,
      discount_amount: lineDiscountAmount,

      line_subtotal: lineSubtotal,
      line_total: lineTotal,
    });

    if (!created) throw new BadRequestException('Failed to create invoice line');
    return created;
  }

  async update(id: string, data: UpdateInvoiceLineDTO) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Invoice line not found');

    const unitPrice =
      data.unit_price !== undefined
        ? new Prisma.Decimal(data.unit_price)
        : new Prisma.Decimal((existing.unit_price as any).toString());

    const quantity =
      data.quantity !== undefined
        ? new Prisma.Decimal(data.quantity)
        : new Prisma.Decimal((existing.quantity as any).toString());

    if (unitPrice.isNegative() || quantity.isNegative()) {
      throw new BadRequestException('unit_price and quantity must be >= 0');
    }

    const taxRate =
      data.tax_rate !== undefined
        ? new Prisma.Decimal(data.tax_rate ?? '0')
        : new Prisma.Decimal((existing.tax_rate as any).toString());

    if (taxRate.isNegative() || taxRate.greaterThan(1)) {
      throw new BadRequestException('tax_rate must be between 0 and 1');
    }

    const discountPercent =
      data.discount_percent !== undefined ? (data.discount_percent ?? 0) : existing.discount_percent ?? 0;

    if (discountPercent < 0 || discountPercent > 100) {
      throw new BadRequestException('discount_percent must be between 0 and 100');
    }

    // recompute derived fields
    const lineSubtotal = unitPrice.mul(quantity);
    const lineDiscountAmount = lineSubtotal.mul(new Prisma.Decimal(discountPercent)).div(100);
    const taxableBase = Prisma.Decimal.max(new Prisma.Decimal(0), lineSubtotal.sub(lineDiscountAmount));
    const taxAmount = taxableBase.mul(taxRate);
    const lineTotal = taxableBase.add(taxAmount);

    // ✅ product relation patch
    // - if product_id is undefined -> do nothing
    // - if product_id is null/empty -> disconnect
    // - if product_id has value -> connect
    let productPatch: Prisma.invoice_linesUpdateInput | undefined;

    if (data.product_id !== undefined) {
      const trimmed = (data.product_id ?? '').trim();
      if (!trimmed) {
        productPatch = { products: { disconnect: true } };
      } else {
        productPatch = { products: { connect: { id: trimmed } } };
      }
    }

    return this.repository.update(id, {
      ...(data.invoice_id !== undefined ? { invoices: { connect: { id: data.invoice_id } } } : {}),
      ...(data.line_number !== undefined ? { line_number: data.line_number } : {}),

      ...(productPatch ?? {}),

      ...(data.description !== undefined ? { description: data.description ?? null } : {}),
      ...(data.unit !== undefined ? { unit: data.unit ?? null } : {}),

      ...(data.unit_price !== undefined ? { unit_price: unitPrice } : {}),
      ...(data.quantity !== undefined ? { quantity } : {}),
      ...(data.tax_rate !== undefined ? { tax_rate: taxRate } : {}),

      ...(data.discount_percent !== undefined ? { discount_percent: discountPercent } : {}),

      // always update derived fields when something changes
      tax_amount: taxAmount,
      discount_amount: lineDiscountAmount,
      line_subtotal: lineSubtotal,
      line_total: lineTotal,

    });
  }

  async remove(id: string) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Invoice line not found');
    return this.repository.remove(id);
  }
}