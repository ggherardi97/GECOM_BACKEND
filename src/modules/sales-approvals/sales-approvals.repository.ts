import { Injectable } from '@nestjs/common';
import { Prisma, SalesApprovalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SalesApprovalsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: {
    tenantId: string;
    q?: string;
    status?: SalesApprovalStatus;
    entityType?: string;
  }) {
    const q = String(params.q || '').trim();

    return this.prisma.sales_approvals.findMany({
      where: {
        tenant_id: params.tenantId,
        ...(params.status ? { status: params.status } : {}),
        ...(params.entityType ? { entity_type: params.entityType as any } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }],
      include: {
        requested_by_user: { select: { id: true, full_name: true, email: true } },
        resolved_by_user: { select: { id: true, full_name: true, email: true } },
        opportunity: { select: { id: true, name: true } },
      },
    });
  }

  async findById(tenantId: string, id: string) {
    return this.prisma.sales_approvals.findFirst({
      where: { tenant_id: tenantId, id },
      include: {
        requested_by_user: { select: { id: true, full_name: true, email: true } },
        resolved_by_user: { select: { id: true, full_name: true, email: true } },
        opportunity: { select: { id: true, name: true } },
      },
    });
  }

  async create(data: Prisma.sales_approvalsCreateInput) {
    return this.prisma.sales_approvals.create({
      data,
      include: {
        requested_by_user: { select: { id: true, full_name: true, email: true } },
        resolved_by_user: { select: { id: true, full_name: true, email: true } },
      },
    });
  }

  async update(id: string, tenantId: string, data: Prisma.sales_approvalsUncheckedUpdateInput) {
    const result = await this.prisma.sales_approvals.updateMany({
      where: { id, tenant_id: tenantId },
      data,
    });

    if (!result || result.count === 0) return null;
    return this.findById(tenantId, id);
  }

  async remove(id: string, tenantId: string) {
    const existing = await this.findById(tenantId, id);
    if (!existing) return null;

    await this.prisma.sales_approvals.deleteMany({
      where: { id, tenant_id: tenantId },
    });

    return existing;
  }
}
