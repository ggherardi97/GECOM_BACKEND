import { Injectable } from '@nestjs/common';
import { Prisma, transports } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type FindTransportsFilter = {
  process_id?: string;
  transport_type_id?: string;
  transport_status_id?: string;
};

@Injectable()
export class TransportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(filter: FindTransportsFilter, tenantId: string, companyId?: string): Promise<transports[]> {
    const where: Prisma.transportsWhereInput = {
      tenant_id: tenantId,
    };

    if (filter.process_id) where.process_id = filter.process_id;
    if (filter.transport_type_id) where.transport_type_id = filter.transport_type_id;
    if (filter.transport_status_id) where.transport_status_id = filter.transport_status_id;

    // Non-admin scope: only transports from processes in the user's company (and same tenant)
    if (companyId) {
      where.processes = {
        tenant_id: tenantId,
        company_id: companyId,
      } as any;
    }

    return this.prisma.transports.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });
  }

  async findById(id: string, tenantId: string): Promise<any | null> {
    // Include process.company_id so service can enforce non-admin access
    return this.prisma.transports.findFirst({
      where: { id, tenant_id: tenantId } as any,
      include: {
        processes: {
          select: {
            id: true,
            company_id: true,
          },
        },
      },
    }).then((row) => {
      if (!row) return null;

      // Flatten company_id for easy checks
      return {
        ...(row as any),
        process_company_id: (row as any)?.processes?.company_id ?? null,
      };
    });
  }

  async isProcessInCompany(processId: string, tenantId: string, companyId: string): Promise<boolean> {
    const found = await this.prisma.processes.findFirst({
      where: { id: processId, tenant_id: tenantId, company_id: companyId, deleted_at: null } as any,
      select: { id: true },
    });

    return !!found;
  }

  async create(data: Prisma.transportsCreateInput, tenantId: string): Promise<transports> {
    // IMPORTANT: ensure tenant_id is set explicitly (createMany usually bypasses middleware, create depends on your middleware)
    return this.prisma.transports.create({
      data: {
        ...(data as any),
        tenant_id: tenantId,
      },
    });
  }

  async updateById(id: string, tenantId: string, data: Prisma.transportsUncheckedUpdateInput): Promise<transports | null> {
    // IMPORTANT: updateMany allows filtering by tenant_id (and avoids needing composite unique)
    const result = await this.prisma.transports.updateMany({
      where: { id, tenant_id: tenantId } as any,
      data: {
        ...(data as any),
        tenant_id: undefined, // never allow tenant change
        id: undefined,        // never allow id change
        updated_at: new Date(),
      },
    });

    if (!result || result.count === 0) return null;

    // Return updated record
    const updated = await this.prisma.transports.findFirst({
      where: { id, tenant_id: tenantId } as any,
    });

    return updated;
  }

  async deleteById(id: string, tenantId: string): Promise<boolean> {
    const result = await this.prisma.transports.deleteMany({
      where: { id, tenant_id: tenantId } as any,
    });

    return !!result && result.count > 0;
  }

  async findAllTransportTypes() {
    return this.prisma.transport_types.findMany({ orderBy: { name: 'asc' } });
  }
}
