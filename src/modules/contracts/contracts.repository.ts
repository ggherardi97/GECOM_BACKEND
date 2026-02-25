import { ContractStatus, Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ContractsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: {
    tenantId: string;
    q?: string;
    status?: ContractStatus;
    companyId?: string;
    ownerUserId?: string;
    fields?: string;
  }) {
    const q = String(params.q || '').trim();
    const fields = String(params.fields || '').trim().toLowerCase();

    if (fields === 'summary') {
      return this.prisma.contracts.findMany({
        where: {
          tenant_id: params.tenantId,
          ...(params.status ? { status: params.status } : {}),
          ...(params.companyId ? { company_id: params.companyId } : {}),
          ...(params.ownerUserId ? { owner_user_id: params.ownerUserId } : {}),
          ...(q
            ? {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { contract_number: { contains: q, mode: 'insensitive' } },
                  { company: { company_name: { contains: q, mode: 'insensitive' } } },
                ],
              }
            : {}),
        },
        orderBy: [{ created_at: 'desc' }],
        select: {
          id: true,
          contract_number: true,
          name: true,
          status: true,
          currency_id: true,
          company_id: true,
          currency: { select: { id: true, code: true, symbol: true, decimals: true } },
          company: { select: { id: true, company_name: true } },
        },
      });
    }

    if (fields === 'header') {
      return this.prisma.contracts.findMany({
        where: {
          tenant_id: params.tenantId,
          ...(params.status ? { status: params.status } : {}),
          ...(params.companyId ? { company_id: params.companyId } : {}),
          ...(params.ownerUserId ? { owner_user_id: params.ownerUserId } : {}),
          ...(q
            ? {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { contract_number: { contains: q, mode: 'insensitive' } },
                  { company: { company_name: { contains: q, mode: 'insensitive' } } },
                ],
              }
            : {}),
        },
        orderBy: [{ created_at: 'desc' }],
        select: {
          id: true,
          contract_number: true,
          name: true,
          status: true,
          total: true,
          currency_id: true,
          company: { select: { id: true, company_name: true } },
          owner_user: { select: { id: true, full_name: true, email: true } },
          currency: { select: { id: true, code: true, symbol: true, decimals: true } },
        },
      });
    }

    return this.prisma.contracts.findMany({
      where: {
        tenant_id: params.tenantId,
        ...(params.status ? { status: params.status } : {}),
        ...(params.companyId ? { company_id: params.companyId } : {}),
        ...(params.ownerUserId ? { owner_user_id: params.ownerUserId } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { contract_number: { contains: q, mode: 'insensitive' } },
                { company: { company_name: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }],
      include: {
        company: { select: { id: true, company_name: true } },
        owner_user: { select: { id: true, full_name: true, email: true } },
        currency: { select: { id: true, code: true, symbol: true } },
        opportunity: { select: { id: true, name: true } },
        _count: { select: { lines: true, invoices: true } },
      },
    });
  }

  async findById(tenantId: string, id: string) {
    return this.prisma.contracts.findFirst({
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
        owner_user: { select: { id: true, full_name: true, email: true } },
        currency: { select: { id: true, code: true, symbol: true } },
        lead: { select: { id: true, name: true } },
        opportunity: { select: { id: true, name: true } },
        price_table: { select: { id: true, name: true } },
        invoices: {
          orderBy: [{ created_at: 'desc' }],
          include: {
            invoice: { select: { id: true, invoice_number: true, total: true, status: true, due_at: true } },
          },
        },
      },
    });
  }

  async create(data: Prisma.contractsCreateInput) {
    return this.prisma.contracts.create({
      data,
      include: {
        lines: true,
        company: { select: { id: true, company_name: true } },
        owner_user: { select: { id: true, full_name: true, email: true } },
        currency: { select: { id: true, code: true, symbol: true } },
      },
    });
  }

  async update(id: string, tenantId: string, data: Prisma.contractsUncheckedUpdateInput) {
    const result = await this.prisma.contracts.updateMany({
      where: { id, tenant_id: tenantId },
      data,
    });

    if (!result || result.count === 0) return null;
    return this.findById(tenantId, id);
  }

  async remove(id: string, tenantId: string) {
    const existing = await this.findById(tenantId, id);
    if (!existing) return null;

    await this.prisma.contracts.deleteMany({
      where: { id, tenant_id: tenantId },
    });

    return existing;
  }

  async replaceLines(params: {
    tenantId: string;
    contractId: string;
    lines: Prisma.contract_linesCreateManyInput[];
  }) {
    await this.prisma.contract_lines.deleteMany({
      where: {
        tenant_id: params.tenantId,
        contract_id: params.contractId,
      },
    });

    if (params.lines.length > 0) {
      await this.prisma.contract_lines.createMany({ data: params.lines });
    }

    return this.prisma.contract_lines.findMany({
      where: {
        tenant_id: params.tenantId,
        contract_id: params.contractId,
      },
      orderBy: [{ line_number: 'asc' }],
    });
  }
}
