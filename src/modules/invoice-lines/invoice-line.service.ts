import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InvoiceLineRepository } from './invoice-line.repository';
import { CreateInvoiceLineDTO } from './dto/create.dto';
import { UpdateInvoiceLineDTO } from './dto/update.dto';

@Injectable()
export class InvoiceLineService {
  constructor(private readonly repository: InvoiceLineRepository) {}

  async findAll(query: { invoice_id?: string; product_id?: string } | undefined, tenantId: string) {
    return this.repository.findAll(tenantId, {
      invoice_id: query?.invoice_id,
      product_id: query?.product_id,
    });
  }

  async findById(id: string, tenantId: string) {
    const line = await this.repository.findById(id, tenantId);
    if (!line) throw new NotFoundException('Invoice line not found');
    return line;
  }

  async create(data: CreateInvoiceLineDTO, tenantId: string) {
    // Validate invoice belongs to tenant (prevents cross-tenant link)
    const invoiceOk = await this.repository.invoiceExists(data.invoice_id, tenantId);
    if (!invoiceOk) throw new BadRequestException('Invoice not found for this tenant');

    // Optional product validation
    if (data.product_id) {
      const productOk = await this.repository.productExists(data.product_id, tenantId);
      if (!productOk) throw new BadRequestException('Product not found for this tenant');
    }

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

    const created = await this.repository.create(tenantId, {
      invoice_id: data.invoice_id,
      line_number: data.line_number,

      product_id: data.product_id ?? null,

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

  async update(id: string, data: UpdateInvoiceLineDTO, tenantId: string) {
    const existing = await this.repository.findById(id, tenantId);
    if (!existing) throw new NotFoundException('Invoice line not found');

    // Validate invoice/product if changed
    if (data.invoice_id !== undefined && data.invoice_id) {
      const invoiceOk = await this.repository.invoiceExists(data.invoice_id, tenantId);
      if (!invoiceOk) throw new BadRequestException('Invoice not found for this tenant');
    }

    if (data.product_id !== undefined) {
      const trimmed = (data.product_id ?? '').trim();
      if (trimmed) {
        const productOk = await this.repository.productExists(trimmed, tenantId);
        if (!productOk) throw new BadRequestException('Product not found for this tenant');
      }
    }

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
      data.discount_percent !== undefined ? (data.discount_percent ?? 0) : (existing.discount_percent ?? 0);

    if (discountPercent < 0 || discountPercent > 100) {
      throw new BadRequestException('discount_percent must be between 0 and 100');
    }

    // recompute derived fields
    const lineSubtotal = unitPrice.mul(quantity);
    const lineDiscountAmount = lineSubtotal.mul(new Prisma.Decimal(discountPercent)).div(100);
    const taxableBase = Prisma.Decimal.max(new Prisma.Decimal(0), lineSubtotal.sub(lineDiscountAmount));
    const taxAmount = taxableBase.mul(taxRate);
    const lineTotal = taxableBase.add(taxAmount);

    // IMPORTANT: updateMany does not support nested relation patch.
    // So we patch FK fields directly (UncheckedUpdateInput).
    const patch: Prisma.invoice_linesUncheckedUpdateInput = {
      ...(data.invoice_id !== undefined ? { invoice_id: data.invoice_id ?? (existing as any).invoice_id } : {}),
      ...(data.line_number !== undefined ? { line_number: data.line_number } : {}),

      ...(data.product_id !== undefined
        ? { product_id: (data.product_id ?? '').trim() ? (data.product_id ?? '').trim() : null }
        : {}),

      ...(data.description !== undefined ? { description: data.description ?? null } : {}),
      ...(data.unit !== undefined ? { unit: data.unit ?? null } : {}),

      ...(data.unit_price !== undefined ? { unit_price: unitPrice } : {}),
      ...(data.quantity !== undefined ? { quantity } : {}),
      ...(data.tax_rate !== undefined ? { tax_rate: taxRate } : {}),

      ...(data.discount_percent !== undefined ? { discount_percent: discountPercent } : {}),

      // always update derived fields
      tax_amount: taxAmount,
      discount_amount: lineDiscountAmount,
      line_subtotal: lineSubtotal,
      line_total: lineTotal,
    };

    const updated = await this.repository.update(id, tenantId, patch);
    if (!updated) throw new NotFoundException('Invoice line not found');
    return updated;
  }

  async remove(id: string, tenantId: string) {
    const existing = await this.repository.findById(id, tenantId);
    if (!existing) throw new NotFoundException('Invoice line not found');

    const ok = await this.repository.remove(id, tenantId);
    if (!ok) throw new NotFoundException('Invoice line not found');

    return { ok: true };
  }
}
