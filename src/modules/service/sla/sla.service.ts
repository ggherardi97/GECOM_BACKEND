import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CreateSlaEventDto,
  CreateSlaInstanceDto,
  CreateSlaInstanceKpiDto,
  CreateSlaKpiDto,
  CreateSlaPolicyDto,
  UpdateSlaEventDto,
  UpdateSlaInstanceDto,
  UpdateSlaInstanceKpiDto,
  UpdateSlaKpiDto,
  UpdateSlaPolicyDto,
} from './sla.dto';
import { SlaRepository } from './sla.repository';

@Injectable()
export class SlaService {
  constructor(private readonly repository: SlaRepository) {}

  listPolicies(tenantId: string) {
    return this.repository.listPolicies(tenantId);
  }

  async getPolicy(tenantId: string, id: string) {
    const row = await this.repository.getPolicy(tenantId, id);
    if (!row) throw new NotFoundException('Política de SLA não encontrada.');
    return row;
  }

  createPolicy(tenantId: string, dto: CreateSlaPolicyDto) {
    return this.repository.createPolicy(tenantId, dto);
  }

  async updatePolicy(tenantId: string, id: string, dto: UpdateSlaPolicyDto) {
    await this.getPolicy(tenantId, id);
    return this.repository.updatePolicy(tenantId, id, dto);
  }

  async removePolicy(tenantId: string, id: string) {
    await this.getPolicy(tenantId, id);
    await this.repository.removePolicy(tenantId, id);
  }

  listKpis(tenantId: string) {
    return this.repository.listKpis(tenantId);
  }

  async getKpi(tenantId: string, id: string) {
    const row = await this.repository.getKpi(tenantId, id);
    if (!row) throw new NotFoundException('KPI de SLA não encontrado.');
    return row;
  }

  createKpi(tenantId: string, dto: CreateSlaKpiDto) {
    return this.repository.createKpi(tenantId, dto);
  }

  async updateKpi(tenantId: string, id: string, dto: UpdateSlaKpiDto) {
    await this.getKpi(tenantId, id);
    return this.repository.updateKpi(tenantId, id, dto);
  }

  async removeKpi(tenantId: string, id: string) {
    await this.getKpi(tenantId, id);
    await this.repository.removeKpi(tenantId, id);
  }

  listInstances(tenantId: string) {
    return this.repository.listInstances(tenantId);
  }

  async getInstance(tenantId: string, id: string) {
    const row = await this.repository.getInstance(tenantId, id);
    if (!row) throw new NotFoundException('Instância de SLA não encontrada.');
    return row;
  }

  createInstance(tenantId: string, dto: CreateSlaInstanceDto) {
    return this.repository.createInstance(tenantId, dto);
  }

  async updateInstance(tenantId: string, id: string, dto: UpdateSlaInstanceDto) {
    await this.getInstance(tenantId, id);
    return this.repository.updateInstance(tenantId, id, dto);
  }

  async removeInstance(tenantId: string, id: string) {
    await this.getInstance(tenantId, id);
    await this.repository.removeInstance(tenantId, id);
  }

  listInstanceKpis(tenantId: string) {
    return this.repository.listInstanceKpis(tenantId);
  }

  async getInstanceKpi(tenantId: string, id: string) {
    const row = await this.repository.getInstanceKpi(tenantId, id);
    if (!row) throw new NotFoundException('KPI da instância de SLA não encontrado.');
    return row;
  }

  createInstanceKpi(tenantId: string, dto: CreateSlaInstanceKpiDto) {
    return this.repository.createInstanceKpi(tenantId, dto);
  }

  async updateInstanceKpi(tenantId: string, id: string, dto: UpdateSlaInstanceKpiDto) {
    await this.getInstanceKpi(tenantId, id);
    return this.repository.updateInstanceKpi(tenantId, id, dto);
  }

  async removeInstanceKpi(tenantId: string, id: string) {
    await this.getInstanceKpi(tenantId, id);
    await this.repository.removeInstanceKpi(tenantId, id);
  }

  listEvents(tenantId: string) {
    return this.repository.listEvents(tenantId);
  }

  async getEvent(tenantId: string, id: string) {
    const row = await this.repository.getEvent(tenantId, id);
    if (!row) throw new NotFoundException('Evento de SLA não encontrado.');
    return row;
  }

  createEvent(tenantId: string, dto: CreateSlaEventDto) {
    return this.repository.createEvent(tenantId, dto);
  }

  async updateEvent(tenantId: string, id: string, dto: UpdateSlaEventDto) {
    await this.getEvent(tenantId, id);
    return this.repository.updateEvent(tenantId, id, dto);
  }

  async removeEvent(tenantId: string, id: string) {
    await this.getEvent(tenantId, id);
    await this.repository.removeEvent(tenantId, id);
  }
}
