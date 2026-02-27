import { Injectable } from '@nestjs/common';
import { Prisma, automations } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AutomationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    return this.prisma.automations.findMany({
      where: { tenant_id: tenantId },
      orderBy: [{ created_at: 'desc' }],
      include: {
        executions: {
          orderBy: [{ executed_at: 'desc' }],
          take: 1,
        },
      },
    });
  }

  async findById(tenantId: string, id: string) {
    return this.prisma.automations.findFirst({
      where: { tenant_id: tenantId, id },
      include: {
        executions: {
          orderBy: [{ executed_at: 'desc' }],
          take: 1,
        },
      },
    });
  }

  async findEntityActive(tenantId: string, entityName: string): Promise<automations[]> {
    return this.prisma.automations.findMany({
      where: {
        tenant_id: tenantId,
        entity_name: entityName,
        is_active: true,
      },
      orderBy: [{ created_at: 'asc' }],
    });
  }

  async create(data: Prisma.automationsCreateInput) {
    return this.prisma.automations.create({ data });
  }

  async update(id: string, tenantId: string, data: Prisma.automationsUncheckedUpdateInput) {
    const updated = await this.prisma.automations.updateMany({
      where: { id, tenant_id: tenantId },
      data,
    });

    if (updated.count === 0) return null;
    return this.findById(tenantId, id);
  }
}

