import { Injectable } from '@nestjs/common';
import { OpportunityStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OpportunitiesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: {
    tenantId: string;
    q?: string;
    status?: OpportunityStatus;
    companyId?: string;
    leadId?: string;
    ownerUserId?: string;
    fields?: string;
  }) {
    const q = String(params.q || '').trim();
    const fields = String(params.fields || '').trim().toLowerCase();

    if (fields === 'summary') {
      return this.prisma.opportunities.findMany({
        where: {
          tenant_id: params.tenantId,
          ...(params.status ? { status: params.status } : {}),
          ...(params.companyId ? { company_id: params.companyId } : {}),
          ...(params.leadId ? { lead_id: params.leadId } : {}),
          ...(params.ownerUserId ? { owner_user_id: params.ownerUserId } : {}),
          ...(q
            ? {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { description: { contains: q, mode: 'insensitive' } },
                  { company: { company_name: { contains: q, mode: 'insensitive' } } },
                ],
              }
            : {}),
        },
        orderBy: [{ created_at: 'desc' }],
        select: {
          id: true,
          name: true,
          status: true,
          currency_id: true,
          company_id: true,
          lead_id: true,
          currency: { select: { id: true, code: true, symbol: true, decimals: true } },
          company: { select: { id: true, company_name: true } },
          lead: { select: { id: true, name: true, company_name: true } },
        },
      });
    }

    if (fields === 'header') {
      return this.prisma.opportunities.findMany({
        where: {
          tenant_id: params.tenantId,
          ...(params.status ? { status: params.status } : {}),
          ...(params.companyId ? { company_id: params.companyId } : {}),
          ...(params.leadId ? { lead_id: params.leadId } : {}),
          ...(params.ownerUserId ? { owner_user_id: params.ownerUserId } : {}),
          ...(q
            ? {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { description: { contains: q, mode: 'insensitive' } },
                  { company: { company_name: { contains: q, mode: 'insensitive' } } },
                ],
              }
            : {}),
        },
        orderBy: [{ created_at: 'desc' }],
        select: {
          id: true,
          name: true,
          status: true,
          total: true,
          created_at: true,
          currency_id: true,
          company: { select: { id: true, company_name: true } },
          lead: { select: { id: true, name: true, company_name: true } },
          owner_user: { select: { id: true, full_name: true, email: true } },
          currency: { select: { id: true, code: true, symbol: true, decimals: true } },
        },
      });
    }

    return this.prisma.opportunities.findMany({
      where: {
        tenant_id: params.tenantId,
        ...(params.status ? { status: params.status } : {}),
        ...(params.companyId ? { company_id: params.companyId } : {}),
        ...(params.leadId ? { lead_id: params.leadId } : {}),
        ...(params.ownerUserId ? { owner_user_id: params.ownerUserId } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
                { company: { company_name: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }],
      include: {
        company: { select: { id: true, company_name: true } },
        lead: { select: { id: true, name: true, company_name: true } },
        owner_user: { select: { id: true, full_name: true, email: true } },
        currency: { select: { id: true, code: true, symbol: true } },
        converted_invoice: { select: { id: true, invoice_number: true, total: true, status: true } },
        _count: { select: { lines: true, approvals: true } },
      },
    });
  }

  async findById(tenantId: string, id: string) {
    return this.prisma.opportunities.findFirst({
      where: { tenant_id: tenantId, id },
      include: {
        lines: {
          orderBy: [{ line_number: 'asc' }],
          include: {
            product: {
              select: {
                id: true,
                name: true,
                product_code: true,
                default_unit_price: true,
                default_tax_rate: true,
              },
            },
          },
        },
        company: { select: { id: true, company_name: true } },
        lead: { select: { id: true, name: true, company_name: true, converted_company_id: true } },
        owner_user: { select: { id: true, full_name: true, email: true } },
        currency: { select: { id: true, code: true, symbol: true } },
        converted_invoice: { select: { id: true, invoice_number: true, total: true, status: true } },
      },
    });
  }

  async create(data: Prisma.opportunitiesCreateInput) {
    return this.prisma.opportunities.create({
      data,
      include: {
        lines: true,
        company: { select: { id: true, company_name: true } },
        lead: { select: { id: true, name: true } },
        owner_user: { select: { id: true, full_name: true, email: true } },
        currency: { select: { id: true, code: true, symbol: true } },
      },
    });
  }

  async update(id: string, tenantId: string, data: Prisma.opportunitiesUncheckedUpdateInput) {
    const result = await this.prisma.opportunities.updateMany({
      where: { id, tenant_id: tenantId },
      data,
    });

    if (!result || result.count === 0) return null;
    return this.findById(tenantId, id);
  }

  async remove(id: string, tenantId: string) {
    const existing = await this.findById(tenantId, id);
    if (!existing) return null;

    await this.prisma.opportunities.deleteMany({
      where: { id, tenant_id: tenantId },
    });

    return existing;
  }

  async replaceLines(params: {
    tenantId: string;
    opportunityId: string;
    lines: Prisma.opportunity_linesCreateManyInput[];
  }) {
    await this.prisma.opportunity_lines.deleteMany({
      where: {
        tenant_id: params.tenantId,
        opportunity_id: params.opportunityId,
      },
    });

    if (params.lines.length > 0) {
      await this.prisma.opportunity_lines.createMany({
        data: params.lines,
      });
    }

    return this.prisma.opportunity_lines.findMany({
      where: {
        tenant_id: params.tenantId,
        opportunity_id: params.opportunityId,
      },
      orderBy: [{ line_number: 'asc' }],
    });
  }

  async listEvents(tenantId: string, opportunityId: string) {
    return this.prisma.events.findMany({
      where: {
        tenant_id: tenantId,
        related_table: 'opportunities',
        related_id: opportunityId,
      },
      orderBy: [{ created_at: 'desc' }],
    });
  }

  async createSystemEvent(params: {
    tenantId: string;
    opportunityId: string;
    title: string;
    description?: string;
  }) {
    return this.prisma.events.create({
      data: {
        tenant_id: params.tenantId,
        related_table: 'opportunities',
        related_id: params.opportunityId,
        type: 8,
        title: params.title,
        description: params.description ?? null,
        start_time: new Date(),
        status: 1,
      },
    });
  }
}
