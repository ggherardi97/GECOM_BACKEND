import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateIncidentDto, UpdateIncidentDto } from './incidents.dto';
import { IncidentsRepository } from './incidents.repository';

@Injectable()
export class IncidentsService {
  constructor(private readonly repository: IncidentsRepository) {}

  list(tenantId: string) {
    return this.repository.findMany(tenantId);
  }

  async getById(tenantId: string, id: string) {
    const item = await this.repository.findById(tenantId, id);
    if (!item) throw new NotFoundException('Incidente não encontrado.');
    return item;
  }

  create(tenantId: string, dto: CreateIncidentDto) {
    return this.repository.create(tenantId, dto);
  }

  async update(tenantId: string, id: string, dto: UpdateIncidentDto) {
    await this.getById(tenantId, id);
    return this.repository.update(tenantId, id, dto);
  }

  async remove(tenantId: string, id: string) {
    await this.getById(tenantId, id);
    await this.repository.remove(tenantId, id);
  }
}
