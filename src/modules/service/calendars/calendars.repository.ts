import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateCalendarDto,
  CreateCalendarExceptionDto,
  CreateCalendarRuleDto,
  UpdateCalendarDto,
  UpdateCalendarExceptionDto,
  UpdateCalendarRuleDto,
} from './calendars.dto';

@Injectable()
export class CalendarsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCalendars(tenantId: string) {
    return this.prisma.service_calendars.findMany({ where: { tenant_id: tenantId }, include: { rules: true, exceptions: true }, orderBy: { name: 'asc' } });
  }

  findCalendarById(tenantId: string, id: string) {
    return this.prisma.service_calendars.findFirst({ where: { tenant_id: tenantId, id }, include: { rules: true, exceptions: true } });
  }

  createCalendar(tenantId: string, data: CreateCalendarDto) {
    return this.prisma.service_calendars.create({ data: { tenant_id: tenantId, ...data } });
  }

  async updateCalendar(tenantId: string, id: string, data: UpdateCalendarDto) {
    await this.prisma.service_calendars.updateMany({ where: { tenant_id: tenantId, id }, data: { ...data, updated_at: new Date() } });
    return this.findCalendarById(tenantId, id);
  }

  removeCalendar(tenantId: string, id: string) {
    return this.prisma.service_calendars.deleteMany({ where: { tenant_id: tenantId, id } });
  }

  findRules(tenantId: string) {
    return this.prisma.service_calendar_rules.findMany({ where: { tenant_id: tenantId }, orderBy: [{ calendar_id: 'asc' }, { day_of_week: 'asc' }] });
  }

  findRuleById(tenantId: string, id: string) {
    return this.prisma.service_calendar_rules.findFirst({ where: { tenant_id: tenantId, id } });
  }

  createRule(tenantId: string, data: CreateCalendarRuleDto) {
    return this.prisma.service_calendar_rules.create({ data: { tenant_id: tenantId, ...data, start_time: new Date(data.start_time), end_time: new Date(data.end_time) } });
  }

  async updateRule(tenantId: string, id: string, data: UpdateCalendarRuleDto) {
    await this.prisma.service_calendar_rules.updateMany({
      where: { tenant_id: tenantId, id },
      data: {
        ...data,
        start_time: data.start_time ? new Date(data.start_time) : undefined,
        end_time: data.end_time ? new Date(data.end_time) : undefined,
        updated_at: new Date(),
      },
    });
    return this.findRuleById(tenantId, id);
  }

  removeRule(tenantId: string, id: string) {
    return this.prisma.service_calendar_rules.deleteMany({ where: { tenant_id: tenantId, id } });
  }

  findExceptions(tenantId: string) {
    return this.prisma.service_calendar_exceptions.findMany({ where: { tenant_id: tenantId }, orderBy: { date_from: 'asc' } });
  }

  findExceptionById(tenantId: string, id: string) {
    return this.prisma.service_calendar_exceptions.findFirst({ where: { tenant_id: tenantId, id } });
  }

  createException(tenantId: string, data: CreateCalendarExceptionDto) {
    return this.prisma.service_calendar_exceptions.create({ data: { tenant_id: tenantId, ...data, date_from: new Date(data.date_from), date_to: new Date(data.date_to) } });
  }

  async updateException(tenantId: string, id: string, data: UpdateCalendarExceptionDto) {
    await this.prisma.service_calendar_exceptions.updateMany({
      where: { tenant_id: tenantId, id },
      data: {
        ...data,
        date_from: data.date_from ? new Date(data.date_from) : undefined,
        date_to: data.date_to ? new Date(data.date_to) : undefined,
        updated_at: new Date(),
      },
    });
    return this.findExceptionById(tenantId, id);
  }

  removeException(tenantId: string, id: string) {
    return this.prisma.service_calendar_exceptions.deleteMany({ where: { tenant_id: tenantId, id } });
  }
}
