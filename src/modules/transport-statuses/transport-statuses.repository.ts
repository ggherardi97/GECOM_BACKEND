import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class TransportStatusesRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findMany() {
    return this.prisma.transport_statuses.findMany({
      orderBy: { name: "asc" },
    });
  }

  public async findById(id: string) {
    return this.prisma.transport_statuses.findUnique({
      where: { id },
    });
  }

  public async create(data: { name: string }) {
    return this.prisma.transport_statuses.create({
      data: { name: data.name },
    });
  }

  public async update(id: string, data: { name?: string }) {
    return this.prisma.transport_statuses.update({
      where: { id },
      data: {
        ...(data.name != null ? { name: data.name } : {}),
        // updated_at can be handled by DB or explicitly set:
        // updated_at: new Date(),
      },
    });
  }

  public async delete(id: string) {
    return this.prisma.transport_statuses.delete({
      where: { id },
    });
  }
}