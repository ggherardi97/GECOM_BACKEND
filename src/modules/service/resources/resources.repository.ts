import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAppointmentDto, CreateResourceDto, UpdateAppointmentDto, UpdateResourceDto } from './resources.dto';

@Injectable()
export class ResourcesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findResources(tenantId: string) {
    return this.prisma.service_resources.findMany({ where: { tenant_id: tenantId }, include: { user: true, calendar: true }, orderBy: { name: 'asc' } });
  }

  findResourceById(tenantId: string, id: string) {
    return this.prisma.service_resources.findFirst({ where: { tenant_id: tenantId, id }, include: { user: true, calendar: true, appointments: true } });
  }

  createResource(tenantId: string, data: CreateResourceDto) {
    return this.prisma.service_resources.create({ data: { tenant_id: tenantId, ...data } as any });
  }

  async updateResource(tenantId: string, id: string, data: UpdateResourceDto) {
    await this.prisma.service_resources.updateMany({ where: { tenant_id: tenantId, id }, data: { ...data, updated_at: new Date() } as any });
    return this.findResourceById(tenantId, id);
  }

  removeResource(tenantId: string, id: string) {
    return this.prisma.service_resources.deleteMany({ where: { tenant_id: tenantId, id } });
  }

  findAppointments(tenantId: string) {
    return this.prisma.service_appointments.findMany({ where: { tenant_id: tenantId }, include: { resource: true, incident: true }, orderBy: { start_at: 'asc' } });
  }

  findAppointmentById(tenantId: string, id: string) {
    return this.prisma.service_appointments.findFirst({ where: { tenant_id: tenantId, id }, include: { resource: true, incident: true } });
  }

  createAppointment(tenantId: string, data: CreateAppointmentDto) {
    return this.prisma.service_appointments.create({
      data: {
        tenant_id: tenantId,
        ...data,
        start_at: new Date(data.start_at),
        end_at: new Date(data.end_at),
      },
    });
  }

  async updateAppointment(tenantId: string, id: string, data: UpdateAppointmentDto) {
    await this.prisma.service_appointments.updateMany({
      where: { tenant_id: tenantId, id },
      data: {
        ...data,
        start_at: data.start_at ? new Date(data.start_at) : undefined,
        end_at: data.end_at ? new Date(data.end_at) : undefined,
        updated_at: new Date(),
      },
    });
    return this.findAppointmentById(tenantId, id);
  }

  removeAppointment(tenantId: string, id: string) {
    return this.prisma.service_appointments.deleteMany({ where: { tenant_id: tenantId, id } });
  }
}
