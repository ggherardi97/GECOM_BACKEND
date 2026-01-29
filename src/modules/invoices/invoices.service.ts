import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InvoiceRepository } from './invoices.repository';
import { CreateInvoiceDTO } from './dto/create.dto';
import { UpdateInvoiceDTO } from './dto/update.dto';

@Injectable()
export class InvoiceService {
  constructor(private readonly repository: InvoiceRepository) {}

  async findAll(query?: { company_id?: string; status?: string }) {
    const status = query?.status != null && String(query.status).trim().length > 0 ? Number(query.status) : undefined;
    return this.repository.findAll({
      company_id: query?.company_id,
      status: Number.isNaN(status as any) ? undefined : status,
    });
  }

  async findById(id: string) {
    const invoice = await this.repository.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async create(data: CreateInvoiceDTO) {
    // ✅ Wizard-friendly: allow creating invoice without lines
    const headerDiscountPercent = data.discount_percent ?? 0;

    const hasLines = Array.isArray(data.lines) && data.lines.length > 0;

    const computed = hasLines
      ? this.computeTotals(data.lines, headerDiscountPercent)
      : {
          subtotal: new Prisma.Decimal(0),
          taxTotal: new Prisma.Decimal(0),
          discountAmount: new Prisma.Decimal(0),
          total: new Prisma.Decimal(0),
          linesToCreate: [],
        };

    const created = await this.repository.create({
      // DB trigger will fill invoice_number if empty
      invoice_number: '',

      companies: { connect: { id: data.company_id } },
      currencies: { connect: { id: data.currency_id } },

      quote_at: data.quote_at ? new Date(data.quote_at) : undefined,
      exchange_rate: data.exchange_rate ?? new Prisma.Decimal(1),
      version: data.version ?? 1,

      billing_address_line1: data.billing_address_line1,
      billing_address_line2: data.billing_address_line2,
      billing_address_city: data.billing_address_city,
      billing_address_state: data.billing_address_state,
      billing_address_postal_code: data.billing_address_postal_code,
      billing_address_country: data.billing_address_country,

      status: data.status ?? 0,

      subtotal: computed.subtotal,
      discount_percent: headerDiscountPercent,
      discount_amount: computed.discountAmount,
      tax_total: computed.taxTotal,
      fee_total: new Prisma.Decimal(0),
      total: computed.total,

      notes: data.notes,
      terms: data.terms,

      ...(hasLines
        ? {
            invoice_lines: {
              create: computed.linesToCreate.map((l) => ({
                line_number: l.line_number,
                product_id: l.product_id ?? null,
                description: l.description ?? null,
                unit: l.unit ?? null,
                unit_price: l.unit_price,
                quantity: l.quantity,
                tax_rate: l.tax_rate,
                tax_amount: l.tax_amount,
                discount_percent: l.discount_percent,
                discount_amount: l.discount_amount,
                line_subtotal: l.line_subtotal,
                line_total: l.line_total,
              })),
            },
          }
        : {}),
    });

    if (!created) throw new BadRequestException('Failed to create invoice');
    return created;
  }

  async update(id: string, data: UpdateInvoiceDTO) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Invoice not found');

    const patch: Prisma.invoicesUpdateInput = {
      updated_at: new Date(),
    };

    if (data.invoice_number !== undefined) patch.invoice_number = data.invoice_number ?? '';
    if (data.status !== undefined) patch.status = data.status;
    if (data.version !== undefined) patch.version = data.version;

    if (data.quote_at !== undefined) patch.quote_at = data.quote_at ? new Date(data.quote_at) : null;
    if (data.exchange_rate !== undefined) patch.exchange_rate = new Prisma.Decimal(data.exchange_rate);

    if (data.billing_address_line1 !== undefined) patch.billing_address_line1 = data.billing_address_line1 ?? null;
    if (data.billing_address_line2 !== undefined) patch.billing_address_line2 = data.billing_address_line2 ?? null;
    if (data.billing_address_city !== undefined) patch.billing_address_city = data.billing_address_city ?? null;
    if (data.billing_address_state !== undefined) patch.billing_address_state = data.billing_address_state ?? null;
    if (data.billing_address_postal_code !== undefined) patch.billing_address_postal_code = data.billing_address_postal_code ?? null;
    if (data.billing_address_country !== undefined) patch.billing_address_country = data.billing_address_country ?? null;

    if (data.notes !== undefined) patch.notes = data.notes ?? null;
    if (data.terms !== undefined) patch.terms = data.terms ?? null;

    // ✅ If lines were provided -> recompute totals and replace lines
    if (Array.isArray(data.lines)) {
      if (data.lines.length === 0) {
        // If caller explicitly sends empty lines, we allow it (wizard/partial use-cases).
        // Totals will be set to 0 and lines cleared.
        patch.subtotal = new Prisma.Decimal(0);
        patch.discount_percent = data.discount_percent ?? existing.discount_percent ?? 0;
        patch.discount_amount = new Prisma.Decimal(0);
        patch.tax_total = new Prisma.Decimal(0);
        patch.total = new Prisma.Decimal(0);

        await this.repository.update(id, patch);
        await this.repository.replaceLines(id, []); // clears all lines
        return this.findById(id);
      }

      const headerDiscountPercent = data.discount_percent ?? existing.discount_percent ?? 0;
      const computed = this.computeTotals(data.lines, headerDiscountPercent);

      patch.subtotal = computed.subtotal;
      patch.discount_percent = headerDiscountPercent;
      patch.discount_amount = computed.discountAmount;
      patch.tax_total = computed.taxTotal;
      patch.total = computed.total;

      await this.repository.update(id, patch);

      await this.repository.replaceLines(
        id,
        computed.linesToCreate.map((l) => ({
          invoice_id: id,
          line_number: l.line_number,
          product_id: l.product_id ?? null,
          description: l.description ?? null,
          unit: l.unit ?? null,
          unit_price: l.unit_price,
          quantity: l.quantity,
          tax_rate: l.tax_rate,
          tax_amount: l.tax_amount,
          discount_percent: l.discount_percent,
          discount_amount: l.discount_amount,
          line_subtotal: l.line_subtotal,
          line_total: l.line_total,
          created_at: new Date(),
          updated_at: new Date(),
        }))
      );

      return this.findById(id);
    }

    // If header discount changed but no lines passed, we do NOT auto-recalc totals (avoids hidden changes).
    if (data.discount_percent !== undefined) patch.discount_percent = data.discount_percent;

    return this.repository.update(id, patch);
  }

  async remove(id: string) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Invoice not found');
    return this.repository.remove(id);
  }

  private computeTotals(lines: CreateInvoiceDTO['lines'] | undefined, headerDiscountPercent: number) {
  const safeLines = lines ?? [];

    let subtotal = new Prisma.Decimal(0);
    let taxTotal = new Prisma.Decimal(0);

    const linesToCreate: Array<{
      line_number: number;
      product_id?: string;
      description?: string;
      unit?: string;
      unit_price: Prisma.Decimal;
      quantity: Prisma.Decimal;
      tax_rate: Prisma.Decimal;
      tax_amount: Prisma.Decimal;
      discount_percent: number;
      discount_amount: Prisma.Decimal;
      line_subtotal: Prisma.Decimal;
      line_total: Prisma.Decimal;
    }> = [];

    safeLines.forEach((l, index) => {
      const lineNumber = index + 1;

      const unitPrice = new Prisma.Decimal(l.unit_price);
      const quantity = new Prisma.Decimal(l.quantity);

      if (unitPrice.isNegative() || quantity.isNegative()) {
        throw new BadRequestException('unit_price and quantity must be >= 0');
      }

      const taxRate = l.tax_rate != null ? new Prisma.Decimal(l.tax_rate) : new Prisma.Decimal(0);
      if (taxRate.isNegative() || taxRate.greaterThan(1)) {
        throw new BadRequestException('tax_rate must be between 0 and 1');
      }

      const lineDiscountPercent = l.discount_percent ?? 0;
      if (lineDiscountPercent < 0 || lineDiscountPercent > 100) {
        throw new BadRequestException('discount_percent must be between 0 and 100');
      }

      const lineSubtotal = unitPrice.mul(quantity);
      const lineDiscountAmount = lineSubtotal.mul(new Prisma.Decimal(lineDiscountPercent)).div(100);
      const taxableBase = Prisma.Decimal.max(new Prisma.Decimal(0), lineSubtotal.sub(lineDiscountAmount));

      const lineTaxAmount = taxableBase.mul(taxRate);
      const lineTotal = taxableBase.add(lineTaxAmount);

      subtotal = subtotal.add(lineSubtotal);
      taxTotal = taxTotal.add(lineTaxAmount);

      linesToCreate.push({
        line_number: lineNumber,
        product_id: l.product_id,
        description: l.description,
        unit: l.unit,
        unit_price: unitPrice,
        quantity: quantity,
        tax_rate: taxRate,
        tax_amount: lineTaxAmount,
        discount_percent: lineDiscountPercent,
        discount_amount: lineDiscountAmount,
        line_subtotal: lineSubtotal,
        line_total: lineTotal,
      });
    });

    const headerDiscountAmount = subtotal.mul(new Prisma.Decimal(headerDiscountPercent)).div(100);
    const total = Prisma.Decimal.max(new Prisma.Decimal(0), subtotal.sub(headerDiscountAmount)).add(taxTotal);

    return {
      subtotal,
      taxTotal,
      discountAmount: headerDiscountAmount,
      total,
      linesToCreate,
    };
  }
}