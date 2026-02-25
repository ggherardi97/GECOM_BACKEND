import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContractStatus, Prisma } from '@prisma/client';
import { ContractsRepository } from './contracts.repository';
import { CreateContractDto, CreateContractLineDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { GenerateContractInvoiceDto } from './dto/generate-contract-invoice.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { StatusConfigService } from '../status-config/status-config.service';

type AuthUser = {
  id: string;
  tenant_id: string;
};

@Injectable()
export class ContractsService {
  constructor(
    private readonly repository: ContractsRepository,
    private readonly prisma: PrismaService,
    private readonly statusConfigService: StatusConfigService,
  ) {}

  async list(user: AuthUser, query: { q?: string; status?: string; company_id?: string; owner_user_id?: string; fields?: string }) {
    const rawStatus = String(query.status || '').trim().toUpperCase();
    const status = rawStatus && rawStatus in ContractStatus ? (rawStatus as ContractStatus) : undefined;
    const fields = String(query.fields || '').trim().toLowerCase();

    return this.repository.list({
      tenantId: user.tenant_id,
      q: query.q,
      status,
      companyId: query.company_id,
      ownerUserId: query.owner_user_id,
      fields,
    });
  }

  async findById(user: AuthUser, id: string) {
    const found = await this.repository.findById(user.tenant_id, id);
    if (!found) throw new NotFoundException('Contract not found');
    return found;
  }

  async create(user: AuthUser, dto: CreateContractDto) {
    const ownerUserId = dto.owner_user_id || user.id;
    const lines = this.normalizeLines(dto.lines || []);
    const totals = this.computeTotals(lines, dto.discount_percent ?? 0);

    const created = await this.repository.create({
      tenant_id: user.tenant_id,
      contract_number: this.normalizeContractNumber(dto.contract_number),
      name: dto.name,
      status: dto.status ?? ContractStatus.DRAFT,
      start_at: dto.start_at ? new Date(dto.start_at) : null,
      end_at: dto.end_at ? new Date(dto.end_at) : null,
      renewal_date: dto.renewal_date ? new Date(dto.renewal_date) : null,
      billing_day: dto.billing_day ?? null,
      auto_renew: dto.auto_renew ?? false,
      subtotal: totals.subtotal,
      discount_percent: totals.headerDiscountPercent,
      discount_amount: totals.headerDiscountAmount,
      tax_total: totals.taxTotal,
      total: totals.total,
      terms: dto.terms ?? null,
      notes: dto.notes ?? null,
      company: { connect: { id: dto.company_id } },
      owner_user: { connect: { id: ownerUserId } },
      currency: { connect: { id: dto.currency_id } },
      ...(dto.lead_id ? { lead: { connect: { id: dto.lead_id } } } : {}),
      ...(dto.opportunity_id ? { opportunity: { connect: { id: dto.opportunity_id } } } : {}),
      ...(dto.price_table_id ? { price_table: { connect: { id: dto.price_table_id } } } : {}),
      ...(lines.length
        ? {
            lines: {
              create: lines.map((line, index) => ({
                tenant_id: user.tenant_id,
                line_number: index + 1,
                product_id: line.product_id ?? null,
                description: line.description ?? null,
                unit: line.unit ?? null,
                unit_price: line.unit_price,
                quantity: line.quantity,
                tax_rate: line.tax_rate,
                tax_amount: line.tax_amount,
                discount_percent: line.discount_percent,
                discount_amount: line.discount_amount,
                line_subtotal: line.line_subtotal,
                line_total: line.line_total,
                start_at: line.start_at,
                end_at: line.end_at,
                billing_frequency: line.billing_frequency,
                is_recurring: line.is_recurring,
              })),
            },
          }
        : {}),
    });

    return this.findById(user, created.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateContractDto) {
    const existing = await this.repository.findById(user.tenant_id, id);
    if (!existing) throw new NotFoundException('Contract not found');

    const patch: Prisma.contractsUncheckedUpdateInput = {
      ...(dto.contract_number !== undefined ? { contract_number: this.normalizeContractNumber(dto.contract_number) } : {}),
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.company_id !== undefined ? { company_id: dto.company_id } : {}),
      ...(dto.lead_id !== undefined ? { lead_id: dto.lead_id ?? null } : {}),
      ...(dto.opportunity_id !== undefined ? { opportunity_id: dto.opportunity_id ?? null } : {}),
      ...(dto.owner_user_id !== undefined ? { owner_user_id: dto.owner_user_id } : {}),
      ...(dto.currency_id !== undefined ? { currency_id: dto.currency_id } : {}),
      ...(dto.price_table_id !== undefined ? { price_table_id: dto.price_table_id ?? null } : {}),
      ...(dto.start_at !== undefined ? { start_at: dto.start_at ? new Date(dto.start_at) : null } : {}),
      ...(dto.end_at !== undefined ? { end_at: dto.end_at ? new Date(dto.end_at) : null } : {}),
      ...(dto.renewal_date !== undefined ? { renewal_date: dto.renewal_date ? new Date(dto.renewal_date) : null } : {}),
      ...(dto.billing_day !== undefined ? { billing_day: dto.billing_day ?? null } : {}),
      ...(dto.auto_renew !== undefined ? { auto_renew: dto.auto_renew } : {}),
      ...(dto.terms !== undefined ? { terms: dto.terms ?? null } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
      updated_at: new Date(),
    };

    if (dto.lines !== undefined) {
      const lines = this.normalizeLines(dto.lines || []);
      const totals = this.computeTotals(lines, dto.discount_percent ?? Number(existing.discount_percent || 0));

      patch.subtotal = totals.subtotal;
      patch.discount_percent = totals.headerDiscountPercent;
      patch.discount_amount = totals.headerDiscountAmount;
      patch.tax_total = totals.taxTotal;
      patch.total = totals.total;

      const updated = await this.repository.update(id, user.tenant_id, patch);
      if (!updated) throw new NotFoundException('Contract not found');

      await this.repository.replaceLines({
        tenantId: user.tenant_id,
        contractId: id,
        lines: lines.map((line, index) => ({
          tenant_id: user.tenant_id,
          contract_id: id,
          line_number: index + 1,
          product_id: line.product_id ?? null,
          description: line.description ?? null,
          unit: line.unit ?? null,
          unit_price: line.unit_price,
          quantity: line.quantity,
          tax_rate: line.tax_rate,
          tax_amount: line.tax_amount,
          discount_percent: line.discount_percent,
          discount_amount: line.discount_amount,
          line_subtotal: line.line_subtotal,
          line_total: line.line_total,
          start_at: line.start_at,
          end_at: line.end_at,
          billing_frequency: line.billing_frequency,
          is_recurring: line.is_recurring,
        })),
      });

      return this.findById(user, id);
    }

    if (dto.discount_percent !== undefined) {
      patch.discount_percent = this.normalizePercent(dto.discount_percent);
    }

    const updated = await this.repository.update(id, user.tenant_id, patch);
    if (!updated) throw new NotFoundException('Contract not found');
    return updated;
  }

  async remove(user: AuthUser, id: string) {
    const removed = await this.repository.remove(id, user.tenant_id);
    if (!removed) throw new NotFoundException('Contract not found');
    return removed;
  }

  async generateInvoice(user: AuthUser, id: string, dto: GenerateContractInvoiceDto) {
    const contract = await this.repository.findById(user.tenant_id, id);
    if (!contract) throw new NotFoundException('Contract not found');

    const lines = Array.isArray(contract.lines) ? contract.lines : [];
    if (!lines.length) throw new BadRequestException('Contract has no product lines to bill.');

    const resolvedInvoiceStatus = await this.statusConfigService.resolveInvoiceStatus(user.tenant_id, { status: '0' });

    const createdInvoice = await this.prisma.invoices.create({
      data: {
        tenant_id: user.tenant_id,
        invoice_number: '',
        company_id: contract.company_id,
        currency_id: contract.currency_id,
        status: resolvedInvoiceStatus.status,
        status_config_id: resolvedInvoiceStatus.statusConfig.id,
        quote_at: dto.quote_at ? new Date(dto.quote_at) : new Date(),
        due_at: dto.due_at ? new Date(dto.due_at) : null,
        subtotal: contract.subtotal,
        discount_percent: this.normalizePercent(contract.discount_percent),
        discount_amount: contract.discount_amount,
        tax_total: contract.tax_total,
        total: contract.total,
        terms: contract.terms,
        notes: contract.notes,
        invoice_lines: {
          create: lines.map((line, index) => ({
            tenant_id: user.tenant_id,
            line_number: index + 1,
            product_id: line.product_id,
            description: line.description,
            unit: line.unit,
            unit_price: line.unit_price,
            quantity: line.quantity,
            tax_rate: line.tax_rate,
            tax_amount: line.tax_amount,
            discount_percent: line.discount_percent,
            discount_amount: line.discount_amount,
            line_subtotal: line.line_subtotal,
            line_total: line.line_total,
          })),
        },
      },
      include: {
        invoice_lines: true,
      },
    });

    await this.prisma.contract_invoice_links.create({
      data: {
        tenant_id: user.tenant_id,
        contract_id: id,
        invoice_id: createdInvoice.id,
        period_start: dto.period_start ? new Date(dto.period_start) : null,
        period_end: dto.period_end ? new Date(dto.period_end) : null,
      },
    });

    if (contract.status === ContractStatus.DRAFT) {
      await this.repository.update(id, user.tenant_id, {
        status: ContractStatus.ACTIVE,
        updated_at: new Date(),
      });
    }

    return {
      ok: true,
      contract_id: id,
      invoice_id: createdInvoice.id,
      invoice: {
        id: createdInvoice.id,
        invoice_number: createdInvoice.invoice_number || null,
      },
    };
  }

  private normalizeContractNumber(value: string | null | undefined) {
    const raw = String(value || '').trim();
    if (raw) return raw;

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const i = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `CTR-${y}${m}${d}-${h}${i}${s}`;
  }

  private normalizePercent(value: number | null | undefined): number {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.trunc(n)));
  }

  private parseDecimal(value: string | number | Prisma.Decimal | null | undefined, fallback = '0') {
    const raw = value == null ? fallback : String(value);
    return new Prisma.Decimal(raw);
  }

  private normalizeLines(lines: CreateContractLineDto[]) {
    return (lines || []).map((line) => {
      const unitPrice = this.parseDecimal(line.unit_price, '0');
      const quantity = this.parseDecimal(line.quantity, '1');
      const taxRate = this.parseDecimal(line.tax_rate, '0');
      const discountPercent = this.normalizePercent(line.discount_percent);

      if (unitPrice.isNegative() || quantity.isNegative()) {
        throw new BadRequestException('unit_price and quantity must be >= 0');
      }

      if (taxRate.isNegative() || taxRate.greaterThan(1)) {
        throw new BadRequestException('tax_rate must be between 0 and 1');
      }

      const lineSubtotal = unitPrice.mul(quantity);
      const lineDiscountAmount = lineSubtotal.mul(new Prisma.Decimal(discountPercent)).div(new Prisma.Decimal(100));
      const taxableBase = Prisma.Decimal.max(new Prisma.Decimal(0), lineSubtotal.sub(lineDiscountAmount));
      const taxAmount = taxableBase.mul(taxRate);
      const lineTotal = taxableBase.add(taxAmount);

      return {
        product_id: line.product_id,
        description: line.description,
        unit: line.unit,
        unit_price: unitPrice,
        quantity,
        tax_rate: taxRate,
        discount_percent: discountPercent,
        discount_amount: lineDiscountAmount,
        line_subtotal: lineSubtotal,
        tax_amount: taxAmount,
        line_total: lineTotal,
        start_at: line.start_at ? new Date(line.start_at) : null,
        end_at: line.end_at ? new Date(line.end_at) : null,
        billing_frequency: line.billing_frequency,
        is_recurring: line.is_recurring ?? true,
      };
    });
  }

  private computeTotals(
    lines: Array<{
      line_subtotal: Prisma.Decimal;
      tax_amount: Prisma.Decimal;
      discount_amount: Prisma.Decimal;
    }>,
    headerDiscountPercentRaw: number,
  ) {
    let subtotal = new Prisma.Decimal(0);
    let taxTotal = new Prisma.Decimal(0);
    let lineDiscountTotal = new Prisma.Decimal(0);

    for (const line of lines) {
      subtotal = subtotal.add(line.line_subtotal);
      taxTotal = taxTotal.add(line.tax_amount);
      lineDiscountTotal = lineDiscountTotal.add(line.discount_amount);
    }

    const headerDiscountPercent = this.normalizePercent(headerDiscountPercentRaw);
    const headerDiscountAmount = subtotal.mul(new Prisma.Decimal(headerDiscountPercent)).div(new Prisma.Decimal(100));
    const total = Prisma.Decimal.max(new Prisma.Decimal(0), subtotal.sub(lineDiscountTotal).sub(headerDiscountAmount).add(taxTotal));

    return {
      subtotal,
      taxTotal,
      headerDiscountPercent,
      headerDiscountAmount,
      total,
    };
  }
}
