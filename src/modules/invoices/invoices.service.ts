import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InvoiceRepository } from './invoices.repository';
import { CreateInvoiceDTO } from './dto/create.dto';
import { UpdateInvoiceDTO } from './dto/update.dto';
import { StatusConfigService } from '../status-config/status-config.service';
import { AutomationDispatcherService } from '../automation/automation-dispatcher.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class InvoiceService {
  constructor(
    private readonly repository: InvoiceRepository,
    private readonly statusConfigService: StatusConfigService,
    private readonly automationDispatcher: AutomationDispatcherService,
    private readonly prisma: PrismaService,
  ) {}

  async findAll(
    query: { company_id?: string; status?: string; status_config_id?: string } | undefined,
    tenantId: string,
    fields?: string,
  ) {
    let resolvedStatus:
      | {
          status: number;
          statusConfig: { id: string };
        }
      | undefined;

    if (
      (query?.status !== undefined && String(query.status).trim().length > 0) ||
      (query?.status_config_id !== undefined && String(query.status_config_id).trim().length > 0)
    ) {
      resolvedStatus = await this.statusConfigService.resolveInvoiceStatus(tenantId, {
        status: query?.status,
        status_config_id: query?.status_config_id,
      });
    }

    return this.repository.findAll({
      tenantId,
      company_id: query?.company_id,
      status: resolvedStatus?.status,
      status_config_id: resolvedStatus?.statusConfig.id,
      fields,
    });
  }

  async findById(id: string, tenantId: string) {
    const invoice = await this.repository.findById(id, tenantId);
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async create(data: CreateInvoiceDTO, tenantId: string) {
    const resolvedStatus = await this.statusConfigService.resolveInvoiceStatus(tenantId, {
      status: data.status,
      status_config_id: data.status_config_id,
    });

    const headerDiscountPercent = this.normalizePercent(data.discount_percent ?? 0);
    const hasLines = Array.isArray(data.lines) && data.lines.length > 0;

    const computed = hasLines
      ? this.computeTotals(data.lines, headerDiscountPercent)
      : {
          subtotal: new Prisma.Decimal(0),
          taxTotal: new Prisma.Decimal(0),
          headerDiscountAmount: new Prisma.Decimal(0),
          lineDiscountTotal: new Prisma.Decimal(0),
          total: new Prisma.Decimal(0),
          linesToCreate: [],
        };

    const exchangeRateInput = this.parseExchangeRateInput(data.exchange_rate);
    const receivedAmountBrl = await this.resolveReceivedAmountBrl({
      currencyId: data.currency_id,
      total: computed.total,
      exchangeRate: exchangeRateInput.decimal,
      explicitExchangeRate: exchangeRateInput.explicit,
      clearedExchangeRate: exchangeRateInput.cleared,
    });

    if (this.isPaidStatus(resolvedStatus.status) && (await this.isNonBrlCurrency(data.currency_id))) {
      if (!receivedAmountBrl) {
        throw new BadRequestException('exchange_rate é obrigatório quando a fatura for marcada como paga em moeda diferente de BRL.');
      }
    }

    const created = await this.repository.create({
      invoice_number: '',
      companies: { connect: { id: data.company_id } },
      currencies: { connect: { id: data.currency_id } },
      status_config: { connect: { id: resolvedStatus.statusConfig.id } },

      quote_at: data.quote_at ? new Date(data.quote_at) : undefined,
      due_at: data.due_at ? new Date(data.due_at) : undefined,

      exchange_rate: exchangeRateInput.decimal,
      version: data.version ?? 1,

      billing_address_line1: data.billing_address_line1 ?? null,
      billing_address_line2: data.billing_address_line2 ?? null,
      billing_address_city: data.billing_address_city ?? null,
      billing_address_state: data.billing_address_state ?? null,
      billing_address_postal_code: data.billing_address_postal_code ?? null,
      billing_address_country: data.billing_address_country ?? null,

      status: resolvedStatus.status,

      subtotal: computed.subtotal,
      discount_percent: headerDiscountPercent,
      discount_amount: computed.headerDiscountAmount,
      tax_total: computed.taxTotal,
      fee_total: new Prisma.Decimal(0),
      total: computed.total,
      received_amount_brl: receivedAmountBrl,

      notes: data.notes ?? null,
      terms: data.terms ?? null,

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
    } as any);

    if (!created) throw new BadRequestException('Failed to create invoice');
    return created;
  }

  async update(id: string, tenantId: string, data: UpdateInvoiceDTO, userId?: string) {
    const existing = await this.repository.findById(id, tenantId);
    if (!existing) throw new NotFoundException('Invoice not found');

    const patch: Prisma.invoicesUpdateManyMutationInput = {
      updated_at: new Date(),
    };

    const nextCurrencyId = String(data.currency_id ?? existing.currency_id ?? '').trim();
    const exchangeRateInput = this.parseExchangeRateInput(
      data.exchange_rate !== undefined ? data.exchange_rate : existing.exchange_rate,
      data.exchange_rate !== undefined,
    );

    if (data.invoice_number !== undefined) patch.invoice_number = data.invoice_number ?? '';
    if (data.company_id !== undefined) (patch as any).company_id = data.company_id;
    if (data.currency_id !== undefined) (patch as any).currency_id = data.currency_id;

    if (data.status !== undefined || data.status_config_id !== undefined) {
      const resolvedStatus = await this.statusConfigService.resolveInvoiceStatus(tenantId, {
        status: data.status,
        status_config_id: data.status_config_id,
      });
      patch.status = resolvedStatus.status as any;
      (patch as any).status_config_id = resolvedStatus.statusConfig.id;
    }

    if (data.version !== undefined) patch.version = data.version;

    if (data.quote_at !== undefined) patch.quote_at = data.quote_at ? new Date(data.quote_at) : null;
    if (data.due_at !== undefined) patch.due_at = data.due_at ? new Date(data.due_at) : null;

    if (data.exchange_rate !== undefined) {
      patch.exchange_rate = exchangeRateInput.decimal;
    }

    if (data.billing_address_line1 !== undefined) patch.billing_address_line1 = data.billing_address_line1 ?? null;
    if (data.billing_address_line2 !== undefined) patch.billing_address_line2 = data.billing_address_line2 ?? null;
    if (data.billing_address_city !== undefined) patch.billing_address_city = data.billing_address_city ?? null;
    if (data.billing_address_state !== undefined) patch.billing_address_state = data.billing_address_state ?? null;
    if (data.billing_address_postal_code !== undefined) patch.billing_address_postal_code = data.billing_address_postal_code ?? null;
    if (data.billing_address_country !== undefined) patch.billing_address_country = data.billing_address_country ?? null;

    if (data.notes !== undefined) patch.notes = data.notes ?? null;
    if (data.terms !== undefined) patch.terms = data.terms ?? null;

    if (Array.isArray(data.lines)) {
      const headerDiscountPercent = this.normalizePercent(data.discount_percent ?? (existing.discount_percent as any) ?? 0);

      if (data.lines.length === 0) {
        patch.subtotal = new Prisma.Decimal(0);
        patch.discount_percent = headerDiscountPercent;
        patch.discount_amount = new Prisma.Decimal(0);
        patch.tax_total = new Prisma.Decimal(0);
        patch.total = new Prisma.Decimal(0);
        (patch as any).received_amount_brl = await this.resolveReceivedAmountBrl({
          currencyId: nextCurrencyId,
          total: new Prisma.Decimal(0),
          exchangeRate: exchangeRateInput.decimal,
          explicitExchangeRate: exchangeRateInput.explicit,
          clearedExchangeRate: exchangeRateInput.cleared,
          previousReceivedAmountBrl: (existing as any).received_amount_brl,
        });

        await this.assertPaidForeignInvoiceHasRate(patch.status ?? existing.status, nextCurrencyId, (patch as any).received_amount_brl);

        const updatedHeader = await this.repository.update(id, tenantId, patch);
        if (!updatedHeader) throw new NotFoundException('Invoice not found');

        await this.repository.replaceLines(id, tenantId, []);
        const refreshed = await this.findById(id, tenantId);

        this.automationDispatcher.dispatch({
          tenantId,
          userId,
          entityName: 'invoices',
          eventType: 'UPDATE',
          recordId: id,
          changedFields: Object.keys(data ?? {}),
          payload: {
            before: existing as unknown as Record<string, unknown>,
            after: refreshed as unknown as Record<string, unknown>,
            changedFields: Object.keys(data ?? {}),
          },
        });

        return refreshed;
      }

      const computed = this.computeTotals(data.lines, headerDiscountPercent);

      patch.subtotal = computed.subtotal;
      patch.discount_percent = headerDiscountPercent;
      patch.discount_amount = computed.headerDiscountAmount;
      patch.tax_total = computed.taxTotal;
      patch.total = computed.total;
      (patch as any).received_amount_brl = await this.resolveReceivedAmountBrl({
        currencyId: nextCurrencyId,
        total: computed.total,
        exchangeRate: exchangeRateInput.decimal,
        explicitExchangeRate: exchangeRateInput.explicit,
        clearedExchangeRate: exchangeRateInput.cleared,
        previousReceivedAmountBrl: (existing as any).received_amount_brl,
      });

      await this.assertPaidForeignInvoiceHasRate(patch.status ?? existing.status, nextCurrencyId, (patch as any).received_amount_brl);

      const updatedHeader = await this.repository.update(id, tenantId, patch);
      if (!updatedHeader) throw new NotFoundException('Invoice not found');

      await this.repository.replaceLines(
        id,
        tenantId,
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
        })),
      );

      const refreshed = await this.findById(id, tenantId);

      this.automationDispatcher.dispatch({
        tenantId,
        userId,
        entityName: 'invoices',
        eventType: 'UPDATE',
        recordId: id,
        changedFields: Object.keys(data ?? {}),
        payload: {
          before: existing as unknown as Record<string, unknown>,
          after: refreshed as unknown as Record<string, unknown>,
          changedFields: Object.keys(data ?? {}),
        },
      });

      return refreshed;
    }

    if (data.discount_percent !== undefined) patch.discount_percent = this.normalizePercent(data.discount_percent);
    (patch as any).received_amount_brl = await this.resolveReceivedAmountBrl({
      currencyId: nextCurrencyId,
      total: this.decimalOrZero(existing.total),
      exchangeRate: exchangeRateInput.decimal,
      explicitExchangeRate: exchangeRateInput.explicit,
      clearedExchangeRate: exchangeRateInput.cleared,
      previousReceivedAmountBrl: (existing as any).received_amount_brl,
    });

    await this.assertPaidForeignInvoiceHasRate(patch.status ?? existing.status, nextCurrencyId, (patch as any).received_amount_brl);

    const updated = await this.repository.update(id, tenantId, patch);
    if (!updated) throw new NotFoundException('Invoice not found');
    this.automationDispatcher.dispatch({
      tenantId,
      userId,
      entityName: 'invoices',
      eventType: 'UPDATE',
      recordId: id,
      changedFields: Object.keys(data ?? {}),
      payload: {
        before: existing as unknown as Record<string, unknown>,
        after: updated as unknown as Record<string, unknown>,
        changedFields: Object.keys(data ?? {}),
      },
    });

    return updated;
  }

  async remove(id: string, tenantId: string) {
    const existing = await this.repository.findById(id, tenantId);
    if (!existing) throw new NotFoundException('Invoice not found');

    const removed = await this.repository.remove(id, tenantId);
    if (!removed) throw new NotFoundException('Invoice not found');

    return removed;
  }

  private normalizePercent(value: any): number {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.trunc(n)));
  }

  private parseExchangeRateInput(value: unknown, explicitOverride = true) {
    const raw = this.normalizeDecimalString(value);
    return {
      explicit: explicitOverride ? raw.length > 0 : false,
      cleared: explicitOverride && raw.length === 0,
      decimal: raw ? new Prisma.Decimal(raw) : new Prisma.Decimal(1),
    };
  }

  private normalizeDecimalString(value: unknown): string {
    const raw = String(value ?? '').trim();
    if (!raw) return '';

    const cleaned = raw.replace(/\s+/g, '').replace(/[^\d,.-]/g, '');
    if (!cleaned) return '';

    if (cleaned.includes('.') && cleaned.includes(',')) {
      return cleaned.replace(/\./g, '').replace(',', '.');
    }

    if (cleaned.includes(',') && !cleaned.includes('.')) {
      return cleaned.replace(',', '.');
    }

    return cleaned;
  }

  private decimalOrZero(value: Prisma.Decimal.Value | null | undefined) {
    const raw = value == null || String(value).trim() === '' ? '0' : String(value);
    return new Prisma.Decimal(raw);
  }

  private async resolveCurrencyCode(currencyId: string): Promise<string> {
    const normalizedId = String(currencyId || '').trim();
    if (!normalizedId) return '';
    const currency = await this.prisma.currencies.findFirst({
      where: { id: normalizedId },
      select: { code: true },
    });
    return String(currency?.code || '').trim().toUpperCase();
  }

  private async isNonBrlCurrency(currencyId: string): Promise<boolean> {
    const code = await this.resolveCurrencyCode(currencyId);
    return !!code && code !== 'BRL';
  }

  private isPaidStatus(status: unknown): boolean {
    return Number(status) === 4;
  }

  private async resolveReceivedAmountBrl(params: {
    currencyId: string;
    total: Prisma.Decimal;
    exchangeRate: Prisma.Decimal;
    explicitExchangeRate: boolean;
    clearedExchangeRate: boolean;
    previousReceivedAmountBrl?: Prisma.Decimal.Value | null;
  }): Promise<Prisma.Decimal | null> {
    const currencyCode = await this.resolveCurrencyCode(params.currencyId);
    if (!currencyCode) return null;
    if (currencyCode === 'BRL') {
      return params.total;
    }

    if (params.clearedExchangeRate) {
      return null;
    }

    const shouldCompute =
      params.explicitExchangeRate ||
      params.previousReceivedAmountBrl !== undefined && params.previousReceivedAmountBrl !== null;

    if (!shouldCompute) return null;

    if (params.exchangeRate.lte(new Prisma.Decimal(0))) return null;
    return params.total.mul(params.exchangeRate);
  }

  private async assertPaidForeignInvoiceHasRate(
    status: unknown,
    currencyId: string,
    receivedAmountBrl: Prisma.Decimal.Value | null | undefined,
  ) {
    if (!this.isPaidStatus(status)) return;
    if (!(await this.isNonBrlCurrency(currencyId))) return;

    if (receivedAmountBrl == null) {
      throw new BadRequestException('exchange_rate é obrigatório quando a fatura for marcada como paga em moeda diferente de BRL.');
    }
  }

  private assertIntegerDecimal(qty: Prisma.Decimal, message: string) {
    const mod = qty.mod(new Prisma.Decimal(1));
    if (!mod.equals(new Prisma.Decimal(0))) {
      throw new BadRequestException(message);
    }
  }

  private computeTotals(lines: CreateInvoiceDTO['lines'] | undefined, headerDiscountPercent: number) {
    const safeLines = lines ?? [];

    let subtotal = new Prisma.Decimal(0);
    let taxTotal = new Prisma.Decimal(0);
    let lineDiscountTotal = new Prisma.Decimal(0);

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

      const unitPrice = new Prisma.Decimal(String(l.unit_price ?? '0'));
      const quantity = new Prisma.Decimal(String(l.quantity ?? '0'));

      if (unitPrice.isNegative() || quantity.isNegative()) {
        throw new BadRequestException('unit_price and quantity must be >= 0');
      }

      this.assertIntegerDecimal(quantity, 'quantity must be an integer');

      const taxRate = l.tax_rate != null ? new Prisma.Decimal(String(l.tax_rate)) : new Prisma.Decimal(0);
      if (taxRate.isNegative() || taxRate.greaterThan(1)) {
        throw new BadRequestException('tax_rate must be between 0 and 1');
      }

      const discountPercent = this.normalizePercent(l.discount_percent ?? 0);

      const gross = unitPrice.mul(quantity);
      const discountAmount = gross.mul(new Prisma.Decimal(discountPercent)).div(new Prisma.Decimal(100));
      const taxableBase = Prisma.Decimal.max(new Prisma.Decimal(0), gross.sub(discountAmount));
      const taxAmount = taxableBase.mul(taxRate);
      const lineTotal = taxableBase.add(taxAmount);

      subtotal = subtotal.add(gross);
      taxTotal = taxTotal.add(taxAmount);
      lineDiscountTotal = lineDiscountTotal.add(discountAmount);

      linesToCreate.push({
        line_number: lineNumber,
        product_id: l.product_id ?? undefined,
        description: l.description ?? undefined,
        unit: l.unit ?? undefined,
        unit_price: unitPrice,
        quantity,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        discount_percent: discountPercent,
        discount_amount: discountAmount,
        line_subtotal: gross,
        line_total: lineTotal,
      });
    });

    const headerDiscountAmount = subtotal.mul(new Prisma.Decimal(headerDiscountPercent)).div(new Prisma.Decimal(100));
    const total = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      subtotal.sub(lineDiscountTotal).sub(headerDiscountAmount).add(taxTotal),
    );

    return {
      subtotal,
      taxTotal,
      headerDiscountAmount,
      lineDiscountTotal,
      total,
      linesToCreate,
    };
  }
}
