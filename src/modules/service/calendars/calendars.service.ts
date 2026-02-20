import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CreateCalendarDto,
  CreateCalendarExceptionDto,
  CreateCalendarRuleDto,
  UpdateCalendarDto,
  UpdateCalendarExceptionDto,
  UpdateCalendarRuleDto,
} from './calendars.dto';
import { CalendarsRepository } from './calendars.repository';

@Injectable()
export class CalendarsService {
  constructor(private readonly repository: CalendarsRepository) {}

  listCalendars(tenantId: string) {
    return this.repository.findCalendars(tenantId);
  }

  async getCalendar(tenantId: string, id: string) {
    const row = await this.repository.findCalendarById(tenantId, id);
    if (!row) throw new NotFoundException('Calendário não encontrado.');
    return row;
  }

  createCalendar(tenantId: string, dto: CreateCalendarDto) {
    return this.repository.createCalendar(tenantId, dto);
  }

  async updateCalendar(tenantId: string, id: string, dto: UpdateCalendarDto) {
    await this.getCalendar(tenantId, id);
    return this.repository.updateCalendar(tenantId, id, dto);
  }

  async removeCalendar(tenantId: string, id: string) {
    await this.getCalendar(tenantId, id);
    await this.repository.removeCalendar(tenantId, id);
  }

  listRules(tenantId: string) {
    return this.repository.findRules(tenantId);
  }

  async getRule(tenantId: string, id: string) {
    const row = await this.repository.findRuleById(tenantId, id);
    if (!row) throw new NotFoundException('Regra de calendário não encontrada.');
    return row;
  }

  createRule(tenantId: string, dto: CreateCalendarRuleDto) {
    return this.repository.createRule(tenantId, dto);
  }

  async updateRule(tenantId: string, id: string, dto: UpdateCalendarRuleDto) {
    await this.getRule(tenantId, id);
    return this.repository.updateRule(tenantId, id, dto);
  }

  async removeRule(tenantId: string, id: string) {
    await this.getRule(tenantId, id);
    await this.repository.removeRule(tenantId, id);
  }

  listExceptions(tenantId: string) {
    return this.repository.findExceptions(tenantId);
  }

  async getException(tenantId: string, id: string) {
    const row = await this.repository.findExceptionById(tenantId, id);
    if (!row) throw new NotFoundException('Exceção de calendário não encontrada.');
    return row;
  }

  createException(tenantId: string, dto: CreateCalendarExceptionDto) {
    return this.repository.createException(tenantId, dto);
  }

  async updateException(tenantId: string, id: string, dto: UpdateCalendarExceptionDto) {
    await this.getException(tenantId, id);
    return this.repository.updateException(tenantId, id, dto);
  }

  async removeException(tenantId: string, id: string) {
    await this.getException(tenantId, id);
    await this.repository.removeException(tenantId, id);
  }
}
