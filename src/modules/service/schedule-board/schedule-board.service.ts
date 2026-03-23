import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ResourceAvailabilityService } from '../common/resource-availability.service';

@Injectable()
export class ScheduleBoardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: ResourceAvailabilityService,
  ) {}

  async getBoard(tenantId: string, dateRaw?: string) {
    const day = this.parseBoardDate(dateRaw);
    const range = this.getDayRange(day);
    const poWorkOrderAppointments: any = (this.prisma as any).po_work_order_appointments;
    const poWorkOrders: any = (this.prisma as any).po_work_orders;

    const resources = await this.prisma.raw.service_resources.findMany({
      where: {
        tenant_id: tenantId,
        is_active: true,
      },
      include: {
        user: { select: { id: true, full_name: true, email: true } },
        calendar: { select: { id: true, name: true, timezone: true } },
        appointments: {
          where: {
            start_at: { lt: range.end },
            end_at: { gt: range.start },
            status: { not: AppointmentStatus.CANCELLED },
          },
          include: {
            incident: { select: { id: true, number: true, title: true, status: true } },
          },
          orderBy: [{ start_at: 'asc' }],
        },
      },
      orderBy: [{ name: 'asc' }],
    });

    const appointmentIds = resources.flatMap((resource) => resource.appointments.map((item) => String(item.id)));
    let workOrderLinks: any[] = [];
    if (appointmentIds.length && this.hasPrismaDelegate(poWorkOrderAppointments)) {
      try {
        workOrderLinks = await poWorkOrderAppointments.findMany({
          where: {
            tenant_id: tenantId,
            appointment_id: { in: appointmentIds },
          },
          include: {
            work_order: {
              include: {
                status: true,
                incident: { select: { id: true, number: true, title: true } },
              },
            },
          },
        });
      } catch (error) {
        if (!this.isMissingRelation(error)) throw error;
      }
    }
    const workOrderByAppointment = new Map<string, any>();
    for (const link of workOrderLinks || []) {
      workOrderByAppointment.set(String(link.appointment_id), link.work_order);
    }

    let unscheduledWorkOrders: any[] = [];
    if (this.hasPrismaDelegate(poWorkOrders)) {
      try {
        unscheduledWorkOrders = await poWorkOrders.findMany({
          where: {
            tenant_id: tenantId,
            deleted_at: null,
          },
          include: {
            status: true,
            incident: { select: { id: true, number: true, title: true, status: true } },
            assignments: {
              include: {
                resource: { select: { id: true, name: true, board_color: true } },
              },
            },
            _count: { select: { appointments: true } },
          },
          orderBy: [{ priority: 'desc' }, { updated_at: 'desc' }],
        });
      } catch (error) {
        if (!this.isMissingRelation(error)) throw error;
      }
    }

    const boardResources = await Promise.all(
      resources.map(async (resource) => {
        const intervals = await this.availabilityService.getWorkingIntervalsForDate(tenantId, resource.calendar_id, day);
        return {
          id: resource.id,
          name: resource.name,
          board_color: resource.board_color,
          can_receive_cases: resource.can_receive_cases,
          max_open_incidents: resource.max_open_incidents,
          capacity_per_day: resource.capacity_per_day,
          calendar: resource.calendar,
          user: resource.user,
          intervals: intervals.map((item) => ({ start_at: item.start, end_at: item.end })),
          appointments: resource.appointments.map((appointment) => ({
            id: appointment.id,
            title: appointment.title,
            start_at: appointment.start_at,
            end_at: appointment.end_at,
            status: appointment.status,
            notes: appointment.notes,
            incident: appointment.incident,
            work_order: workOrderByAppointment.get(String(appointment.id)) || null,
          })),
        };
      }),
    );

    const unscheduled = unscheduledWorkOrders
      .filter((item: any) => Number(item?._count?.appointments || 0) === 0)
      .map((item: any) => ({
        id: item.id,
        code: item.code,
        title: item.title,
        description: item.description,
        priority: item.priority,
        planned_start: item.planned_start,
        planned_end: item.planned_end,
        estimated_hours: item.estimated_hours,
        status: item.status,
        incident: item.incident,
        assignments: item.assignments || [],
      }));

    return {
      date: range.start,
      range,
      metrics: {
        resources: boardResources.length,
        appointments: boardResources.reduce((sum, item) => sum + item.appointments.length, 0),
        unscheduled_work_orders: unscheduled.length,
      },
      resources: boardResources,
      unscheduled_work_orders: unscheduled,
    };
  }

  async suggestWorkOrderSlots(tenantId: string, workOrderId: string, dateRaw?: string) {
    const poWorkOrders: any = (this.prisma as any).po_work_orders;
    if (!this.hasPrismaDelegate(poWorkOrders)) {
      throw new NotFoundException('Work orders n\u00e3o est\u00e3o dispon\u00edveis neste ambiente.');
    }

    const workOrder = await poWorkOrders.findFirst({
      where: { tenant_id: tenantId, id: workOrderId, deleted_at: null },
      include: {
        assignments: {
          include: {
            resource: {
              select: {
                id: true,
                name: true,
                calendar_id: true,
                board_color: true,
                is_active: true,
              },
            },
          },
        },
        incident: { select: { id: true, number: true, title: true } },
      },
    });

    if (!workOrder) throw new NotFoundException('Work order não encontrada.');

    const baseDate = this.parseBoardDate(dateRaw);
    const durationMinutes = this.resolveDurationMinutes(workOrder);
    const explicitResources = (workOrder.assignments || [])
      .map((item: any) => item.resource)
      .filter((item: any) => item?.id && item?.is_active);

    const candidates =
      explicitResources.length > 0
        ? explicitResources
        : await this.prisma.raw.service_resources.findMany({
            where: {
              tenant_id: tenantId,
              is_active: true,
            },
            select: {
              id: true,
              name: true,
              calendar_id: true,
              board_color: true,
            },
            orderBy: [{ name: 'asc' }],
            take: 12,
          });

    const suggestions: Array<{
      resource: { id: string; name: string; board_color: string | null };
      slots: Array<{ start_at: Date; end_at: Date }>;
    }> = [];
    for (const resource of candidates) {
      const slots = await this.availabilityService.suggestNextSlots({
        tenantId,
        resourceId: resource.id,
        calendarId: resource.calendar_id,
        from: workOrder.planned_start || baseDate,
        durationMinutes,
        limit: 2,
      });

      if (!slots.length) continue;
      suggestions.push({
        resource: {
          id: resource.id,
          name: resource.name,
          board_color: resource.board_color,
        },
        slots,
      });
    }

    return {
      work_order: workOrder,
      duration_minutes: durationMinutes,
      suggestions,
    };
  }

  async bookWorkOrder(
    tenantId: string,
    dto: {
      work_order_id?: string;
      resource_id?: string;
      start_at?: string;
      end_at?: string;
      appointment_id?: string;
    },
  ) {
    const poWorkOrders: any = (this.prisma as any).po_work_orders;
    const poWorkOrderAppointments: any = (this.prisma as any).po_work_order_appointments;
    const poWorkOrderAssignments: any = (this.prisma as any).po_work_order_assignments;
    if (
      !this.hasPrismaDelegate(poWorkOrders) ||
      !this.hasPrismaDelegate(poWorkOrderAppointments) ||
      !this.hasPrismaDelegate(poWorkOrderAssignments)
    ) {
      throw new NotFoundException('Work orders n\u00e3o est\u00e3o dispon\u00edveis neste ambiente.');
    }

    const workOrderId = String(dto.work_order_id || '').trim();
    const resourceId = String(dto.resource_id || '').trim();
    if (!workOrderId || !resourceId) {
      throw new BadRequestException('Informe work_order_id e resource_id.');
    }

    const startAt = this.parseDateTime(dto.start_at);
    const endAt = this.parseDateTime(dto.end_at);
    if (!startAt || !endAt || endAt <= startAt) {
      throw new BadRequestException('Informe start_at e end_at válidos.');
    }

    const workOrder = await poWorkOrders.findFirst({
      where: { tenant_id: tenantId, id: workOrderId, deleted_at: null },
      include: {
        assignments: true,
      },
    });
    if (!workOrder) throw new NotFoundException('Work order não encontrada.');

    const resource = await this.prisma.service_resources.findFirst({
      where: { tenant_id: tenantId, id: resourceId, is_active: true },
      select: { id: true, calendar_id: true, name: true },
    });
    if (!resource) throw new NotFoundException('Recurso não encontrado.');

    const appointmentId = String(dto.appointment_id || '').trim();
    const available = await this.availabilityService.isResourceAvailable(tenantId, resource.id, startAt, endAt, {
      calendarId: resource.calendar_id,
      ignoreAppointmentId: appointmentId || null,
    });
    if (!available) {
      throw new BadRequestException('O recurso não está disponível nesse período.');
    }

    const baseTitle = `${workOrder.code} - ${workOrder.title}`;
    const result = await this.prisma.transaction(async (tx) => {
      const txWorkOrderAppointments = (tx as any).po_work_order_appointments;
      const txWorkOrderAssignments = (tx as any).po_work_order_assignments;
      const txWorkOrders = (tx as any).po_work_orders;
      let appointment: any;
      if (appointmentId) {
        appointment = await tx.service_appointments.update({
          where: { id: appointmentId },
          data: {
            resource_id: resource.id,
            start_at: startAt,
            end_at: endAt,
            title: baseTitle,
            incident_id: workOrder.incident_id || null,
            updated_at: new Date(),
          },
          include: {
            resource: true,
            incident: true,
          },
        });
      } else {
        appointment = await tx.service_appointments.create({
          data: {
            tenant_id: tenantId,
            resource_id: resource.id,
            incident_id: workOrder.incident_id || null,
            title: baseTitle,
            start_at: startAt,
            end_at: endAt,
            status: AppointmentStatus.SCHEDULED,
            notes: workOrder.description || null,
          },
          include: {
            resource: true,
            incident: true,
          },
        });

        await txWorkOrderAppointments.create({
          data: {
            tenant_id: tenantId,
            work_order_id: workOrderId,
            appointment_id: appointment.id,
          },
        });
      }

      const alreadyAssigned = (workOrder.assignments || []).some((item: any) => String(item.resource_id) === resource.id);
      if (!alreadyAssigned) {
        await txWorkOrderAssignments.create({
          data: {
            tenant_id: tenantId,
            work_order_id: workOrderId,
            resource_id: resource.id,
          },
        });
      }

      await txWorkOrders.update({
        where: { id: workOrderId },
        data: {
          planned_start: workOrder.planned_start || startAt,
          planned_end: workOrder.planned_end || endAt,
          updated_at: new Date(),
        },
      });

      return appointment;
    });

    return result;
  }

  private parseBoardDate(value?: string): Date {
    const raw = String(value || '').trim();
    if (!raw) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return today;
    }
    const parsed = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Data inválida para o schedule board.');
    }
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  private parseDateTime(value?: string): Date | null {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private getDayRange(day: Date) {
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  private resolveDurationMinutes(workOrder: any): number {
    if (workOrder?.planned_start && workOrder?.planned_end) {
      const diff = new Date(workOrder.planned_end).getTime() - new Date(workOrder.planned_start).getTime();
      if (diff > 0) return Math.max(30, Math.round(diff / 60000));
    }

    const estimatedHours = Number(workOrder?.estimated_hours || 0);
    if (Number.isFinite(estimatedHours) && estimatedHours > 0) {
      return Math.max(30, Math.round(estimatedHours * 60));
    }

    return 60;
  }

  private isMissingRelation(error: unknown): boolean {
    const message = String((error as any)?.message || '').toLowerCase();
    return message.includes('relation') && (message.includes('does not exist') || message.includes('unknown'));
  }

  private hasPrismaDelegate(delegate: any): boolean {
    return !!delegate && typeof delegate === 'object';
  }
}
