import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
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

@Injectable()
export class SlaRepository {
  constructor(private readonly prisma: PrismaService) {}

  listPolicies(tenantId: string) {
    return this.prisma.sla_policies.findMany({ where: { tenant_id: tenantId }, include: { kpis: true }, orderBy: { name: 'asc' } });
  }

  getPolicy(tenantId: string, id: string) {
    return this.prisma.sla_policies.findFirst({ where: { tenant_id: tenantId, id }, include: { kpis: true, instances: true } });
  }

  createPolicy(tenantId: string, data: CreateSlaPolicyDto) {
    return this.prisma.sla_policies.create({ data: { tenant_id: tenantId, ...data } as any });
  }

  async updatePolicy(tenantId: string, id: string, data: UpdateSlaPolicyDto) {
    await this.prisma.sla_policies.updateMany({ where: { tenant_id: tenantId, id }, data: { ...data, updated_at: new Date() } as any });
    return this.getPolicy(tenantId, id);
  }

  removePolicy(tenantId: string, id: string) {
    return this.prisma.sla_policies.deleteMany({ where: { tenant_id: tenantId, id } });
  }

  listKpis(tenantId: string) {
    return this.prisma.sla_kpis.findMany({ where: { tenant_id: tenantId }, include: { sla_policy: true }, orderBy: [{ sla_policy_id: 'asc' }, { sort_order: 'asc' }] });
  }

  getKpi(tenantId: string, id: string) {
    return this.prisma.sla_kpis.findFirst({ where: { tenant_id: tenantId, id }, include: { sla_policy: true } });
  }

  createKpi(tenantId: string, data: CreateSlaKpiDto) {
    return this.prisma.sla_kpis.create({ data: { tenant_id: tenantId, ...data } as any });
  }

  async updateKpi(tenantId: string, id: string, data: UpdateSlaKpiDto) {
    await this.prisma.sla_kpis.updateMany({ where: { tenant_id: tenantId, id }, data: { ...data, updated_at: new Date() } as any });
    return this.getKpi(tenantId, id);
  }

  removeKpi(tenantId: string, id: string) {
    return this.prisma.sla_kpis.deleteMany({ where: { tenant_id: tenantId, id } });
  }

  listInstances(tenantId: string) {
    return this.prisma.sla_instances.findMany({ where: { tenant_id: tenantId }, include: { incident: true, sla_policy: true, instance_kpis: true }, orderBy: { created_at: 'desc' } });
  }

  getInstance(tenantId: string, id: string) {
    return this.prisma.sla_instances.findFirst({ where: { tenant_id: tenantId, id }, include: { incident: true, sla_policy: true, instance_kpis: true } });
  }

  createInstance(tenantId: string, data: CreateSlaInstanceDto) {
    return this.prisma.sla_instances.create({
      data: {
        tenant_id: tenantId,
        ...data,
        started_at: data.started_at ? new Date(data.started_at) : undefined,
        paused_at: data.paused_at ? new Date(data.paused_at) : null,
        completed_at: data.completed_at ? new Date(data.completed_at) : null,
      },
    });
  }

  async updateInstance(tenantId: string, id: string, data: UpdateSlaInstanceDto) {
    await this.prisma.sla_instances.updateMany({
      where: { tenant_id: tenantId, id },
      data: {
        ...data,
        started_at: data.started_at ? new Date(data.started_at) : undefined,
        paused_at: data.paused_at ? new Date(data.paused_at) : undefined,
        completed_at: data.completed_at ? new Date(data.completed_at) : undefined,
        updated_at: new Date(),
      },
    });
    return this.getInstance(tenantId, id);
  }

  removeInstance(tenantId: string, id: string) {
    return this.prisma.sla_instances.deleteMany({ where: { tenant_id: tenantId, id } });
  }

  listInstanceKpis(tenantId: string) {
    return this.prisma.sla_instance_kpis.findMany({ where: { tenant_id: tenantId }, include: { sla_instance: true, sla_kpi: true }, orderBy: { created_at: 'desc' } });
  }

  getInstanceKpi(tenantId: string, id: string) {
    return this.prisma.sla_instance_kpis.findFirst({ where: { tenant_id: tenantId, id }, include: { sla_instance: true, sla_kpi: true } });
  }

  createInstanceKpi(tenantId: string, data: CreateSlaInstanceKpiDto) {
    return this.prisma.sla_instance_kpis.create({
      data: {
        tenant_id: tenantId,
        ...data,
        target_at: new Date(data.target_at),
        warning_at: data.warning_at ? new Date(data.warning_at) : null,
        met_at: data.met_at ? new Date(data.met_at) : null,
        breached_at: data.breached_at ? new Date(data.breached_at) : null,
        last_tick_at: data.last_tick_at ? new Date(data.last_tick_at) : null,
      },
    });
  }

  async updateInstanceKpi(tenantId: string, id: string, data: UpdateSlaInstanceKpiDto) {
    await this.prisma.sla_instance_kpis.updateMany({
      where: { tenant_id: tenantId, id },
      data: {
        ...data,
        target_at: data.target_at ? new Date(data.target_at) : undefined,
        warning_at: data.warning_at ? new Date(data.warning_at) : undefined,
        met_at: data.met_at ? new Date(data.met_at) : undefined,
        breached_at: data.breached_at ? new Date(data.breached_at) : undefined,
        last_tick_at: data.last_tick_at ? new Date(data.last_tick_at) : undefined,
        updated_at: new Date(),
      },
    });
    return this.getInstanceKpi(tenantId, id);
  }

  removeInstanceKpi(tenantId: string, id: string) {
    return this.prisma.sla_instance_kpis.deleteMany({ where: { tenant_id: tenantId, id } });
  }

  listEvents(tenantId: string) {
    return this.prisma.sla_events.findMany({ where: { tenant_id: tenantId }, include: { incident: true, sla_instance_kpi: true }, orderBy: { occurred_at: 'desc' } });
  }

  getEvent(tenantId: string, id: string) {
    return this.prisma.sla_events.findFirst({ where: { tenant_id: tenantId, id }, include: { incident: true, sla_instance_kpi: true } });
  }

  createEvent(tenantId: string, data: CreateSlaEventDto) {
    return this.prisma.sla_events.create({
      data: {
        tenant_id: tenantId,
        ...data,
        occurred_at: data.occurred_at ? new Date(data.occurred_at) : undefined,
      } as any,
    });
  }

  async updateEvent(tenantId: string, id: string, data: UpdateSlaEventDto) {
    await this.prisma.sla_events.updateMany({
      where: { tenant_id: tenantId, id },
      data: {
        ...data,
        occurred_at: data.occurred_at ? new Date(data.occurred_at) : undefined,
        updated_at: new Date(),
      } as any,
    });
    return this.getEvent(tenantId, id);
  }

  removeEvent(tenantId: string, id: string) {
    return this.prisma.sla_events.deleteMany({ where: { tenant_id: tenantId, id } });
  }
}
