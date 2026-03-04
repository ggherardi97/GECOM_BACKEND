import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AppointmentStatus,
  ContractBillingFrequency,
  ContractStatus,
  HrLeaveRequestStatus,
  TenantSubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ContractsService } from '../contracts/contracts.service';

type AuthUser = {
  id: string;
  tenant_id: string;
  role?: string;
};

type ListEventsInput = {
  start?: string;
  end?: string;
  types?: string;
};

type LookupInput = {
  q?: string;
  limit?: number;
  related_table?: string;
};

type ActivityTypeKey =
  | 'events'
  | 'service_appointments'
  | 'hr_leave_requests'
  | 'hr_employee_schedule_assignments'
  | 'hr_department_assignments'
  | 'service_calendar_rules'
  | 'contracts'
  | 'contract_lines'
  | 'tenant_subscriptions';

type ActivityField = {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'datetime-local' | 'time' | 'checkbox' | 'select' | 'lookup';
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  lookup?: string;
  depends_on?: string;
};

type ActivityDefinition = {
  type: ActivityTypeKey;
  label: string;
  color: string;
  fields: ActivityField[];
};

type CalendarEventRow = {
  id: string;
  title: string;
  start: string;
  end?: string | null;
  allDay?: boolean;
  color: string;
  textColor?: string;
  activity_type: ActivityTypeKey;
  activity_label: string;
  source_id: string;
  source_data?: any;
};

const ACTIVITY_DEFINITIONS: ActivityDefinition[] = [
  {
    type: 'events',
    label: 'Eventos',
    color: '#1c84c6',
    fields: [
      { name: 'title', label: 'Titulo', type: 'text', required: true },
      { name: 'description', label: 'Descricao', type: 'textarea' },
      {
        name: 'related_table',
        label: 'Tabela relacionada',
        type: 'select',
        required: true,
        options: [
          { value: 'companies', label: 'Empresas' },
          { value: 'processes', label: 'Processos' },
          { value: 'invoices', label: 'Faturas' },
          { value: 'leads', label: 'Leads' },
          { value: 'opportunities', label: 'Oportunidades' },
          { value: 'contracts', label: 'Contratos' },
          { value: 'incidents', label: 'Incidentes' },
        ],
      },
      {
        name: 'related_id',
        label: 'Registro relacionado',
        type: 'lookup',
        required: true,
        lookup: 'event_related',
        depends_on: 'related_table',
      },
      { name: 'type', label: 'Tipo (codigo)', type: 'number', required: true },
      { name: 'status', label: 'Status (codigo)', type: 'number' },
      { name: 'start_time', label: 'Inicio', type: 'datetime-local', required: true },
      { name: 'end_time', label: 'Fim', type: 'datetime-local' },
      { name: 'finished', label: 'Concluido', type: 'checkbox' },
      { name: 'document_related', label: 'Relacionado a documento', type: 'checkbox' },
    ],
  },
  {
    type: 'service_appointments',
    label: 'Agendamentos de Servico',
    color: '#23c6c8',
    fields: [
      { name: 'resource_id', label: 'Recurso', type: 'lookup', required: true, lookup: 'service_resources' },
      { name: 'incident_id', label: 'Incidente', type: 'lookup', lookup: 'incidents' },
      { name: 'title', label: 'Titulo', type: 'text', required: true },
      { name: 'start_at', label: 'Inicio', type: 'datetime-local', required: true },
      { name: 'end_at', label: 'Fim', type: 'datetime-local', required: true },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: [
          { value: AppointmentStatus.SCHEDULED, label: 'SCHEDULED' },
          { value: AppointmentStatus.DONE, label: 'DONE' },
          { value: AppointmentStatus.CANCELLED, label: 'CANCELLED' },
          { value: AppointmentStatus.NO_SHOW, label: 'NO_SHOW' },
        ],
      },
      { name: 'notes', label: 'Notas', type: 'textarea' },
    ],
  },
  {
    type: 'hr_leave_requests',
    label: 'Solicitacoes de Licenca (RH)',
    color: '#f8ac59',
    fields: [
      { name: 'employee_id', label: 'Colaborador', type: 'lookup', required: true, lookup: 'hr_employees' },
      { name: 'leave_type_id', label: 'Tipo de Licenca', type: 'lookup', required: true, lookup: 'hr_leave_types' },
      { name: 'approver_employee_id', label: 'Aprovador', type: 'lookup', lookup: 'hr_employees' },
      { name: 'start_datetime', label: 'Inicio', type: 'datetime-local', required: true },
      { name: 'end_datetime', label: 'Fim', type: 'datetime-local', required: true },
      { name: 'duration_minutes', label: 'Duracao (min)', type: 'number' },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: [
          { value: HrLeaveRequestStatus.DRAFT, label: 'DRAFT' },
          { value: HrLeaveRequestStatus.PENDING, label: 'PENDING' },
          { value: HrLeaveRequestStatus.APPROVED, label: 'APPROVED' },
          { value: HrLeaveRequestStatus.REJECTED, label: 'REJECTED' },
          { value: HrLeaveRequestStatus.CANCELED, label: 'CANCELED' },
        ],
      },
      { name: 'reason', label: 'Motivo', type: 'textarea' },
    ],
  },
  {
    type: 'hr_employee_schedule_assignments',
    label: 'Atribuicoes de Escala (RH)',
    color: '#1ab394',
    fields: [
      { name: 'employee_id', label: 'Colaborador', type: 'lookup', required: true, lookup: 'hr_employees' },
      {
        name: 'work_schedule_id',
        label: 'Escala de trabalho',
        type: 'lookup',
        required: true,
        lookup: 'hr_work_schedules',
      },
      { name: 'start_date', label: 'Data inicio', type: 'date', required: true },
      { name: 'end_date', label: 'Data fim', type: 'date' },
    ],
  },
  {
    type: 'hr_department_assignments',
    label: 'Atribuicoes de Departamento (RH)',
    color: '#ed5565',
    fields: [
      { name: 'employee_id', label: 'Colaborador', type: 'lookup', required: true, lookup: 'hr_employees' },
      {
        name: 'department_id',
        label: 'Departamento',
        type: 'lookup',
        required: true,
        lookup: 'hr_departments',
      },
      { name: 'position_id', label: 'Cargo', type: 'lookup', required: true, lookup: 'hr_positions' },
      { name: 'manager_employee_id', label: 'Gestor', type: 'lookup', lookup: 'hr_employees' },
      { name: 'work_location_id', label: 'Local de trabalho', type: 'lookup', lookup: 'hr_work_locations' },
      { name: 'start_date', label: 'Data inicio', type: 'date', required: true },
      { name: 'end_date', label: 'Data fim', type: 'date' },
      { name: 'cost_center', label: 'Centro de custo', type: 'text' },
    ],
  },
  {
    type: 'service_calendar_rules',
    label: 'Regras de Calendario de Servico',
    color: '#6f42c1',
    fields: [
      { name: 'calendar_id', label: 'Calendario', type: 'lookup', required: true, lookup: 'service_calendars' },
      {
        name: 'day_of_week',
        label: 'Dia da semana',
        type: 'select',
        required: true,
        options: [
          { value: '0', label: 'Domingo' },
          { value: '1', label: 'Segunda' },
          { value: '2', label: 'Terca' },
          { value: '3', label: 'Quarta' },
          { value: '4', label: 'Quinta' },
          { value: '5', label: 'Sexta' },
          { value: '6', label: 'Sabado' },
        ],
      },
      { name: 'start_time', label: 'Hora inicio (HH:mm)', type: 'time', required: true },
      { name: 'end_time', label: 'Hora fim (HH:mm)', type: 'time', required: true },
      { name: 'is_working_time', label: 'Horario util', type: 'checkbox' },
    ],
  },
  {
    type: 'contracts',
    label: 'Contratos',
    color: '#2f4050',
    fields: [
      { name: 'contract_number', label: 'Numero do contrato', type: 'text' },
      { name: 'name', label: 'Nome', type: 'text', required: true },
      { name: 'company_id', label: 'Empresa', type: 'lookup', required: true, lookup: 'companies' },
      { name: 'lead_id', label: 'Lead', type: 'lookup', lookup: 'leads' },
      { name: 'opportunity_id', label: 'Oportunidade', type: 'lookup', lookup: 'opportunities' },
      { name: 'owner_user_id', label: 'Responsavel', type: 'lookup', lookup: 'users' },
      { name: 'currency_id', label: 'Moeda', type: 'lookup', required: true, lookup: 'currencies' },
      { name: 'price_table_id', label: 'Tabela de preco', type: 'lookup', lookup: 'price_tables' },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: [
          { value: ContractStatus.DRAFT, label: 'DRAFT' },
          { value: ContractStatus.ACTIVE, label: 'ACTIVE' },
          { value: ContractStatus.SUSPENDED, label: 'SUSPENDED' },
          { value: ContractStatus.CANCELLED, label: 'CANCELLED' },
          { value: ContractStatus.EXPIRED, label: 'EXPIRED' },
        ],
      },
      { name: 'start_at', label: 'Data inicio', type: 'date' },
      { name: 'end_at', label: 'Data fim', type: 'date' },
      { name: 'renewal_date', label: 'Data renovacao', type: 'date' },
      { name: 'billing_day', label: 'Dia faturamento', type: 'number' },
      { name: 'auto_renew', label: 'Renovacao automatica', type: 'checkbox' },
      { name: 'discount_percent', label: 'Desconto (%)', type: 'number' },
      { name: 'terms', label: 'Termos', type: 'textarea' },
      { name: 'notes', label: 'Notas', type: 'textarea' },
    ],
  },
  {
    type: 'contract_lines',
    label: 'Linhas de Contrato',
    color: '#d1a054',
    fields: [
      { name: 'contract_id', label: 'Contrato', type: 'lookup', required: true, lookup: 'contracts' },
      { name: 'product_id', label: 'Produto', type: 'lookup', lookup: 'products' },
      { name: 'description', label: 'Descricao', type: 'textarea' },
      { name: 'unit', label: 'Unidade', type: 'text' },
      { name: 'unit_price', label: 'Preco unitario', type: 'number' },
      { name: 'quantity', label: 'Quantidade', type: 'number' },
      { name: 'tax_rate', label: 'Taxa imposto (0-1)', type: 'number' },
      { name: 'discount_percent', label: 'Desconto (%)', type: 'number' },
      {
        name: 'billing_frequency',
        label: 'Frequencia',
        type: 'select',
        options: [
          { value: ContractBillingFrequency.MONTHLY, label: 'MONTHLY' },
          { value: ContractBillingFrequency.QUARTERLY, label: 'QUARTERLY' },
          { value: ContractBillingFrequency.YEARLY, label: 'YEARLY' },
          { value: ContractBillingFrequency.ONE_TIME, label: 'ONE_TIME' },
        ],
      },
      { name: 'is_recurring', label: 'Recorrente', type: 'checkbox' },
      { name: 'start_at', label: 'Data inicio', type: 'date' },
      { name: 'end_at', label: 'Data fim', type: 'date' },
    ],
  },
  {
    type: 'tenant_subscriptions',
    label: 'Assinaturas do Tenant',
    color: '#27ae60',
    fields: [
      { name: 'plan_id', label: 'Plano', type: 'lookup', required: true, lookup: 'plans' },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: [
          { value: TenantSubscriptionStatus.TRIAL, label: 'TRIAL' },
          { value: TenantSubscriptionStatus.ACTIVE, label: 'ACTIVE' },
          { value: TenantSubscriptionStatus.SUSPENDED, label: 'SUSPENDED' },
          { value: TenantSubscriptionStatus.CANCELED, label: 'CANCELED' },
        ],
      },
      { name: 'starts_at', label: 'Inicio', type: 'datetime-local' },
      { name: 'ends_at', label: 'Fim', type: 'datetime-local' },
      { name: 'renews_at', label: 'Renova em', type: 'datetime-local' },
    ],
  },
];

@Injectable()
export class CalendarActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contractsService: ContractsService,
  ) {}

  private get db(): any {
    return this.prisma.raw;
  }

  getDefinitions() {
    return { types: ACTIVITY_DEFINITIONS };
  }

  async listEvents(user: AuthUser, input: ListEventsInput) {
    const start = this.parseDate(input.start, 'start', this.startOfDay(new Date()));
    const end = this.parseDate(input.end, 'end', this.addDays(this.startOfDay(new Date()), 35));

    if (end.getTime() <= start.getTime()) {
      throw new BadRequestException('Intervalo invalido: end precisa ser maior que start.');
    }

    const requestedTypes = this.parseRequestedTypes(input.types);

    const byType: Record<ActivityTypeKey, () => Promise<CalendarEventRow[]>> = {
      events: () => this.listEventsRows(user, start, end),
      service_appointments: () => this.listServiceAppointments(user, start, end),
      hr_leave_requests: () => this.listHrLeaveRequests(user, start, end),
      hr_employee_schedule_assignments: () => this.listHrEmployeeScheduleAssignments(user, start, end),
      hr_department_assignments: () => this.listHrDepartmentAssignments(user, start, end),
      service_calendar_rules: () => this.listServiceCalendarRules(user, start, end),
      contracts: () => this.listContracts(user, start, end),
      contract_lines: () => this.listContractLines(user, start, end),
      tenant_subscriptions: () => this.listTenantSubscriptions(user, start, end),
    };

    const chunks = await Promise.all(requestedTypes.map((type) => byType[type]()));
    const items = chunks
      .flat()
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    return {
      items,
      meta: {
        start: start.toISOString(),
        end: end.toISOString(),
        types: requestedTypes,
        total: items.length,
      },
    };
  }

  async lookup(user: AuthUser, entity: string, input: LookupInput) {
    const normalizedEntity = this.normalizeText(entity).toLowerCase();
    const q = this.normalizeText(input.q);
    const limit = this.normalizeLimit(input.limit);

    switch (normalizedEntity) {
      case 'companies':
        return this.lookupCompanies(user, q, limit);
      case 'users':
        return this.lookupUsers(user, q, limit);
      case 'service_resources':
        return this.lookupServiceResources(user, q, limit);
      case 'incidents':
        return this.lookupIncidents(user, q, limit);
      case 'hr_employees':
        return this.lookupHrEmployees(user, q, limit);
      case 'hr_leave_types':
        return this.lookupHrLeaveTypes(user, q, limit);
      case 'hr_departments':
        return this.lookupHrDepartments(user, q, limit);
      case 'hr_positions':
        return this.lookupHrPositions(user, q, limit);
      case 'hr_work_schedules':
        return this.lookupHrWorkSchedules(user, q, limit);
      case 'hr_work_locations':
        return this.lookupHrWorkLocations(user, q, limit);
      case 'service_calendars':
        return this.lookupServiceCalendars(user, q, limit);
      case 'contracts':
        return this.lookupContracts(user, q, limit);
      case 'products':
        return this.lookupProducts(user, q, limit);
      case 'plans':
        return this.lookupPlans(q, limit);
      case 'currencies':
        return this.lookupCurrencies(q, limit);
      case 'leads':
        return this.lookupLeads(user, q, limit);
      case 'opportunities':
        return this.lookupOpportunities(user, q, limit);
      case 'price_tables':
        return this.lookupPriceTables(user, q, limit);
      case 'event_related':
        return this.lookupEventRelated(user, this.normalizeText(input.related_table), q, limit);
      default:
        throw new BadRequestException(`Lookup nao suportado: ${normalizedEntity}.`);
    }
  }

  async create(user: AuthUser, type: string, payload: any) {
    const normalized = this.normalizeText(type).toLowerCase() as ActivityTypeKey;

    switch (normalized) {
      case 'events':
        return this.createEvent(user, payload);
      case 'service_appointments':
        return this.createServiceAppointment(user, payload);
      case 'hr_leave_requests':
        return this.createHrLeaveRequest(user, payload);
      case 'hr_employee_schedule_assignments':
        return this.createHrEmployeeScheduleAssignment(user, payload);
      case 'hr_department_assignments':
        return this.createHrDepartmentAssignment(user, payload);
      case 'service_calendar_rules':
        return this.createServiceCalendarRule(user, payload);
      case 'contracts':
        return this.createContract(user, payload);
      case 'contract_lines':
        return this.createContractLine(user, payload);
      case 'tenant_subscriptions':
        return this.createTenantSubscription(user, payload);
      default:
        throw new BadRequestException(`Tipo de atividade invalido: ${type}.`);
    }
  }

  private parseRequestedTypes(raw: string | undefined): ActivityTypeKey[] {
    const allowed = new Set<ActivityTypeKey>(ACTIVITY_DEFINITIONS.map((item) => item.type));
    const tokens = String(raw || '')
      .split(',')
      .map((item) => this.normalizeText(item).toLowerCase())
      .filter(Boolean) as ActivityTypeKey[];

    const selected = tokens.filter((item) => allowed.has(item));
    return selected.length ? selected : ACTIVITY_DEFINITIONS.map((item) => item.type);
  }

  private definitionOf(type: ActivityTypeKey): ActivityDefinition {
    const found = ACTIVITY_DEFINITIONS.find((item) => item.type === type);
    if (!found) throw new BadRequestException(`Definicao ausente para ${type}.`);
    return found;
  }

  private normalizeText(value: unknown): string {
    return String(value ?? '').trim();
  }

  private normalizeLimit(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 20;
    return Math.max(1, Math.min(50, Math.trunc(n)));
  }

  private searchContains(q: string) {
    return { contains: q, mode: 'insensitive' as const };
  }

  private parseDate(value: unknown, label: string, fallback?: Date): Date {
    const raw = this.normalizeText(value);
    if (!raw) {
      if (fallback) return new Date(fallback);
      throw new BadRequestException(`${label} é obrigatório.`);
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${label} inválido: ${raw}`);
    }
    return parsed;
  }

  private parseOptionalDate(value: unknown): Date | null {
    const raw = this.normalizeText(value);
    if (!raw) return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Data inválida: ${raw}`);
    }
    return parsed;
  }

  private parseRequiredString(payload: any, key: string, label: string): string {
    const value = this.normalizeText(payload?.[key]);
    if (!value) throw new BadRequestException(`${label} é obrigatório.`);
    return value;
  }

  private parseOptionalString(payload: any, key: string): string | null {
    const value = this.normalizeText(payload?.[key]);
    return value || null;
  }

  private parseRequiredInt(payload: any, key: string, label: string): number {
    const raw = payload?.[key];
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new BadRequestException(`${label} deve ser numérico.`);
    return Math.trunc(n);
  }

  private parseOptionalInt(payload: any, key: string): number | null {
    if (payload?.[key] === undefined || payload?.[key] === null || payload?.[key] === '') return null;
    const n = Number(payload[key]);
    if (!Number.isFinite(n)) throw new BadRequestException(`${key} deve ser numérico.`);
    return Math.trunc(n);
  }

  private parseOptionalNumberString(payload: any, key: string, fallback?: string): string | undefined {
    const raw = this.normalizeText(payload?.[key]);
    if (!raw) return fallback;
    const n = Number(raw.replace(',', '.'));
    if (!Number.isFinite(n)) throw new BadRequestException(`${key} inválido.`);
    return String(n);
  }

  private parseBoolean(value: unknown, fallback = false): boolean {
    if (typeof value === 'boolean') return value;
    const raw = this.normalizeText(value).toLowerCase();
    if (!raw) return fallback;
    if (['1', 'true', 'yes', 'y', 'sim', 's', 'on'].includes(raw)) return true;
    if (['0', 'false', 'no', 'n', 'nao', 'off'].includes(raw)) return false;
    return fallback;
  }

  private parseTimeToIso(value: unknown, label: string): string {
    const raw = this.normalizeText(value);
    if (!raw) throw new BadRequestException(`${label} é obrigatório.`);

    if (/^\d{2}:\d{2}$/.test(raw)) return `1970-01-01T${raw}:00.000Z`;
    if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return `1970-01-01T${raw}.000Z`;

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`${label} inválido: ${raw}`);
    return parsed.toISOString();
  }

  private parseEnum<T extends string>(value: unknown, allowed: readonly T[], fallback?: T): T {
    const raw = this.normalizeText(value);
    if (!raw) {
      if (fallback !== undefined) return fallback;
      throw new BadRequestException('Valor enum obrigatório.');
    }
    const upper = raw.toUpperCase();
    const match = allowed.find((item) => String(item).toUpperCase() === upper);
    if (!match) {
      throw new BadRequestException(`Valor inválido: ${raw}.`);
    }
    return match;
  }

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  private addDays(date: Date, days: number): Date {
    const out = new Date(date);
    out.setDate(out.getDate() + days);
    return out;
  }

  private toIsoDate(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }

  private dateOverlaps(rangeStart: Date, rangeEnd: Date, rowStart: Date | null, rowEnd: Date | null): boolean {
    if (!rowStart && !rowEnd) return false;
    const start = rowStart || rowEnd;
    const end = rowEnd || rowStart;
    if (!start || !end) return false;
    return start.getTime() <= rangeEnd.getTime() && end.getTime() >= rangeStart.getTime();
  }

  private allDayBounds(start: Date | null, end: Date | null): { start: string; end?: string } | null {
    const baseStart = start || end;
    if (!baseStart) return null;

    const startIso = this.toIsoDate(baseStart);
    if (!startIso) return null;

    const baseEnd = end || start;
    if (!baseEnd) return { start: startIso };

    const endExclusive = this.addDays(new Date(baseEnd), 1);
    const endIso = this.toIsoDate(endExclusive);
    if (!endIso) return { start: startIso };

    return { start: startIso, end: endIso };
  }

  private buildEvent(type: ActivityTypeKey, sourceId: string, data: {
    title: string;
    start: Date | string;
    end?: Date | string | null;
    allDay?: boolean;
    source_data?: any;
    idSuffix?: string;
  }): CalendarEventRow {
    const def = this.definitionOf(type);
    const startDate = data.start instanceof Date ? data.start.toISOString() : String(data.start);
    const endDate = data.end == null ? null : data.end instanceof Date ? data.end.toISOString() : String(data.end);
    const uniqueId = `${type}:${sourceId}${data.idSuffix ? `:${data.idSuffix}` : ''}`;

    return {
      id: uniqueId,
      source_id: sourceId,
      activity_type: type,
      activity_label: def.label,
      title: data.title,
      start: startDate,
      end: endDate,
      allDay: !!data.allDay,
      color: def.color,
      textColor: '#ffffff',
      source_data: data.source_data || null,
    };
  }

  private async listEventsRows(user: AuthUser, start: Date, end: Date): Promise<CalendarEventRow[]> {
    const rows = await this.db.events.findMany({
      where: {
        tenant_id: user.tenant_id,
        start_time: { lt: end },
        OR: [{ end_time: null }, { end_time: { gte: start } }],
      },
      orderBy: { start_time: 'asc' },
      take: 2000,
    });

    return rows.map((row: any) =>
      this.buildEvent('events', String(row.id), {
        title: this.normalizeText(row.title) || `Evento ${row.id}`,
        start: row.start_time,
        end: row.end_time || null,
        source_data: {
          related_table: row.related_table,
          related_id: row.related_id,
          status: row.status,
          type: row.type,
          finished: row.finished,
          description: row.description,
        },
      }),
    );
  }

  private async listServiceAppointments(user: AuthUser, start: Date, end: Date): Promise<CalendarEventRow[]> {
    const rows = await this.db.service_appointments.findMany({
      where: {
        tenant_id: user.tenant_id,
        start_at: { lt: end },
        end_at: { gte: start },
      },
      include: {
        resource: { select: { id: true, name: true } },
        incident: { select: { id: true, number: true, title: true } },
      },
      orderBy: { start_at: 'asc' },
      take: 2000,
    });

    return rows.map((row: any) => {
      const resourceName = this.normalizeText(row?.resource?.name);
      return this.buildEvent('service_appointments', String(row.id), {
        title: this.normalizeText(row.title) || `Agendamento ${resourceName || row.id}`,
        start: row.start_at,
        end: row.end_at,
        source_data: {
          resource_id: row.resource_id,
          resource_name: resourceName,
          incident_id: row.incident_id,
          incident_title: this.normalizeText(row?.incident?.title),
          status: row.status,
          notes: row.notes,
        },
      });
    });
  }

  private async listHrLeaveRequests(user: AuthUser, start: Date, end: Date): Promise<CalendarEventRow[]> {
    const rows = await this.db.hr_leave_requests.findMany({
      where: {
        tenant_id: user.tenant_id,
        deleted_at: null,
        start_datetime: { lt: end },
        end_datetime: { gte: start },
      },
      include: {
        employee: { select: { id: true, full_name: true, employee_number: true } },
        leave_type: { select: { id: true, name: true, code: true } },
      },
      orderBy: { start_datetime: 'asc' },
      take: 2000,
    });

    return rows.map((row: any) => {
      const employee = this.normalizeText(row?.employee?.full_name) || this.normalizeText(row?.employee?.employee_number);
      const leaveType = this.normalizeText(row?.leave_type?.name) || this.normalizeText(row?.leave_type?.code);
      return this.buildEvent('hr_leave_requests', String(row.id), {
        title: `${leaveType || 'Licenca'} - ${employee || 'Colaborador'}`,
        start: row.start_datetime,
        end: row.end_datetime,
        source_data: {
          employee_id: row.employee_id,
          leave_type_id: row.leave_type_id,
          status: row.status,
          reason: row.reason,
          duration_minutes: row.duration_minutes,
        },
      });
    });
  }

  private async listHrEmployeeScheduleAssignments(
    user: AuthUser,
    start: Date,
    end: Date,
  ): Promise<CalendarEventRow[]> {
    const rows = await this.db.hr_employee_schedule_assignments.findMany({
      where: {
        tenant_id: user.tenant_id,
        deleted_at: null,
      },
      include: {
        employee: { select: { id: true, full_name: true, employee_number: true } },
        work_schedule: { select: { id: true, name: true } },
      },
      orderBy: { start_date: 'asc' },
      take: 2000,
    });

    const dateStart = this.startOfDay(start);
    const dateEnd = this.startOfDay(end);

    return rows
      .filter((row: any) => this.dateOverlaps(dateStart, dateEnd, row.start_date || null, row.end_date || null))
      .map((row: any) => {
        const bounds = this.allDayBounds(row.start_date || null, row.end_date || null);
        if (!bounds) return null;

        const employee = this.normalizeText(row?.employee?.full_name) || this.normalizeText(row?.employee?.employee_number);
        const scheduleName = this.normalizeText(row?.work_schedule?.name) || 'Escala';

        return {
          ...this.buildEvent('hr_employee_schedule_assignments', String(row.id), {
            title: `${employee || 'Colaborador'} - ${scheduleName}`,
            start: bounds.start,
            end: bounds.end || null,
            allDay: true,
            source_data: {
              employee_id: row.employee_id,
              work_schedule_id: row.work_schedule_id,
            },
          }),
        };
      })
      .filter((item: CalendarEventRow | null): item is CalendarEventRow => !!item);
  }

  private async listHrDepartmentAssignments(user: AuthUser, start: Date, end: Date): Promise<CalendarEventRow[]> {
    const rows = await this.db.hr_department_assignments.findMany({
      where: {
        tenant_id: user.tenant_id,
        deleted_at: null,
      },
      include: {
        employee: { select: { id: true, full_name: true, employee_number: true } },
        department: { select: { id: true, name: true, code: true } },
        position: { select: { id: true, name: true } },
      },
      orderBy: { start_date: 'asc' },
      take: 2000,
    });

    const dateStart = this.startOfDay(start);
    const dateEnd = this.startOfDay(end);

    return rows
      .filter((row: any) => this.dateOverlaps(dateStart, dateEnd, row.start_date || null, row.end_date || null))
      .map((row: any) => {
        const bounds = this.allDayBounds(row.start_date || null, row.end_date || null);
        if (!bounds) return null;

        const employee = this.normalizeText(row?.employee?.full_name) || this.normalizeText(row?.employee?.employee_number);
        const dept = this.normalizeText(row?.department?.name) || this.normalizeText(row?.department?.code) || 'Departamento';
        const position = this.normalizeText(row?.position?.name);

        return this.buildEvent('hr_department_assignments', String(row.id), {
          title: `${employee || 'Colaborador'} - ${dept}${position ? ` (${position})` : ''}`,
          start: bounds.start,
          end: bounds.end || null,
          allDay: true,
          source_data: {
            employee_id: row.employee_id,
            department_id: row.department_id,
            position_id: row.position_id,
          },
        });
      })
      .filter((item: CalendarEventRow | null): item is CalendarEventRow => !!item);
  }

  private async listServiceCalendarRules(user: AuthUser, start: Date, end: Date): Promise<CalendarEventRow[]> {
    const rows = await this.db.service_calendar_rules.findMany({
      where: { tenant_id: user.tenant_id },
      include: {
        calendar: { select: { id: true, name: true, timezone: true } },
      },
      orderBy: [{ calendar_id: 'asc' }, { day_of_week: 'asc' }, { start_time: 'asc' }],
      take: 4000,
    });

    const dayStart = this.startOfDay(start);
    const dayEndExclusive = this.startOfDay(end);

    const out: CalendarEventRow[] = [];
    for (let current = new Date(dayStart); current < dayEndExclusive; current = this.addDays(current, 1)) {
      const day = current.getDay();
      for (const row of rows) {
        if (Number(row.day_of_week) !== day) continue;

        const st = new Date(row.start_time);
        const et = new Date(row.end_time);
        const sh = st.getUTCHours();
        const sm = st.getUTCMinutes();
        const ss = st.getUTCSeconds();
        const eh = et.getUTCHours();
        const em = et.getUTCMinutes();
        const es = et.getUTCSeconds();

        const startAt = new Date(current.getFullYear(), current.getMonth(), current.getDate(), sh, sm, ss, 0);
        let endAt = new Date(current.getFullYear(), current.getMonth(), current.getDate(), eh, em, es, 0);
        if (endAt.getTime() <= startAt.getTime()) {
          endAt = this.addDays(endAt, 1);
        }

        const calendarName = this.normalizeText(row?.calendar?.name) || 'Calendario';
        const slotType = row.is_working_time ? 'Horario util' : 'Bloqueio';
        const dateSuffix = this.toIsoDate(current) || `${current.getFullYear()}${current.getMonth()}${current.getDate()}`;

        out.push(
          this.buildEvent('service_calendar_rules', String(row.id), {
            title: `${calendarName} - ${slotType}`,
            start: startAt,
            end: endAt,
            idSuffix: dateSuffix,
            source_data: {
              calendar_id: row.calendar_id,
              day_of_week: row.day_of_week,
              is_working_time: row.is_working_time,
            },
          }),
        );
      }
    }

    return out;
  }

  private async listContracts(user: AuthUser, start: Date, end: Date): Promise<CalendarEventRow[]> {
    const rows = await this.db.contracts.findMany({
      where: { tenant_id: user.tenant_id },
      include: {
        company: { select: { id: true, company_name: true } },
        owner_user: { select: { id: true, full_name: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 2000,
    });

    const dateStart = this.startOfDay(start);
    const dateEnd = this.startOfDay(end);

    return rows
      .filter((row: any) => this.dateOverlaps(dateStart, dateEnd, row.start_at || null, row.end_at || null))
      .map((row: any) => {
        const bounds = this.allDayBounds(row.start_at || null, row.end_at || null);
        if (!bounds) return null;

        const contractNumber = this.normalizeText(row.contract_number);
        const name = this.normalizeText(row.name);
        const title = contractNumber ? `${contractNumber} - ${name || 'Contrato'}` : name || `Contrato ${row.id}`;

        return this.buildEvent('contracts', String(row.id), {
          title,
          start: bounds.start,
          end: bounds.end || null,
          allDay: true,
          source_data: {
            status: row.status,
            company_id: row.company_id,
            owner_user_id: row.owner_user_id,
            company_name: this.normalizeText(row?.company?.company_name),
            owner_name: this.normalizeText(row?.owner_user?.full_name),
          },
        });
      })
      .filter((item: CalendarEventRow | null): item is CalendarEventRow => !!item);
  }

  private async listContractLines(user: AuthUser, start: Date, end: Date): Promise<CalendarEventRow[]> {
    const rows = await this.db.contract_lines.findMany({
      where: { tenant_id: user.tenant_id },
      include: {
        contract: { select: { id: true, contract_number: true, name: true } },
        product: { select: { id: true, name: true, product_code: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 4000,
    });

    const dateStart = this.startOfDay(start);
    const dateEnd = this.startOfDay(end);

    return rows
      .filter((row: any) => this.dateOverlaps(dateStart, dateEnd, row.start_at || null, row.end_at || null))
      .map((row: any) => {
        const bounds = this.allDayBounds(row.start_at || null, row.end_at || null);
        if (!bounds) return null;

        const contractCode = this.normalizeText(row?.contract?.contract_number);
        const productName = this.normalizeText(row?.product?.name) || this.normalizeText(row?.product?.product_code);
        const desc = this.normalizeText(row.description);
        const title = `${contractCode || 'Contrato'} - ${productName || desc || `Linha ${row.line_number}`}`;

        return this.buildEvent('contract_lines', String(row.id), {
          title,
          start: bounds.start,
          end: bounds.end || null,
          allDay: true,
          source_data: {
            contract_id: row.contract_id,
            product_id: row.product_id,
            line_number: row.line_number,
            billing_frequency: row.billing_frequency,
            is_recurring: row.is_recurring,
          },
        });
      })
      .filter((item: CalendarEventRow | null): item is CalendarEventRow => !!item);
  }

  private async listTenantSubscriptions(user: AuthUser, start: Date, end: Date): Promise<CalendarEventRow[]> {
    const rows = await this.db.tenant_subscriptions.findMany({
      where: {
        tenant_id: user.tenant_id,
        starts_at: { lt: end },
        OR: [{ ends_at: null }, { ends_at: { gte: start } }],
      },
      include: {
        plan: { select: { id: true, code: true, name: true } },
      },
      orderBy: { starts_at: 'asc' },
      take: 400,
    });

    return rows.map((row: any) => {
      const planName = this.normalizeText(row?.plan?.name) || this.normalizeText(row?.plan?.code) || 'Plano';
      return this.buildEvent('tenant_subscriptions', String(row.id), {
        title: `Assinatura - ${planName}`,
        start: row.starts_at,
        end: row.ends_at || null,
        source_data: {
          plan_id: row.plan_id,
          status: row.status,
          renews_at: row.renews_at,
        },
      });
    });
  }

  private async createEvent(user: AuthUser, payload: any) {
    const row = await this.db.events.create({
      data: {
        tenant_id: user.tenant_id,
        related_table: this.parseRequiredString(payload, 'related_table', 'Tabela relacionada'),
        related_id: this.parseRequiredString(payload, 'related_id', 'Registro relacionado'),
        title: this.parseRequiredString(payload, 'title', 'Titulo'),
        description: this.parseOptionalString(payload, 'description'),
        type: this.parseRequiredInt(payload, 'type', 'Tipo'),
        status: this.parseOptionalInt(payload, 'status'),
        start_time: this.parseDate(payload?.start_time, 'start_time'),
        end_time: this.parseOptionalDate(payload?.end_time),
        finished: this.parseBoolean(payload?.finished, false),
        document_related: this.parseBoolean(payload?.document_related, false),
      },
    });

    return { ok: true, type: 'events', item: row };
  }

  private async createServiceAppointment(user: AuthUser, payload: any) {
    const startAt = this.parseDate(payload?.start_at, 'start_at');
    const endAt = this.parseDate(payload?.end_at, 'end_at');
    if (endAt.getTime() <= startAt.getTime()) {
      throw new BadRequestException('end_at precisa ser maior que start_at.');
    }

    const row = await this.db.service_appointments.create({
      data: {
        tenant_id: user.tenant_id,
        resource_id: this.parseRequiredString(payload, 'resource_id', 'Recurso'),
        incident_id: this.parseOptionalString(payload, 'incident_id'),
        title: this.parseRequiredString(payload, 'title', 'Titulo'),
        start_at: startAt,
        end_at: endAt,
        status: this.parseEnum(payload?.status, Object.values(AppointmentStatus), AppointmentStatus.SCHEDULED),
        notes: this.parseOptionalString(payload, 'notes'),
      },
    });

    return { ok: true, type: 'service_appointments', item: row };
  }

  private async createHrLeaveRequest(user: AuthUser, payload: any) {
    const startAt = this.parseDate(payload?.start_datetime, 'start_datetime');
    const endAt = this.parseDate(payload?.end_datetime, 'end_datetime');
    if (endAt.getTime() <= startAt.getTime()) {
      throw new BadRequestException('end_datetime precisa ser maior que start_datetime.');
    }

    const durationMinutes = this.parseOptionalInt(payload, 'duration_minutes');
    const calculated = Math.max(1, Math.round((endAt.getTime() - startAt.getTime()) / 60000));

    const row = await this.db.hr_leave_requests.create({
      data: {
        tenant_id: user.tenant_id,
        employee_id: this.parseRequiredString(payload, 'employee_id', 'Colaborador'),
        leave_type_id: this.parseRequiredString(payload, 'leave_type_id', 'Tipo de licenca'),
        start_datetime: startAt,
        end_datetime: endAt,
        duration_minutes: durationMinutes != null ? Math.max(1, durationMinutes) : calculated,
        reason: this.parseOptionalString(payload, 'reason'),
        approver_employee_id: this.parseOptionalString(payload, 'approver_employee_id'),
        status: this.parseEnum(payload?.status, Object.values(HrLeaveRequestStatus), HrLeaveRequestStatus.DRAFT),
      },
    });

    return { ok: true, type: 'hr_leave_requests', item: row };
  }

  private async createHrEmployeeScheduleAssignment(user: AuthUser, payload: any) {
    const row = await this.db.hr_employee_schedule_assignments.create({
      data: {
        tenant_id: user.tenant_id,
        employee_id: this.parseRequiredString(payload, 'employee_id', 'Colaborador'),
        work_schedule_id: this.parseRequiredString(payload, 'work_schedule_id', 'Escala de trabalho'),
        start_date: this.parseDate(payload?.start_date, 'start_date'),
        end_date: this.parseOptionalDate(payload?.end_date),
      },
    });

    return { ok: true, type: 'hr_employee_schedule_assignments', item: row };
  }

  private async createHrDepartmentAssignment(user: AuthUser, payload: any) {
    const row = await this.db.hr_department_assignments.create({
      data: {
        tenant_id: user.tenant_id,
        employee_id: this.parseRequiredString(payload, 'employee_id', 'Colaborador'),
        department_id: this.parseRequiredString(payload, 'department_id', 'Departamento'),
        position_id: this.parseRequiredString(payload, 'position_id', 'Cargo'),
        manager_employee_id: this.parseOptionalString(payload, 'manager_employee_id'),
        work_location_id: this.parseOptionalString(payload, 'work_location_id'),
        start_date: this.parseDate(payload?.start_date, 'start_date'),
        end_date: this.parseOptionalDate(payload?.end_date),
        cost_center: this.parseOptionalString(payload, 'cost_center'),
      },
    });

    return { ok: true, type: 'hr_department_assignments', item: row };
  }

  private async createServiceCalendarRule(user: AuthUser, payload: any) {
    const dayOfWeek = this.parseRequiredInt(payload, 'day_of_week', 'Dia da semana');
    if (dayOfWeek < 0 || dayOfWeek > 6) {
      throw new BadRequestException('day_of_week deve estar entre 0 e 6.');
    }

    const row = await this.db.service_calendar_rules.create({
      data: {
        tenant_id: user.tenant_id,
        calendar_id: this.parseRequiredString(payload, 'calendar_id', 'Calendario'),
        day_of_week: dayOfWeek,
        start_time: new Date(this.parseTimeToIso(payload?.start_time, 'start_time')),
        end_time: new Date(this.parseTimeToIso(payload?.end_time, 'end_time')),
        is_working_time: this.parseBoolean(payload?.is_working_time, true),
      },
    });

    return { ok: true, type: 'service_calendar_rules', item: row };
  }

  private async createContract(user: AuthUser, payload: any) {
    const dto: any = {
      contract_number: this.parseOptionalString(payload, 'contract_number') || undefined,
      name: this.parseRequiredString(payload, 'name', 'Nome do contrato'),
      company_id: this.parseRequiredString(payload, 'company_id', 'Empresa'),
      lead_id: this.parseOptionalString(payload, 'lead_id') || undefined,
      opportunity_id: this.parseOptionalString(payload, 'opportunity_id') || undefined,
      owner_user_id: this.parseOptionalString(payload, 'owner_user_id') || user.id,
      currency_id: this.parseRequiredString(payload, 'currency_id', 'Moeda'),
      price_table_id: this.parseOptionalString(payload, 'price_table_id') || undefined,
      status: this.parseEnum(payload?.status, Object.values(ContractStatus), ContractStatus.DRAFT),
      start_at: this.toIsoDate(this.parseOptionalDate(payload?.start_at)) || undefined,
      end_at: this.toIsoDate(this.parseOptionalDate(payload?.end_at)) || undefined,
      renewal_date: this.toIsoDate(this.parseOptionalDate(payload?.renewal_date)) || undefined,
      billing_day: this.parseOptionalInt(payload, 'billing_day') || undefined,
      auto_renew: this.parseBoolean(payload?.auto_renew, false),
      discount_percent: this.parseOptionalInt(payload, 'discount_percent') || undefined,
      terms: this.parseOptionalString(payload, 'terms') || undefined,
      notes: this.parseOptionalString(payload, 'notes') || undefined,
      lines: [],
    };

    const created = await this.contractsService.create(user, dto);
    return { ok: true, type: 'contracts', item: created };
  }

  private async createContractLine(user: AuthUser, payload: any) {
    const contractId = this.parseRequiredString(payload, 'contract_id', 'Contrato');
    const contract = await this.contractsService.findById(user, contractId);
    if (!contract) throw new NotFoundException('Contrato nao encontrado.');

    const newLine: any = {
      product_id: this.parseOptionalString(payload, 'product_id') || undefined,
      description: this.parseOptionalString(payload, 'description') || undefined,
      unit: this.parseOptionalString(payload, 'unit') || undefined,
      unit_price: this.parseOptionalNumberString(payload, 'unit_price', '0'),
      quantity: this.parseOptionalNumberString(payload, 'quantity', '1'),
      tax_rate: this.parseOptionalNumberString(payload, 'tax_rate', '0'),
      discount_percent: this.parseOptionalInt(payload, 'discount_percent') || 0,
      billing_frequency: this.parseEnum(
        payload?.billing_frequency,
        Object.values(ContractBillingFrequency),
        ContractBillingFrequency.MONTHLY,
      ),
      is_recurring: this.parseBoolean(payload?.is_recurring, true),
      start_at: this.toIsoDate(this.parseOptionalDate(payload?.start_at)) || undefined,
      end_at: this.toIsoDate(this.parseOptionalDate(payload?.end_at)) || undefined,
    };

    if (!newLine.product_id && !newLine.description) {
      throw new BadRequestException('Informe ao menos product_id ou description para a linha do contrato.');
    }

    const existingLines = Array.isArray((contract as any).lines)
      ? (contract as any).lines.map((line: any) => ({
          product_id: line.product_id || undefined,
          description: line.description || undefined,
          unit: line.unit || undefined,
          unit_price: String(line.unit_price ?? '0'),
          quantity: String(line.quantity ?? '1'),
          tax_rate: String(line.tax_rate ?? '0'),
          discount_percent: Number(line.discount_percent ?? 0),
          billing_frequency: line.billing_frequency || ContractBillingFrequency.MONTHLY,
          is_recurring: line.is_recurring !== false,
          start_at: this.toIsoDate(line.start_at) || undefined,
          end_at: this.toIsoDate(line.end_at) || undefined,
        }))
      : [];

    const updated = await this.contractsService.update(user, contractId, {
      lines: [...existingLines, newLine],
      discount_percent: Number((contract as any).discount_percent ?? 0),
    } as any);

    return { ok: true, type: 'contract_lines', item: updated };
  }

  private async createTenantSubscription(user: AuthUser, payload: any) {
    const startsAt = this.parseOptionalDate(payload?.starts_at);
    const endsAt = this.parseOptionalDate(payload?.ends_at);

    if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException('ends_at precisa ser maior que starts_at.');
    }

    const row = await this.db.tenant_subscriptions.create({
      data: {
        tenant_id: user.tenant_id,
        plan_id: this.parseRequiredString(payload, 'plan_id', 'Plano'),
        status: this.parseEnum(payload?.status, Object.values(TenantSubscriptionStatus), TenantSubscriptionStatus.ACTIVE),
        starts_at: startsAt || new Date(),
        ends_at: endsAt,
        renews_at: this.parseOptionalDate(payload?.renews_at),
      },
      include: { plan: true },
    });

    return { ok: true, type: 'tenant_subscriptions', item: row };
  }

  private mapLookup(items: any[]): { items: Array<{ id: string; label: string; subtitle?: string }> } {
    const out: Array<{ id: string; label: string; subtitle?: string }> = [];

    for (const item of items || []) {
      const id = this.normalizeText(item?.id);
      if (!id) continue;
      out.push({
        id,
        label: this.normalizeText(item?.label) || id,
        subtitle: this.normalizeText(item?.subtitle) || undefined,
      });
    }

    return { items: out };
  }

  private async lookupCompanies(user: AuthUser, q: string, limit: number) {
    const rows = await this.db.companies.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { company_name: this.searchContains(q) },
                { company_number: this.searchContains(q) },
              ],
            }
          : {}),
      },
      select: { id: true, company_name: true, company_number: true },
      orderBy: { company_name: 'asc' },
      take: limit,
    });

    return this.mapLookup(
      rows.map((row: any) => ({ id: row.id, label: row.company_name, subtitle: row.company_number || undefined })),
    );
  }

  private async lookupUsers(user: AuthUser, q: string, limit: number) {
    const rows = await this.db.users.findMany({
      where: {
        ...(q
          ? {
              OR: [{ full_name: this.searchContains(q) }, { email: this.searchContains(q) }],
            }
          : {}),
      },
      select: { id: true, full_name: true, email: true },
      orderBy: { full_name: 'asc' },
      take: limit,
    });

    return this.mapLookup(rows.map((row: any) => ({ id: row.id, label: row.full_name, subtitle: row.email || undefined })));
  }

  private async lookupServiceResources(user: AuthUser, q: string, limit: number) {
    const rows = await this.db.service_resources.findMany({
      where: {
        ...(q ? { name: this.searchContains(q) } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: limit,
    });

    return this.mapLookup(rows.map((row: any) => ({ id: row.id, label: row.name })));
  }

  private async lookupIncidents(user: AuthUser, q: string, limit: number) {
    const rows = await this.db.incidents.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { title: this.searchContains(q) },
                { number: { equals: Number(q) || undefined } },
              ],
            }
          : {}),
      },
      select: { id: true, number: true, title: true },
      orderBy: { created_at: 'desc' },
      take: limit,
    });

    return this.mapLookup(
      rows.map((row: any) => ({
        id: row.id,
        label: row.title || `Incidente #${row.number}`,
        subtitle: row.number != null ? `#${row.number}` : undefined,
      })),
    );
  }

  private async lookupHrEmployees(user: AuthUser, q: string, limit: number) {
    const rows = await this.db.hr_employees.findMany({
      where: {
        deleted_at: null,
        ...(q
          ? {
              OR: [
                { full_name: this.searchContains(q) },
                { employee_number: this.searchContains(q) },
              ],
            }
          : {}),
      },
      select: { id: true, full_name: true, employee_number: true },
      orderBy: { full_name: 'asc' },
      take: limit,
    });

    return this.mapLookup(
      rows.map((row: any) => ({ id: row.id, label: row.full_name, subtitle: row.employee_number || undefined })),
    );
  }

  private async lookupHrLeaveTypes(user: AuthUser, q: string, limit: number) {
    const rows = await this.db.hr_leave_types.findMany({
      where: {
        deleted_at: null,
        ...(q
          ? {
              OR: [{ name: this.searchContains(q) }, { code: this.searchContains(q) }],
            }
          : {}),
      },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
      take: limit,
    });

    return this.mapLookup(rows.map((row: any) => ({ id: row.id, label: row.name, subtitle: row.code || undefined })));
  }

  private async lookupHrDepartments(user: AuthUser, q: string, limit: number) {
    const rows = await this.db.hr_departments.findMany({
      where: {
        deleted_at: null,
        ...(q
          ? {
              OR: [{ name: this.searchContains(q) }, { code: this.searchContains(q) }],
            }
          : {}),
      },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
      take: limit,
    });

    return this.mapLookup(rows.map((row: any) => ({ id: row.id, label: row.name, subtitle: row.code || undefined })));
  }

  private async lookupHrPositions(user: AuthUser, q: string, limit: number) {
    const rows = await this.db.hr_positions.findMany({
      where: {
        deleted_at: null,
        ...(q
          ? {
              OR: [{ name: this.searchContains(q) }, { code: this.searchContains(q) }],
            }
          : {}),
      },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
      take: limit,
    });

    return this.mapLookup(rows.map((row: any) => ({ id: row.id, label: row.name, subtitle: row.code || undefined })));
  }

  private async lookupHrWorkSchedules(user: AuthUser, q: string, limit: number) {
    const rows = await this.db.hr_work_schedules.findMany({
      where: {
        deleted_at: null,
        ...(q ? { name: this.searchContains(q) } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: limit,
    });

    return this.mapLookup(rows.map((row: any) => ({ id: row.id, label: row.name })));
  }

  private async lookupHrWorkLocations(user: AuthUser, q: string, limit: number) {
    const rows = await this.db.hr_work_locations.findMany({
      where: {
        deleted_at: null,
        ...(q
          ? {
              OR: [{ name: this.searchContains(q) }, { code: this.searchContains(q) }],
            }
          : {}),
      },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
      take: limit,
    });

    return this.mapLookup(rows.map((row: any) => ({ id: row.id, label: row.name, subtitle: row.code || undefined })));
  }

  private async lookupServiceCalendars(user: AuthUser, q: string, limit: number) {
    const rows = await this.db.service_calendars.findMany({
      where: {
        ...(q ? { name: this.searchContains(q) } : {}),
      },
      select: { id: true, name: true, timezone: true },
      orderBy: { name: 'asc' },
      take: limit,
    });

    return this.mapLookup(rows.map((row: any) => ({ id: row.id, label: row.name, subtitle: row.timezone || undefined })));
  }

  private async lookupContracts(user: AuthUser, q: string, limit: number) {
    const rows = await this.db.contracts.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { contract_number: this.searchContains(q) },
                { name: this.searchContains(q) },
              ],
            }
          : {}),
      },
      select: { id: true, contract_number: true, name: true },
      orderBy: { updated_at: 'desc' },
      take: limit,
    });

    return this.mapLookup(
      rows.map((row: any) => ({ id: row.id, label: `${row.contract_number || ''} ${row.name || ''}`.trim() || row.id })),
    );
  }

  private async lookupProducts(user: AuthUser, q: string, limit: number) {
    const rows = await this.db.products.findMany({
      where: {
        ...(q
          ? {
              OR: [{ name: this.searchContains(q) }, { product_code: this.searchContains(q) }],
            }
          : {}),
      },
      select: { id: true, name: true, product_code: true },
      orderBy: { name: 'asc' },
      take: limit,
    });

    return this.mapLookup(
      rows.map((row: any) => ({ id: row.id, label: row.name, subtitle: row.product_code || undefined })),
    );
  }

  private async lookupPlans(q: string, limit: number) {
    const rows = await this.db.plans.findMany({
      where: {
        ...(q
          ? {
              OR: [{ name: this.searchContains(q) }, { code: this.searchContains(q) }],
            }
          : {}),
        is_active: true,
      },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
      take: limit,
    });

    return this.mapLookup(rows.map((row: any) => ({ id: row.id, label: row.name, subtitle: row.code || undefined })));
  }

  private async lookupCurrencies(q: string, limit: number) {
    const rows = await this.db.currencies.findMany({
      where: {
        ...(q
          ? {
              OR: [{ name: this.searchContains(q) }, { code: this.searchContains(q) }],
            }
          : {}),
        is_active: true,
      },
      select: { id: true, code: true, name: true, symbol: true },
      orderBy: { code: 'asc' },
      take: limit,
    });

    return this.mapLookup(
      rows.map((row: any) => ({
        id: row.id,
        label: `${row.code || ''} - ${row.name || ''}`.trim(),
        subtitle: row.symbol || undefined,
      })),
    );
  }

  private async lookupLeads(user: AuthUser, q: string, limit: number) {
    const rows = await this.db.leads.findMany({
      where: {
        ...(q
          ? {
              OR: [{ name: this.searchContains(q) }, { email: this.searchContains(q) }],
            }
          : {}),
      },
      select: { id: true, name: true, email: true },
      orderBy: { updated_at: 'desc' },
      take: limit,
    });

    return this.mapLookup(rows.map((row: any) => ({ id: row.id, label: row.name, subtitle: row.email || undefined })));
  }

  private async lookupOpportunities(user: AuthUser, q: string, limit: number) {
    const rows = await this.db.opportunities.findMany({
      where: {
        ...(q ? { name: this.searchContains(q) } : {}),
      },
      select: { id: true, name: true, status: true },
      orderBy: { updated_at: 'desc' },
      take: limit,
    });

    return this.mapLookup(
      rows.map((row: any) => ({ id: row.id, label: row.name, subtitle: row.status || undefined })),
    );
  }

  private async lookupPriceTables(user: AuthUser, q: string, limit: number) {
    const rows = await this.db.price_tables.findMany({
      where: {
        ...(q
          ? {
              OR: [{ name: this.searchContains(q) }, { code: this.searchContains(q) }],
            }
          : {}),
      },
      select: { id: true, name: true, code: true },
      orderBy: { updated_at: 'desc' },
      take: limit,
    });

    return this.mapLookup(
      rows.map((row: any) => ({ id: row.id, label: row.name, subtitle: row.code || undefined })),
    );
  }

  private async lookupEventRelated(user: AuthUser, relatedTableRaw: string, q: string, limit: number) {
    const relatedTable = this.normalizeText(relatedTableRaw).toLowerCase();
    if (!relatedTable) {
      throw new BadRequestException('related_table é obrigatório para lookup event_related.');
    }

    switch (relatedTable) {
      case 'companies':
        return this.lookupCompanies(user, q, limit);
      case 'processes': {
        const rows = await this.db.processes.findMany({
          where: {
            ...(q
              ? {
                  OR: [
                    { process_number: this.searchContains(q) },
                    { invoice: this.searchContains(q) },
                  ],
                }
              : {}),
          },
          select: { id: true, process_number: true, invoice: true },
          orderBy: { created_on: 'desc' },
          take: limit,
        });
        return this.mapLookup(
          rows.map((row: any) => ({ id: row.id, label: row.process_number || row.id, subtitle: row.invoice || undefined })),
        );
      }
      case 'invoices': {
        const rows = await this.db.invoices.findMany({
          where: {
            ...(q ? { invoice_number: this.searchContains(q) } : {}),
          },
          select: { id: true, invoice_number: true },
          orderBy: { created_at: 'desc' },
          take: limit,
        });
        return this.mapLookup(rows.map((row: any) => ({ id: row.id, label: row.invoice_number || row.id })));
      }
      case 'leads':
        return this.lookupLeads(user, q, limit);
      case 'opportunities':
        return this.lookupOpportunities(user, q, limit);
      case 'contracts':
        return this.lookupContracts(user, q, limit);
      case 'incidents':
        return this.lookupIncidents(user, q, limit);
      default:
        throw new BadRequestException(`related_table não suportada: ${relatedTable}.`);
    }
  }
}
