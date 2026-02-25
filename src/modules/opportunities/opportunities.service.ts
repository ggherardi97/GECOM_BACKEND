import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OpportunityStatus, Prisma } from '@prisma/client';
import { OpportunitiesRepository } from './opportunities.repository';
import { CreateOpportunityDto, CreateOpportunityLineDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { ConvertOpportunityToInvoiceDto } from './dto/convert-opportunity-to-invoice.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { StatusConfigService } from '../status-config/status-config.service';

type AuthUser = {
  id: string;
  tenant_id: string;
};

@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly repository: OpportunitiesRepository,
    private readonly prisma: PrismaService,
    private readonly statusConfigService: StatusConfigService,
  ) {}

  async list(user: AuthUser, query: { q?: string; status?: string; company_id?: string; lead_id?: string; owner_user_id?: string; fields?: string }) {
    const rawStatus = String(query.status || '').trim().toUpperCase();
    const status = rawStatus && rawStatus in OpportunityStatus ? (rawStatus as OpportunityStatus) : undefined;
    const fields = String(query.fields || '').trim().toLowerCase();

    return this.repository.list({
      tenantId: user.tenant_id,
      q: query.q,
      status,
      companyId: query.company_id,
      leadId: query.lead_id,
      ownerUserId: query.owner_user_id,
      fields,
    });
  }

  async findById(user: AuthUser, id: string) {
    const found = await this.repository.findById(user.tenant_id, id);
    if (!found) throw new NotFoundException('Opportunity not found');
    return found;
  }

  async create(user: AuthUser, dto: CreateOpportunityDto) {
    const ownerUserId = dto.owner_user_id || user.id;

    const lines = this.normalizeLines(dto.lines || []);
    const totals = this.computeTotals(lines, dto.discount_percent ?? 0);

    const created = await this.repository.create({
      tenant_id: user.tenant_id,
      name: dto.name,
      description: dto.description ?? null,
      status: dto.status ?? OpportunityStatus.OPEN,
      expected_close_at: dto.expected_close_at ? new Date(dto.expected_close_at) : null,
      probability_percent: dto.probability_percent ?? 0,
      subtotal: totals.subtotal,
      discount_percent: totals.headerDiscountPercent,
      discount_amount: totals.headerDiscountAmount,
      tax_total: totals.taxTotal,
      total: totals.total,
      owner_user: { connect: { id: ownerUserId } },
      ...(dto.company_id ? { company: { connect: { id: dto.company_id } } } : {}),
      ...(dto.lead_id ? { lead: { connect: { id: dto.lead_id } } } : {}),
      ...(dto.currency_id ? { currency: { connect: { id: dto.currency_id } } } : {}),
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
              })),
            },
          }
        : {}),
    });

    await this.repository.createSystemEvent({
      tenantId: user.tenant_id,
      opportunityId: created.id,
      title: 'Oportunidade criada',
      description: `Oportunidade ${created.name} criada por ${user.id}`,
    });

    return this.findById(user, created.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateOpportunityDto) {
    const existing = await this.repository.findById(user.tenant_id, id);
    if (!existing) throw new NotFoundException('Opportunity not found');

    const patch: Prisma.opportunitiesUncheckedUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.company_id !== undefined ? { company_id: dto.company_id ?? null } : {}),
      ...(dto.lead_id !== undefined ? { lead_id: dto.lead_id ?? null } : {}),
      ...(dto.owner_user_id !== undefined ? { owner_user_id: dto.owner_user_id } : {}),
      ...(dto.currency_id !== undefined ? { currency_id: dto.currency_id ?? null } : {}),
      ...(dto.expected_close_at !== undefined ? { expected_close_at: dto.expected_close_at ? new Date(dto.expected_close_at) : null } : {}),
      ...(dto.probability_percent !== undefined ? { probability_percent: this.normalizePercent(dto.probability_percent) } : {}),
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
      if (!updated) throw new NotFoundException('Opportunity not found');

      await this.repository.replaceLines({
        tenantId: user.tenant_id,
        opportunityId: id,
        lines: lines.map((line, index) => ({
          tenant_id: user.tenant_id,
          opportunity_id: id,
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
        })),
      });

      return this.findById(user, id);
    }

    if (dto.discount_percent !== undefined) {
      patch.discount_percent = this.normalizePercent(dto.discount_percent);
    }

    const updated = await this.repository.update(id, user.tenant_id, patch);
    if (!updated) throw new NotFoundException('Opportunity not found');
    return updated;
  }

  async remove(user: AuthUser, id: string) {
    const removed = await this.repository.remove(id, user.tenant_id);
    if (!removed) throw new NotFoundException('Opportunity not found');
    return removed;
  }

  async listTimeline(user: AuthUser, id: string) {
    const existing = await this.repository.findById(user.tenant_id, id);
    if (!existing) throw new NotFoundException('Opportunity not found');
    return this.repository.listEvents(user.tenant_id, id);
  }

  async addTimelineEvent(user: AuthUser, id: string, input: { title?: string; description?: string }) {
    const existing = await this.repository.findById(user.tenant_id, id);
    if (!existing) throw new NotFoundException('Opportunity not found');

    const title = String(input?.title || '').trim();
    if (!title) throw new BadRequestException('title is required');

    return this.prisma.events.create({
      data: {
        tenant_id: user.tenant_id,
        related_table: 'opportunities',
        related_id: id,
        type: 0,
        title,
        description: input?.description ? String(input.description) : null,
        start_time: new Date(),
        status: 1,
      },
    });
  }

  async convertToInvoice(user: AuthUser, id: string, dto: ConvertOpportunityToInvoiceDto) {
    const opportunity = await this.repository.findById(user.tenant_id, id);
    if (!opportunity) throw new NotFoundException('Opportunity not found');

    if (opportunity.converted_invoice_id && !dto.force_new) {
      throw new BadRequestException('Opportunity already converted to invoice. Use force_new=true to create another.');
    }

    const companyId = dto.company_id || opportunity.company_id || opportunity.lead?.converted_company_id || null;
    if (!companyId) {
      throw new BadRequestException('Company is required to convert opportunity into invoice. Set company_id first.');
    }

    const currencyId = dto.currency_id || opportunity.currency_id;
    if (!currencyId) {
      throw new BadRequestException('Currency is required to convert opportunity into invoice. Set currency_id first.');
    }

    const lines = Array.isArray(opportunity.lines) ? opportunity.lines : [];
    if (!lines.length) {
      throw new BadRequestException('Opportunity must have at least one product line before conversion.');
    }

    const resolvedInvoiceStatus = await this.statusConfigService.resolveInvoiceStatus(user.tenant_id, { status: '0' });

    const createdInvoice = await this.prisma.invoices.create({
      data: {
        tenant_id: user.tenant_id,
        invoice_number: '',
        company_id: companyId,
        currency_id: currencyId,
        status: resolvedInvoiceStatus.status,
        status_config_id: resolvedInvoiceStatus.statusConfig.id,
        quote_at: dto.quote_at ? new Date(dto.quote_at) : new Date(),
        due_at: dto.due_at ? new Date(dto.due_at) : null,
        discount_percent: this.normalizePercent(opportunity.discount_percent),
        discount_amount: opportunity.discount_amount,
        subtotal: opportunity.subtotal,
        tax_total: opportunity.tax_total,
        total: opportunity.total,
        notes: opportunity.description || null,
        terms: null,
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
        companies: { select: { id: true, company_name: true } },
      },
    });

    await this.repository.update(id, user.tenant_id, {
      status: OpportunityStatus.PROPOSAL,
      converted_invoice_id: createdInvoice.id,
      converted_at: new Date(),
      updated_at: new Date(),
    });

    await this.repository.createSystemEvent({
      tenantId: user.tenant_id,
      opportunityId: id,
      title: 'Oportunidade convertida em proposta',
      description: `Invoice ${createdInvoice.invoice_number || createdInvoice.id} gerada a partir da oportunidade.`,
    });

    return {
      ok: true,
      opportunity_id: id,
      invoice_id: createdInvoice.id,
      invoice: {
        id: createdInvoice.id,
        invoice_number: createdInvoice.invoice_number || null,
      },
    };
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

  private normalizeLines(lines: CreateOpportunityLineDto[]) {
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
      };
    });
  }

  private computeTotals(
    lines: Array<{
      line_subtotal: Prisma.Decimal;
      tax_amount: Prisma.Decimal;
      discount_amount: Prisma.Decimal;
      line_total: Prisma.Decimal;
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
