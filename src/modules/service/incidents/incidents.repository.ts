import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateIncidentDto, UpdateIncidentDto } from './incidents.dto';

@Injectable()
export class IncidentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(tenantId: string) {
    const incidents = await this.prisma.incidents.findMany({
      where: { tenant_id: tenantId },
      include: {
        company: true,
        queue: true,
        subject: true,
        asset: true,
        sla_linked_instance: {
          include: {
            sla_policy: true,
            instance_kpis: {
              include: {
                sla_kpi: true,
              },
              orderBy: { target_at: 'asc' },
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return incidents.map((incident) => ({
      ...incident,
      sla_summary: this.buildSlaSummary(incident.sla_linked_instance),
    }));
  }

  findById(tenantId: string, id: string) {
    return this.prisma.incidents.findFirst({
      where: { tenant_id: tenantId, id },
      include: {
        company: true,
        queue: true,
        subject: true,
        asset: true,
        owner_user: true,
        opened_by_user: true,
        sla_policy: true,
        sla_linked_instance: {
          include: {
            sla_policy: true,
            instance_kpis: true,
          },
        },
      },
    });
  }

  create(tenantId: string, data: CreateIncidentDto) {
    return this.prisma.incidents.create({
      data: {
        tenant_id: tenantId,
        ...data,
        number: data.number || '',
        due_at: data.due_at ? new Date(data.due_at) : null,
        resolved_at: data.resolved_at ? new Date(data.resolved_at) : null,
        closed_at: data.closed_at ? new Date(data.closed_at) : null,
      },
      include: {
        company: true,
        queue: true,
        subject: true,
        asset: true,
        owner_user: true,
        opened_by_user: true,
        sla_policy: true,
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

  async findTimeline(tenantId: string, id: string) {
    const [incident, tasks, appointments, slaEvents] = await Promise.all([
      this.findById(tenantId, id),
      this.prisma.service_tasks.findMany({
        where: { tenant_id: tenantId, incident_id: id },
        include: {
          task_type: true,
          assigned_to_user: true,
          created_by_user: true,
        },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.service_appointments.findMany({
        where: { tenant_id: tenantId, incident_id: id },
        include: {
          resource: true,
        },
        orderBy: { start_at: 'desc' },
      }),
      this.prisma.sla_events.findMany({
        where: { tenant_id: tenantId, incident_id: id },
        include: {
          sla_instance_kpi: {
            include: {
              sla_kpi: true,
            },
          },
        },
        orderBy: { occurred_at: 'desc' },
      }),
    ]);

    const items: Array<{
      id: string;
      kind: string;
      occurred_at: Date | null;
      title: string;
      subtitle: string | null;
      description: unknown;
      meta: Record<string, unknown>;
    }> = [];

    if (incident) {
      items.push({
        id: `incident-created-${incident.id}`,
        kind: 'INCIDENT_CREATED',
        occurred_at: incident.created_at,
        title: incident.title,
        subtitle: incident.number,
        description: incident.description || null,
        meta: {
          status: incident.status,
          priority: incident.priority,
          channel: incident.channel,
        },
      });

      if (incident.resolved_at) {
        items.push({
          id: `incident-resolved-${incident.id}`,
          kind: 'INCIDENT_RESOLVED',
          occurred_at: incident.resolved_at,
          title: incident.title,
          subtitle: incident.number,
          description: null,
          meta: {
            status: incident.status,
          },
        });
      }

      if (incident.closed_at) {
        items.push({
          id: `incident-closed-${incident.id}`,
          kind: 'INCIDENT_CLOSED',
          occurred_at: incident.closed_at,
          title: incident.title,
          subtitle: incident.number,
          description: null,
          meta: {
            status: incident.status,
          },
        });
      }
    }

    tasks.forEach((task) => {
      items.push({
        id: `task-${task.id}`,
        kind: 'TASK',
        occurred_at: task.completed_at || task.started_at || task.created_at,
        title: task.title,
        subtitle: task.task_type?.name || task.type,
        description: task.description || null,
        meta: {
          status: task.status,
          priority: task.priority,
          owner: task.assigned_to_user?.full_name || null,
          created_by: task.created_by_user?.full_name || null,
        },
      });
    });

    appointments.forEach((appointment) => {
      items.push({
        id: `appointment-${appointment.id}`,
        kind: 'APPOINTMENT',
        occurred_at: appointment.start_at || appointment.created_at,
        title: appointment.title,
        subtitle: appointment.resource?.name || null,
        description: appointment.notes || null,
        meta: {
          status: appointment.status,
          end_at: appointment.end_at,
        },
      });
    });

    slaEvents.forEach((event) => {
      items.push({
        id: `sla-event-${event.id}`,
        kind: 'SLA_EVENT',
        occurred_at: event.occurred_at,
        title: event.event_type,
        subtitle: event.sla_instance_kpi?.sla_kpi?.name || null,
        description: event.metadata_json || null,
        meta: {
          event_type: event.event_type,
          kpi_status: event.sla_instance_kpi?.status || null,
        },
      });
    });

    return items.sort((a, b) => new Date(b.occurred_at || 0).getTime() - new Date(a.occurred_at || 0).getTime());
  }

  async findRelated(tenantId: string, id: string) {
    const [tasks, appointments, slaEvents, slaInstance] = await Promise.all([
      this.prisma.service_tasks.findMany({
        where: { tenant_id: tenantId, incident_id: id },
        include: {
          task_type: true,
          assigned_to_user: true,
          created_by_user: true,
        },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.service_appointments.findMany({
        where: { tenant_id: tenantId, incident_id: id },
        include: {
          resource: true,
        },
        orderBy: { start_at: 'desc' },
      }),
      this.prisma.sla_events.findMany({
        where: { tenant_id: tenantId, incident_id: id },
        include: {
          sla_instance_kpi: {
            include: {
              sla_kpi: true,
            },
          },
        },
        orderBy: { occurred_at: 'desc' },
      }),
      this.prisma.sla_instances.findFirst({
        where: { tenant_id: tenantId, incident_id: id },
        include: {
          sla_policy: true,
          instance_kpis: {
            include: {
              sla_kpi: true,
            },
            orderBy: { target_at: 'asc' },
          },
        },
      }),
    ]);

    let workOrders: any[] = [];
    const poWorkOrders: any = (this.prisma as any).po_work_orders;
    if (poWorkOrders && typeof poWorkOrders.findMany === 'function') {
      try {
        workOrders = await poWorkOrders.findMany({
          where: { tenant_id: tenantId, incident_id: id, deleted_at: null },
          include: {
            status: true,
            owner_user: true,
            _count: { select: { assignments: true, appointments: true } },
          },
          orderBy: { updated_at: 'desc' },
        });
      } catch (error) {
        const message = String((error as any)?.message || '').toLowerCase();
        if (!(message.includes('relation') && message.includes('does not exist'))) {
          throw error;
        }
      }
    }

    return {
      tasks,
      appointments,
      sla_events: slaEvents,
      sla_instance: slaInstance,
      work_orders: workOrders,
    };
  }

  private buildSlaSummary(instance: any) {
    if (!instance) return null;

    if (String(instance.status || '') === 'CANCELLED') {
      return {
        status: 'CANCELLED',
        label: 'Cancelado',
        percent_remaining: null,
        progress_percent: 0,
        tone: 'info',
        target_at: null,
        warning_at: null,
        kpi_name: null,
      };
    }

    const kpis = Array.isArray(instance.instance_kpis) ? instance.instance_kpis : [];
    const activeStatuses = new Set(['RUNNING', 'PAUSED']);
    const primary =
      kpis.find((item: any) => activeStatuses.has(String(item?.status || ''))) ||
      kpis.find((item: any) => String(item?.status || '') === 'BREACHED') ||
      kpis.find((item: any) => String(item?.status || '') === 'MET') ||
      kpis[0];

    if (!primary?.target_at) {
      return {
        status: String(instance.status || ''),
        label: null,
        percent_remaining: null,
        progress_percent: null,
        tone: 'info',
        target_at: null,
        warning_at: null,
        kpi_name: null,
      };
    }

    const startedAt = this.safeDate(instance.started_at || primary.created_at);
    const targetAt = this.safeDate(primary.target_at);
    const warningAt = this.safeDate(primary.warning_at);
    const metAt = this.safeDate(primary.met_at);
    const breachedAt = this.safeDate(primary.breached_at);
    const pausedAt = this.safeDate(instance.paused_at);
    const now = new Date();

    if (!targetAt) {
      return {
        status: String(primary.status || instance.status || ''),
        label: null,
        percent_remaining: null,
        progress_percent: null,
        tone: 'info',
        target_at: null,
        warning_at: warningAt ? warningAt.toISOString() : null,
        kpi_name: primary?.sla_kpi?.name || null,
      };
    }

    const status = String(primary.status || instance.status || '');
    const referenceDate =
      status === 'MET'
        ? metAt || targetAt || now
        : status === 'BREACHED'
          ? breachedAt || now
          : status === 'PAUSED'
            ? pausedAt || now
            : now;

    const totalMs = startedAt && targetAt ? targetAt.getTime() - startedAt.getTime() : 0;
    const remainingMs = targetAt.getTime() - referenceDate.getTime();
    const remainingPercent =
      totalMs > 0 ? this.clampPercentage(Math.round((remainingMs / totalMs) * 100)) : status === 'BREACHED' ? 0 : 100;

    let tone = 'success';
    let label = `${remainingPercent}% restante`;
    if (status === 'BREACHED') {
      tone = 'danger';
      label = 'Violado';
    } else if (status === 'MET') {
      tone = 'success';
      label = 'Cumprido';
    } else if (status === 'PAUSED') {
      tone = 'warning';
      label = `${remainingPercent}% restante`;
    } else if (warningAt && now >= warningAt) {
      tone = 'warning';
    } else if (remainingPercent <= 25) {
      tone = 'danger';
    } else if (remainingPercent <= 50) {
      tone = 'warning';
    }

    return {
      status,
      label,
      percent_remaining: remainingPercent,
      progress_percent: status === 'BREACHED' ? 100 : status === 'MET' ? 100 : remainingPercent,
      tone,
      target_at: targetAt.toISOString(),
      warning_at: warningAt ? warningAt.toISOString() : null,
      kpi_name: primary?.sla_kpi?.name || null,
    };
  }

  private safeDate(value: unknown): Date | null {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private clampPercentage(value: number): number {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 100) return 100;
    return value;
  }
}

