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

  async findMany(filter: FindEventsFilter): Promise<events[]> {
    const where: Prisma.eventsWhereInput = {};

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

  async findById(id: string): Promise<events | null> {
    return this.prisma.events.findUnique({ where: { id } });
  }

  async create(data: Prisma.eventsCreateInput): Promise<events> {
    return this.prisma.events.create({ data });
  }

  async updateById(id: string, data: Prisma.eventsUpdateInput): Promise<events> {
    return this.prisma.events.update({ where: { id }, data });
  }

  async deleteById(id: string): Promise<events> {
    return this.prisma.events.delete({ where: { id } });
  }
}