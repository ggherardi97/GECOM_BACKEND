import { Injectable } from '@nestjs/common';
import { AppointmentStatus, CalendarExceptionType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

type TimeInterval = {
  start: Date;
  end: Date;
};

type SuggestionArgs = {
  tenantId: string;
  resourceId: string;
  calendarId?: string | null;
  from: Date;
  durationMinutes: number;
  limit?: number;
  daysToScan?: number;
  ignoreAppointmentId?: string | null;
};

@Injectable()
export class ResourceAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async isResourceAvailable(
    tenantId: string,
    resourceId: string,
    start: Date,
    end: Date,
    options?: { calendarId?: string | null; ignoreAppointmentId?: string | null },
  ): Promise<boolean> {
    if (!(start instanceof Date) || Number.isNaN(start.getTime())) return false;
    if (!(end instanceof Date) || Number.isNaN(end.getTime())) return false;
    if (end <= start) return false;

    const intervals = await this.getWorkingIntervalsForDate(tenantId, options?.calendarId ?? null, start);
    const fitsCalendar = intervals.some((interval) => interval.start <= start && interval.end >= end);
    if (!fitsCalendar) return false;

    const conflict = await this.prisma.service_appointments.findFirst({
      where: {
        tenant_id: tenantId,
        resource_id: resourceId,
        id: options?.ignoreAppointmentId ? { not: options.ignoreAppointmentId } : undefined,
        status: { not: AppointmentStatus.CANCELLED },
        start_at: { lt: end },
        end_at: { gt: start },
      },
      select: { id: true },
    });

    return !conflict;
  }

  async suggestNextSlots(args: SuggestionArgs): Promise<Array<{ start_at: Date; end_at: Date }>> {
    const durationMinutes = Math.max(15, Math.trunc(args.durationMinutes || 60));
    const limit = Math.max(1, Math.min(args.limit || 5, 12));
    const daysToScan = Math.max(1, Math.min(args.daysToScan || 7, 30));
    const roundedFrom = this.roundToStep(args.from, 30);
    const suggestions: Array<{ start_at: Date; end_at: Date }> = [];

    for (let dayOffset = 0; dayOffset < daysToScan && suggestions.length < limit; dayOffset += 1) {
      const baseDate = new Date(roundedFrom);
      baseDate.setDate(baseDate.getDate() + dayOffset);
      const intervals = await this.getWorkingIntervalsForDate(args.tenantId, args.calendarId ?? null, baseDate);
      if (!intervals.length) continue;

      for (const interval of intervals) {
        const firstStart = this.roundToStep(new Date(Math.max(interval.start.getTime(), roundedFrom.getTime())), 30);
        for (
          let cursor = new Date(firstStart);
          cursor.getTime() + durationMinutes * 60000 <= interval.end.getTime() && suggestions.length < limit;
          cursor = new Date(cursor.getTime() + 30 * 60000)
        ) {
          const end = new Date(cursor.getTime() + durationMinutes * 60000);
          // Avoid duplicate slots when multiple intervals touch the same boundary.
          if (suggestions.some((item) => item.start_at.getTime() === cursor.getTime() && item.end_at.getTime() === end.getTime())) {
            continue;
          }

          const available = await this.isResourceAvailable(args.tenantId, args.resourceId, cursor, end, {
            calendarId: args.calendarId,
            ignoreAppointmentId: args.ignoreAppointmentId,
          });
          if (available) suggestions.push({ start_at: cursor, end_at: end });
        }
      }
    }

    return suggestions;
  }

  async getWorkingIntervalsForDate(tenantId: string, calendarId: string | null | undefined, date: Date): Promise<TimeInterval[]> {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    if (!calendarId) {
      return [
        {
          start: this.combineDateAndTime(dayStart, 8, 0),
          end: this.combineDateAndTime(dayStart, 18, 0),
        },
      ];
    }

    const rules = await this.prisma.service_calendar_rules.findMany({
      where: {
        tenant_id: tenantId,
        calendar_id: calendarId,
        day_of_week: dayStart.getDay(),
      },
      orderBy: [{ start_time: 'asc' }],
    });

    let intervals = (rules || [])
      .filter((rule) => rule.is_working_time)
      .map((rule) => ({
        start: this.combineDateAndTime(dayStart, rule.start_time.getUTCHours(), rule.start_time.getUTCMinutes()),
        end: this.combineDateAndTime(dayStart, rule.end_time.getUTCHours(), rule.end_time.getUTCMinutes()),
      }))
      .filter((interval) => interval.end > interval.start);

    if (!intervals.length) {
      intervals = [
        {
          start: this.combineDateAndTime(dayStart, 8, 0),
          end: this.combineDateAndTime(dayStart, 18, 0),
        },
      ];
    }

    const exceptions = await this.prisma.service_calendar_exceptions.findMany({
      where: {
        tenant_id: tenantId,
        calendar_id: calendarId,
        date_from: { lt: dayEnd },
        date_to: { gt: dayStart },
      },
      orderBy: [{ date_from: 'asc' }],
    });

    const specialHours = exceptions
      .filter((item) => item.type === CalendarExceptionType.SPECIAL_HOURS)
      .map((item) => ({
        start: new Date(Math.max(item.date_from.getTime(), dayStart.getTime())),
        end: new Date(Math.min(item.date_to.getTime(), dayEnd.getTime())),
      }))
      .filter((interval) => interval.end > interval.start);

    if (specialHours.length) {
      intervals = specialHours;
    }

    for (const exception of exceptions) {
      if (exception.type !== CalendarExceptionType.HOLIDAY && exception.type !== CalendarExceptionType.BLACKOUT) continue;
      intervals = this.subtractIntervals(intervals, {
        start: new Date(Math.max(exception.date_from.getTime(), dayStart.getTime())),
        end: new Date(Math.min(exception.date_to.getTime(), dayEnd.getTime())),
      });
    }

    return intervals
      .map((interval) => ({ start: new Date(interval.start), end: new Date(interval.end) }))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  private subtractIntervals(source: TimeInterval[], blocker: TimeInterval): TimeInterval[] {
    const out: TimeInterval[] = [];
    for (const interval of source) {
      if (blocker.end <= interval.start || blocker.start >= interval.end) {
        out.push(interval);
        continue;
      }

      if (blocker.start > interval.start) {
        out.push({ start: interval.start, end: blocker.start });
      }
      if (blocker.end < interval.end) {
        out.push({ start: blocker.end, end: interval.end });
      }
    }
    return out.filter((interval) => interval.end > interval.start);
  }

  private combineDateAndTime(baseDate: Date, hours: number, minutes: number): Date {
    const next = new Date(baseDate);
    next.setHours(hours, minutes, 0, 0);
    return next;
  }

  private roundToStep(input: Date, stepMinutes: number): Date {
    const stepMs = Math.max(1, stepMinutes) * 60000;
    const rounded = Math.ceil(input.getTime() / stepMs) * stepMs;
    return new Date(rounded);
  }
}
