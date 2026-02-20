import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateAppointmentDto, CreateResourceDto, UpdateAppointmentDto, UpdateResourceDto } from './resources.dto';
import { ResourcesRepository } from './resources.repository';

@Injectable()
export class ResourcesService {
  constructor(private readonly repository: ResourcesRepository) {}

  listResources(tenantId: string) {
    return this.repository.findResources(tenantId);
  }

  async getResource(tenantId: string, id: string) {
    const row = await this.repository.findResourceById(tenantId, id);
    if (!row) throw new NotFoundException('Recurso não encontrado.');
    return row;
  }

  createResource(tenantId: string, dto: CreateResourceDto) {
    return this.repository.createResource(tenantId, dto);
  }

  async updateResource(tenantId: string, id: string, dto: UpdateResourceDto) {
    await this.getResource(tenantId, id);
    return this.repository.updateResource(tenantId, id, dto);
  }

  async removeResource(tenantId: string, id: string) {
    await this.getResource(tenantId, id);
    await this.repository.removeResource(tenantId, id);
  }

  listAppointments(tenantId: string) {
    return this.repository.findAppointments(tenantId);
  }

  async getAppointment(tenantId: string, id: string) {
    const row = await this.repository.findAppointmentById(tenantId, id);
    if (!row) throw new NotFoundException('Agendamento não encontrado.');
    return row;
  }

  createAppointment(tenantId: string, dto: CreateAppointmentDto) {
    return this.repository.createAppointment(tenantId, dto);
  }

  async updateAppointment(tenantId: string, id: string, dto: UpdateAppointmentDto) {
    await this.getAppointment(tenantId, id);
    return this.repository.updateAppointment(tenantId, id, dto);
  }

  async removeAppointment(tenantId: string, id: string) {
    await this.getAppointment(tenantId, id);
    await this.repository.removeAppointment(tenantId, id);
  }
}
