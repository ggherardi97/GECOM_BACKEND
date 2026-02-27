import { Injectable } from '@nestjs/common';
import { AutomationExecutionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type ListExecutionFilters = {
  status?: AutomationExecutionStatus;
  from?: Date;
  to?: Date;
  search?: string;
  limit?: number;
};

@Injectable()
export class AutomationExecutionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.automation_executionsUncheckedCreateInput) {
    return this.prisma.automation_executions.create({ data });
  }

  async listByAutomation(tenantId: string, automationId: string, filters?: ListExecutionFilters) {
    const limit = this.normalizeLimit(filters?.limit);
    const search = String(filters?.search || '').trim();

    return this.prisma.automation_executions.findMany({
      where: {
        tenant_id: tenantId,
        automation_id: automationId,
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.from || filters?.to
          ? {
              executed_at: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
        ...(search
          ? {
              error_message: { contains: search, mode: 'insensitive' },
            }
          : {}),
      },
      orderBy: [{ executed_at: 'desc' }],
      take: limit,
    });
  }

  private normalizeLimit(limit?: number): number {
    const parsed = Number(limit ?? 100);
    if (!Number.isFinite(parsed)) return 100;
    return Math.max(1, Math.min(500, Math.trunc(parsed)));
  }
}
