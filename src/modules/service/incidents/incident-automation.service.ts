import { Injectable } from '@nestjs/common';
import {
  AppointmentStatus,
  IncidentStatus,
  Prisma,
  QueueAssignmentMode,
  SlaEventType,
  SlaInstanceKpiStatus,
  SlaInstanceStatus,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AutomationDispatcherService } from '../../automation/automation-dispatcher.service';
import { ResourceAvailabilityService } from '../common/resource-availability.service';
import { CreateIncidentDto, UpdateIncidentDto } from './incidents.dto';

type IncidentLike = Record<string, any> | null;

@Injectable()
export class IncidentAutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly automationDispatcher: AutomationDispatcherService,
    private readonly availabilityService: ResourceAvailabilityService,
  ) {}

  async prepareCreate(tenantId: string, dto: CreateIncidentDto): Promise<CreateIncidentDto> {
    const next = { ...dto } as CreateIncidentDto;

    if (!next.sla_policy_id) {
      next.sla_policy_id = await this.resolveDefaultSlaPolicyId(tenantId, next.subject_id, next.queue_id);
    }

    if (!next.owner_user_id && next.queue_id) {
      const assignment = await this.resolveAutoAssignment(tenantId, next.queue_id);
      if (assignment?.userId) next.owner_user_id = assignment.userId;
    }

    return next;
  }

  async prepareUpdate(tenantId: string, existing: IncidentLike, dto: UpdateIncidentDto): Promise<UpdateIncidentDto> {
    const next = { ...dto } as UpdateIncidentDto;

    if (!next.sla_policy_id && !existing?.sla_policy_id) {
      const subjectId = String(next.subject_id || existing?.subject_id || '').trim() || undefined;
      const queueId = String(next.queue_id || existing?.queue_id || '').trim() || undefined;
      next.sla_policy_id = await this.resolveDefaultSlaPolicyId(tenantId, subjectId, queueId);
    }

    const queueChanged = next.queue_id && String(next.queue_id) !== String(existing?.queue_id || '');
    if (!next.owner_user_id && !existing?.owner_user_id && queueChanged) {
      const assignment = await this.resolveAutoAssignment(tenantId, next.queue_id);
      if (assignment?.userId) next.owner_user_id = assignment.userId;
    }

    return next;
  }

  async afterMutation(args: {
    tenantId: string;
    userId: string;
    eventType: 'CREATE' | 'UPDATE';
    before?: IncidentLike;
    after: IncidentLike;
    changedFields?: string[];
  }) {
    const after = args.after || null;
    if (!after?.id) return;

    await this.syncSlaState(args.tenantId, after, args.before || null);

    this.automationDispatcher.dispatch({
      tenantId: args.tenantId,
      userId: args.userId,
      entityName: 'incidents',
      eventType: args.eventType,
      recordId: String(after.id),
      changedFields: args.changedFields || [],
      payload: {
        before: (args.before || {}) as Record<string, unknown>,
        after: after as Record<string, unknown>,
        changedFields: args.changedFields || [],
      },
    });
  }

  private async resolveDefaultSlaPolicyId(
    tenantId: string,
    subjectId?: string | null,
    queueId?: string | null,
  ): Promise<string | undefined> {
    const subjectKey = String(subjectId || '').trim();
    if (subjectKey) {
      const subject = await this.prisma.service_subjects.findFirst({
        where: { tenant_id: tenantId, id: subjectKey },
        select: { default_sla_policy_id: true },
      });
      if (subject?.default_sla_policy_id) return String(subject.default_sla_policy_id);
    }

    const queueKey = String(queueId || '').trim();
    if (queueKey) {
      const queue = await this.prisma.service_queues.findFirst({
        where: { tenant_id: tenantId, id: queueKey },
        select: { default_sla_policy_id: true },
      });
      if (queue?.default_sla_policy_id) return String(queue.default_sla_policy_id);
    }

    return undefined;
  }

  private async resolveAutoAssignment(tenantId: string, queueId?: string | null): Promise<{ userId: string; resourceId?: string } | null> {
    const queueKey = String(queueId || '').trim();
    if (!queueKey) return null;

    const queue = await this.prisma.service_queues.findFirst({
      where: { tenant_id: tenantId, id: queueKey, is_active: true },
      include: {
        members: {
          where: { is_active: true },
          include: {
            user: { select: { id: true, full_name: true } },
          },
          orderBy: [{ updated_at: 'asc' }, { created_at: 'asc' }],
        },
      },
    });

    if (!queue || queue.assignment_mode === QueueAssignmentMode.MANUAL) return null;

    const userIds = (queue.members || []).map((item) => String(item.user_id || '').trim()).filter(Boolean);
    if (!userIds.length) return null;

    const resources = await this.prisma.raw.service_resources.findMany({
      where: {
        tenant_id: tenantId,
        user_id: { in: userIds },
        is_active: true,
        can_receive_cases: true,
      },
      select: {
        id: true,
        user_id: true,
        calendar_id: true,
        max_open_incidents: true,
      },
    });

    const resourceByUser = new Map(resources.map((item) => [String(item.user_id), item]));
    const now = new Date();
    const candidates: Array<{
      memberId: string;
      userId: string;
      resourceId?: string;
      availableNow: boolean;
      openIncidents: number;
      openTasks: number;
      currentAppointments: number;
    }> = [];

    for (const member of queue.members || []) {
      const userId = String(member.user_id || '').trim();
      if (!userId) continue;
      const resource = resourceByUser.get(userId);
      if (!resource) continue;

      const [openIncidents, openTasks, currentAppointments, availableNow] = await Promise.all([
        this.prisma.incidents.count({
          where: {
            tenant_id: tenantId,
            owner_user_id: userId,
            status: { notIn: [IncidentStatus.RESOLVED, IncidentStatus.CANCELLED] },
          },
        }),
        this.prisma.service_tasks.count({
          where: {
            tenant_id: tenantId,
            assigned_to_user_id: userId,
            status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
          },
        }),
        this.prisma.service_appointments.count({
          where: {
            tenant_id: tenantId,
            resource_id: resource.id,
            status: { not: AppointmentStatus.CANCELLED },
            start_at: { lte: now },
            end_at: { gte: now },
          },
        }),
        this.availabilityService.isResourceAvailable(tenantId, resource.id, now, new Date(now.getTime() + 30 * 60000), {
          calendarId: resource.calendar_id,
        }),
      ]);

      if (resource.max_open_incidents != null && openIncidents >= resource.max_open_incidents) continue;

      candidates.push({
        memberId: String(member.id),
        userId,
        resourceId: String(resource.id),
        availableNow,
        openIncidents,
        openTasks,
        currentAppointments,
      });
    }

    if (!candidates.length) return null;

    const availableCandidates = candidates.filter((item) => item.availableNow);
    const pool = availableCandidates.length ? availableCandidates : candidates;

    let chosen = pool[0];
    if (queue.assignment_mode === QueueAssignmentMode.LEAST_BUSY) {
      chosen = pool
        .slice()
        .sort((a, b) => {
          const scoreA = a.openIncidents * 10 + a.openTasks * 3 + a.currentAppointments * 5;
          const scoreB = b.openIncidents * 10 + b.openTasks * 3 + b.currentAppointments * 5;
          if (scoreA !== scoreB) return scoreA - scoreB;
          if (a.availableNow !== b.availableNow) return a.availableNow ? -1 : 1;
          return a.userId.localeCompare(b.userId);
        })[0];
    }

    if (queue.assignment_mode === QueueAssignmentMode.ROUND_ROBIN) {
      await this.prisma.service_queue_members.updateMany({
        where: { tenant_id: tenantId, id: chosen.memberId },
        data: { updated_at: new Date() },
      });
    }

    return {
      userId: chosen.userId,
      resourceId: chosen.resourceId,
    };
  }

  private async syncSlaState(tenantId: string, after: IncidentLike, before: IncidentLike) {
    const incidentId = String(after?.id || '').trim();
    const policyId = String(after?.sla_policy_id || '').trim();
    if (!incidentId || !policyId) return;

    let instance = await this.prisma.sla_instances.findFirst({
      where: { tenant_id: tenantId, incident_id: incidentId },
      select: { id: true },
    });

    if (!instance) {
      instance = await this.createSlaInstance(tenantId, incidentId, policyId);
      await this.prisma.incidents.updateMany({
        where: { tenant_id: tenantId, id: incidentId },
        data: { sla_instance_id: instance.id, updated_at: new Date() },
      });
    }

    if (!instance?.id) return;

    const instanceId = String(instance.id);

    const currentStatus = String(after?.status || '').trim().toUpperCase();
    const previousStatus = String(before?.status || '').trim().toUpperCase();
    if (!currentStatus || currentStatus === previousStatus) return;

    const instanceKpis = await this.prisma.sla_instance_kpis.findMany({
      where: { tenant_id: tenantId, sla_instance_id: instanceId },
      include: { sla_kpi: true },
      orderBy: [{ created_at: 'asc' }],
    });

    const pauseSet = new Set<string>();
    for (const kpi of instanceKpis) {
      const source = Array.isArray(kpi.sla_kpi?.pause_when_status_in) ? (kpi.sla_kpi?.pause_when_status_in as Array<unknown>) : [];
      source.forEach((value) => pauseSet.add(String(value || '').trim().toUpperCase()));
    }

    if (pauseSet.has(currentStatus)) {
      await this.prisma.sla_instances.updateMany({
        where: { tenant_id: tenantId, id: instanceId },
        data: { status: SlaInstanceStatus.PAUSED, paused_at: new Date(), updated_at: new Date() },
      });
      await this.prisma.sla_instance_kpis.updateMany({
        where: { tenant_id: tenantId, sla_instance_id: instanceId, status: SlaInstanceKpiStatus.RUNNING },
        data: { status: SlaInstanceKpiStatus.PAUSED, updated_at: new Date() },
      });
      await this.createSlaEvent(tenantId, incidentId, null, SlaEventType.PAUSE, { status: currentStatus });
      return;
    }

    if (pauseSet.has(previousStatus) && !pauseSet.has(currentStatus)) {
      await this.prisma.sla_instances.updateMany({
        where: { tenant_id: tenantId, id: instanceId },
        data: { status: SlaInstanceStatus.RUNNING, paused_at: null, updated_at: new Date() },
      });
      await this.prisma.sla_instance_kpis.updateMany({
        where: { tenant_id: tenantId, sla_instance_id: instanceId, status: SlaInstanceKpiStatus.PAUSED },
        data: { status: SlaInstanceKpiStatus.RUNNING, updated_at: new Date() },
      });
      await this.createSlaEvent(tenantId, incidentId, null, SlaEventType.RESUME, { status: currentStatus });
    }

    if (currentStatus === IncidentStatus.RESOLVED) {
      const now = new Date();
      await this.prisma.sla_instances.updateMany({
        where: { tenant_id: tenantId, id: instanceId },
        data: { status: SlaInstanceStatus.MET, completed_at: now, paused_at: null, updated_at: now },
      });
      await this.prisma.sla_instance_kpis.updateMany({
        where: {
          tenant_id: tenantId,
          sla_instance_id: instanceId,
          status: { in: [SlaInstanceKpiStatus.RUNNING, SlaInstanceKpiStatus.PAUSED] },
        },
        data: { status: SlaInstanceKpiStatus.MET, met_at: now, updated_at: now },
      });
      await this.createSlaEvent(tenantId, incidentId, null, SlaEventType.MET, { status: currentStatus });
      return;
    }

    if (currentStatus === IncidentStatus.CANCELLED) {
      const now = new Date();
      await this.prisma.sla_instances.updateMany({
        where: { tenant_id: tenantId, id: instanceId },
        data: { status: SlaInstanceStatus.CANCELLED, completed_at: now, paused_at: null, updated_at: now },
      });
      await this.createSlaEvent(tenantId, incidentId, null, SlaEventType.CANCEL, { status: currentStatus });
    }
  }

  private async createSlaInstance(tenantId: string, incidentId: string, policyId: string) {
    const policy = await this.prisma.sla_policies.findFirst({
      where: { tenant_id: tenantId, id: policyId },
      include: {
        kpis: {
          where: { is_active: true },
          orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
        },
      },
    });
    const startedAt = new Date();
    const instance = await this.prisma.sla_instances.create({
      data: {
        tenant_id: tenantId,
        incident_id: incidentId,
        sla_policy_id: policyId,
        status: SlaInstanceStatus.RUNNING,
        started_at: startedAt,
      },
    });

    for (const kpi of policy?.kpis || []) {
      const warningAt = kpi.warning_after_minutes > 0 ? new Date(startedAt.getTime() + kpi.warning_after_minutes * 60000) : null;
      const targetAt = new Date(startedAt.getTime() + kpi.fail_after_minutes * 60000);
      const created = await this.prisma.sla_instance_kpis.create({
        data: {
          tenant_id: tenantId,
          sla_instance_id: instance.id,
          sla_kpi_id: kpi.id,
          status: SlaInstanceKpiStatus.RUNNING,
          target_at: targetAt,
          warning_at: warningAt,
        },
      });
      await this.createSlaEvent(tenantId, incidentId, created.id, SlaEventType.START, {
        kpi: kpi.name,
      });
    }

    return instance;
  }

  private async createSlaEvent(
    tenantId: string,
    incidentId: string,
    instanceKpiId: string | null,
    eventType: SlaEventType,
    metadata?: Record<string, unknown>,
  ) {
    await this.prisma.sla_events.create({
      data: {
        tenant_id: tenantId,
        incident_id: incidentId,
        sla_instance_kpi_id: instanceKpiId || null,
        event_type: eventType,
        metadata_json: metadata ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  }
}
