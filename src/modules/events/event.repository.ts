import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { Prisma, events } from "@prisma/client";

type FindEventsFilter = {
  type?: number;
  related_table?: string;
  related_id?: string;
  process_id?: string;
  client_id?: string;
};

@Injectable()
export class EventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(filter: FindEventsFilter, tenantId: string): Promise<events[]> {
    const where: Prisma.eventsWhereInput = {
      tenant_id: tenantId,
    };

    if (Number.isFinite(filter.type)) {
      where.type = filter.type;
    }

    // Direct filters
    if (filter.related_table) where.related_table = filter.related_table;
    if (filter.related_id) where.related_id = filter.related_id;

    // Friendly aliases
    if (filter.process_id) {
      where.related_table = "processes";
      where.related_id = filter.process_id;
    }

    if (filter.client_id) {
      // "client" in the portal = company
      where.related_table = "companies";
      where.related_id = filter.client_id;
    }

    return this.prisma.events.findMany({
      where,
      orderBy: { created_at: "desc" },
    });
  }

  async findById(id: string, tenantId: string): Promise<events | null> {
    return this.prisma.events.findFirst({
      where: { id, tenant_id: tenantId } as any,
    });
  }

  async create(data: Prisma.eventsCreateInput, tenantId: string): Promise<events> {
    // IMPORTANT: set tenant explicitly (do not rely on middleware)
    return this.prisma.events.create({
      data: {
        ...(data as any),
        tenant_id: tenantId,
      },
    });
  }

  async updateById(
    id: string,
    data: Prisma.eventsUpdateManyMutationInput,
    tenantId: string
  ): Promise<events | null> {
    const result = await this.prisma.events.updateMany({
      where: { id, tenant_id: tenantId } as any,
      data: {
        ...(data as any),
        tenant_id: undefined, // never allow tenant change
        id: undefined,        // never allow id change
      },
    });

    if (!result || result.count === 0) return null;

    return this.findById(id, tenantId);
  }

  async deleteById(id: string, tenantId: string): Promise<boolean> {
    const result = await this.prisma.events.deleteMany({
      where: { id, tenant_id: tenantId } as any,
    });

    return !!result && result.count > 0;
  }
}
