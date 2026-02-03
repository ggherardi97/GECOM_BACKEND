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

  async findMany(filter: FindTransportsFilter): Promise<transports[]> {
    const where: Prisma.transportsWhereInput = {};

    if (filter.process_id) where.process_id = filter.process_id;
    if (filter.transport_type_id) where.transport_type_id = filter.transport_type_id;
    if (filter.transport_status_id) where.transport_status_id = filter.transport_status_id;

    return this.prisma.transports.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });
  }

  async findById(id: string): Promise<transports | null> {
    return this.prisma.transports.findUnique({ where: { id } });
  }

  async create(data: Prisma.transportsCreateInput): Promise<transports> {
    return this.prisma.transports.create({ data });
  }

  async updateById(id: string, data: Prisma.transportsUpdateInput): Promise<transports> {
    return this.prisma.transports.update({ where: { id }, data });
  }

  async deleteById(id: string): Promise<transports> {
    return this.prisma.transports.delete({ where: { id } });
  }

  async findAllTransportTypes() {
    return this.prisma.transport_types.findMany({ orderBy: { name: 'asc' } });
  }
}
