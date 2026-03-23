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
    const whereClauses: Prisma.Sql[] = [
      Prisma.sql`"tenant_id" = CAST(${tenantId} AS uuid)`,
      Prisma.sql`"automation_id" = CAST(${automationId} AS uuid)`,
    ];

    if (filters?.status) {
      whereClauses.push(Prisma.sql`"status" = ${filters.status}::"AutomationExecutionStatus"`);
    }

    if (filters?.from) {
      whereClauses.push(Prisma.sql`"executed_at" >= ${filters.from}`);
    }

    if (filters?.to) {
      whereClauses.push(Prisma.sql`"executed_at" <= ${filters.to}`);
    }

    if (search) {
      const pattern = `%${search}%`;
      whereClauses.push(Prisma.sql`(
        COALESCE("error_message", '') ILIKE ${pattern}
        OR CAST(COALESCE("input_payload", '{}'::jsonb) AS TEXT) ILIKE ${pattern}
        OR CAST(COALESCE("output_payload", '{}'::jsonb) AS TEXT) ILIKE ${pattern}
      )`);
    }

    return this.prisma.raw.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
        "id",
        "tenant_id",
        "automation_id",
        "status",
        "input_payload",
        "output_payload",
        "error_message",
        "executed_at"
      FROM "automation_executions"
      WHERE ${Prisma.join(whereClauses, ' AND ')}
      ORDER BY "executed_at" DESC
      LIMIT ${limit}
    `);
  }

  private normalizeLimit(limit?: number): number {
    const parsed = Number(limit ?? 100);
    if (!Number.isFinite(parsed)) return 100;
    return Math.max(1, Math.min(500, Math.trunc(parsed)));
  }
}
