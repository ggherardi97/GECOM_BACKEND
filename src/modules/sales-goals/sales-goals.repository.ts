import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SalesGoalsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listGoals(tenantId: string, ownerUserId?: string) {
    return this.prisma.sales_goals.findMany({
      where: {
        tenant_id: tenantId,
        ...(ownerUserId ? { owner_user_id: ownerUserId } : {}),
      },
      orderBy: [{ period_start: 'desc' }],
      include: {
        owner_user: { select: { id: true, full_name: true, email: true } },
        currency: { select: { id: true, code: true, symbol: true } },
        _count: { select: { commissions: true } },
      },
    });
  }

  async findGoalById(tenantId: string, id: string) {
    return this.prisma.sales_goals.findFirst({
      where: { tenant_id: tenantId, id },
      include: {
        owner_user: { select: { id: true, full_name: true, email: true } },
        currency: { select: { id: true, code: true, symbol: true } },
        commissions: {
          orderBy: [{ created_at: 'desc' }],
          include: {
            owner_user: { select: { id: true, full_name: true, email: true } },
          },
        },
      },
    });
  }

  async createGoal(data: Prisma.sales_goalsCreateInput) {
    return this.prisma.sales_goals.create({
      data,
      include: {
        owner_user: { select: { id: true, full_name: true, email: true } },
        currency: { select: { id: true, code: true, symbol: true } },
      },
    });
  }

  async updateGoal(id: string, tenantId: string, data: Prisma.sales_goalsUncheckedUpdateInput) {
    const result = await this.prisma.sales_goals.updateMany({
      where: { id, tenant_id: tenantId },
      data,
    });

    if (!result || result.count === 0) return null;
    return this.findGoalById(tenantId, id);
  }

  async removeGoal(id: string, tenantId: string) {
    const existing = await this.findGoalById(tenantId, id);
    if (!existing) return null;

    await this.prisma.sales_goals.deleteMany({
      where: { id, tenant_id: tenantId },
    });

    return existing;
  }

  async listCommissions(tenantId: string, ownerUserId?: string, goalId?: string) {
    return this.prisma.sales_commissions.findMany({
      where: {
        tenant_id: tenantId,
        ...(ownerUserId ? { owner_user_id: ownerUserId } : {}),
        ...(goalId ? { sales_goal_id: goalId } : {}),
      },
      orderBy: [{ created_at: 'desc' }],
      include: {
        owner_user: { select: { id: true, full_name: true, email: true } },
        sales_goal: {
          select: {
            id: true,
            period_type: true,
            period_start: true,
            period_end: true,
          },
        },
      },
    });
  }

  async findCommissionById(tenantId: string, id: string) {
    return this.prisma.sales_commissions.findFirst({
      where: { tenant_id: tenantId, id },
      include: {
        owner_user: { select: { id: true, full_name: true, email: true } },
        sales_goal: {
          select: {
            id: true,
            period_type: true,
            period_start: true,
            period_end: true,
          },
        },
      },
    });
  }

  async createCommission(data: Prisma.sales_commissionsCreateInput) {
    return this.prisma.sales_commissions.create({
      data,
      include: {
        owner_user: { select: { id: true, full_name: true, email: true } },
      },
    });
  }

  async updateCommission(id: string, tenantId: string, data: Prisma.sales_commissionsUncheckedUpdateInput) {
    const result = await this.prisma.sales_commissions.updateMany({
      where: { id, tenant_id: tenantId },
      data,
    });

    if (!result || result.count === 0) return null;
    return this.findCommissionById(tenantId, id);
  }

  async removeCommission(id: string, tenantId: string) {
    const existing = await this.findCommissionById(tenantId, id);
    if (!existing) return null;

    await this.prisma.sales_commissions.deleteMany({
      where: { id, tenant_id: tenantId },
    });

    return existing;
  }
}
