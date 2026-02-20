import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateIncidentDto, UpdateIncidentDto } from './incidents.dto';

@Injectable()
export class IncidentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(tenantId: string) {
    return this.prisma.incidents.findMany({
      where: { tenant_id: tenantId },
      include: {
        company: true,
        queue: true,
        subject: true,
        asset: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.incidents.findFirst({
      where: { tenant_id: tenantId, id },
      include: {
        company: true,
        queue: true,
        subject: true,
        asset: true,
        tasks: true,
        sla_events: true,
      },
    });
  }

  create(tenantId: string, data: CreateIncidentDto) {
    return this.prisma.incidents.create({
      data: {
        tenant_id: tenantId,
        ...data,
        due_at: data.due_at ? new Date(data.due_at) : null,
        resolved_at: data.resolved_at ? new Date(data.resolved_at) : null,
        closed_at: data.closed_at ? new Date(data.closed_at) : null,
      },
    });
  }

  async update(tenantId: string, id: string, data: UpdateIncidentDto) {
    await this.prisma.incidents.updateMany({
      where: { tenant_id: tenantId, id },
      data: {
        ...data,
        due_at: data.due_at ? new Date(data.due_at) : undefined,
        resolved_at: data.resolved_at ? new Date(data.resolved_at) : undefined,
        closed_at: data.closed_at ? new Date(data.closed_at) : undefined,
        updated_at: new Date(),
      },
    });

    return this.findById(tenantId, id);
  }

  remove(tenantId: string, id: string) {
    return this.prisma.incidents.deleteMany({
      where: { tenant_id: tenantId, id },
    });
  }
}
