import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class TransportTypesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // List all transport types (order by name)
  public async findMany() {
    return this.prisma.transport_types.findMany({
      orderBy: { name: "asc" },
    });
  }

  public async findById(id: string) {
    return this.prisma.transport_types.findUnique({
      where: { id },
    });
  }

  public async create(data: { name: string }) {
    return this.prisma.transport_types.create({
      data: { name: data.name },
    });
  }

  public async update(id: string, data: { name?: string }) {
    return this.prisma.transport_types.update({
      where: { id },
      data: {
        ...(data.name != null ? { name: data.name } : {}),
        // updated_at is handled by DB default in many setups; keep explicit if you want:
        // updated_at: new Date(),
      },
    });
  }

  public async delete(id: string) {
    return this.prisma.transport_types.delete({
      where: { id },
    });
  }
}