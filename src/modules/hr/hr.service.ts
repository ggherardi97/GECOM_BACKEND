import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateHrCertificationDto,
  CreateHrDepartmentAssignmentDto,
  CreateHrDepartmentDto,
  CreateHrDocumentTypeDto,
  CreateHrEmployeeCertificationDto,
  CreateHrEmployeeDto,
  CreateHrEmployeeLifecycleDto,
  CreateHrEmployeeLifecycleTaskDto,
  CreateHrEmployeeScheduleAssignmentDto,
  CreateHrEmployeeSkillDto,
  CreateHrEmploymentStatusDto,
  CreateHrLeaveRequestDto,
  CreateHrLeaveTypeDto,
  CreateHrLifecycleStageDto,
  CreateHrLifecycleTaskDto,
  CreateHrLifecycleTemplateDto,
  CreateHrMaritalStatusDto,
  CreateHrPositionDto,
  CreateHrSkillCategoryDto,
  CreateHrSkillDto,
  CreateHrWorkLocationDto,
  CreateHrWorkScheduleDto,
  HrSetupDefaultsDto,
  MoveHrEmployeeLifecycleTaskDto,
  UpdateHrCertificationDto,
  UpdateHrDepartmentAssignmentDto,
  UpdateHrDepartmentDto,
  UpdateHrDocumentTypeDto,
  UpdateHrEmployeeCertificationDto,
  UpdateHrEmployeeDto,
  UpdateHrEmployeeLifecycleDto,
  UpdateHrEmployeeLifecycleTaskDto,
  UpdateHrEmployeeScheduleAssignmentDto,
  UpdateHrEmployeeSkillDto,
  UpdateHrEmploymentStatusDto,
  UpdateHrLeaveRequestDto,
  UpdateHrLeaveTypeDto,
  UpdateHrLifecycleStageDto,
  UpdateHrLifecycleTaskDto,
  UpdateHrLifecycleTemplateDto,
  UpdateHrMaritalStatusDto,
  UpdateHrPositionDto,
  UpdateHrSkillCategoryDto,
  UpdateHrSkillDto,
  UpdateHrWorkLocationDto,
  UpdateHrWorkScheduleDto,
} from './dto/hr.dto';

type AuthUser = {
  id: string;
  tenant_id: string;
  role?: string;
};

type ListQuery = {
  q?: string;
  is_active?: string;
  status?: string;
  department_id?: string;
  position_id?: string;
  work_location_id?: string;
  manager_employee_id?: string;
  employee_id?: string;
  employment_status_id?: string;
  marital_status_id?: string;
  document_type_id?: string;
  work_schedule_id?: string;
  leave_type_id?: string;
  approver_employee_id?: string;
  category_id?: string;
  skill_id?: string;
  certification_id?: string;
  employee_lifecycle_id?: string;
  template_id?: string;
  stage_id?: string;
  current_stage_id?: string;
  template_task_id?: string;
  responsible_employee_id?: string;
  type?: string;
  page?: string;
  page_size?: string;
};

type ResourceConfig = {
  key: string;
  delegate: string;
  searchFields?: string[];
  orderBy?: any[];
  include?: any;
  softDelete?: boolean;
  sensitive?: boolean;
  filters?: Array<keyof ListQuery>;
  parseCreate?: (dto: Record<string, any>, user: AuthUser) => Promise<Record<string, any>>;
  parseUpdate?: (dto: Record<string, any>, user: AuthUser, id: string) => Promise<Record<string, any>>;
};

@Injectable()
export class HrService {
  private readonly sensitiveWriteKeys = new Set<string>([
    'departments',
    'positions',
    'work-locations',
    'employment-statuses',
    'document-types',
    'marital-statuses',
    'work-schedules',
    'leave-types',
    'skill-categories',
    'skills',
    'certifications',
    'lifecycle-templates',
    'lifecycle-stages',
    'lifecycle-tasks',
  ]);

  private readonly baseInclude = {
    deleted_at: null,
  };

  constructor(private readonly prisma: PrismaService) {}

  private get db(): any {
    return this.prisma.raw;
  }

  private getRole(user: AuthUser): string {
    return String(user.role || '').trim().toUpperCase();
  }

  private assertCanWrite(user: AuthUser, resourceKey: string) {
    if (!this.sensitiveWriteKeys.has(resourceKey)) return;
    const role = this.getRole(user);
    if (role === 'ADMIN' || role === 'MANAGER') return;
    throw new ForbiddenException('Voce nao possui permissao para alterar este cadastro.');
  }

  private parseOptionalBoolean(value?: string): boolean | undefined {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return undefined;
    if (['1', 'true', 't', 'yes', 'sim', 'y', 's'].includes(raw)) return true;
    if (['0', 'false', 'f', 'no', 'nao', 'n'].includes(raw)) return false;
    return undefined;
  }

  private toDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private toDateOnly(value: string | Date | null | undefined): Date | null {
    const d = this.toDate(value);
    if (!d) return null;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  private toInt(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.trunc(n);
  }

  private toDecimal(value: unknown): Prisma.Decimal | null {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return new Prisma.Decimal(n);
  }

  private trimPayload(input: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    Object.entries(input || {}).forEach(([key, value]) => {
      if (value === undefined) return;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        out[key] = trimmed === '' ? null : trimmed;
        return;
      }
      out[key] = value;
    });
    return out;
  }

  private getDelegate(name: string): any {
    const delegate = (this.db as any)?.[name];
    if (!delegate) throw new NotFoundException(`Delegate nao encontrado: ${name}`);
    return delegate;
  }

  private normalizePagination(query: ListQuery) {
    const pageSize = Math.min(Math.max(this.toInt(query.page_size || '50') || 50, 1), 200);
    const page = Math.max(this.toInt(query.page || '1') || 1, 1);
    return {
      page,
      pageSize,
      skip: (page - 1) * pageSize,
      take: pageSize,
    };
  }

  private buildTextFilter(searchFields: string[] | undefined, q: string | undefined): any {
    const term = String(q || '').trim();
    if (!term || !(searchFields || []).length) return {};

    return {
      OR: (searchFields || []).map((field) => ({
        [field]: {
          contains: term,
          mode: 'insensitive',
        },
      })),
    };
  }

  private buildGenericWhere(query: ListQuery, config: ResourceConfig) {
    const active = this.parseOptionalBoolean(query.is_active);
    const where: Record<string, any> = {
      ...this.baseInclude,
      ...(active === undefined ? {} : { is_active: active }),
      ...this.buildTextFilter(config.searchFields, query.q),
    };

    for (const key of config.filters || []) {
      const value = String((query as any)?.[key] || '').trim();
      if (!value) continue;
      if (key === 'status') where.status = value;
      if (key === 'department_id') where.department_id = value;
      if (key === 'position_id') where.position_id = value;
      if (key === 'work_location_id') where.work_location_id = value;
      if (key === 'manager_employee_id') where.manager_employee_id = value;
      if (key === 'employee_id') where.employee_id = value;
      if (key === 'employment_status_id') where.employment_status_id = value;
      if (key === 'marital_status_id') where.marital_status_id = value;
      if (key === 'document_type_id') where.document_type_id = value;
      if (key === 'work_schedule_id') where.work_schedule_id = value;
      if (key === 'leave_type_id') where.leave_type_id = value;
      if (key === 'approver_employee_id') where.approver_employee_id = value;
      if (key === 'category_id') where.category_id = value;
      if (key === 'skill_id') where.skill_id = value;
      if (key === 'certification_id') where.certification_id = value;
      if (key === 'employee_lifecycle_id') where.employee_lifecycle_id = value;
      if (key === 'template_id') where.template_id = value;
      if (key === 'stage_id') where.stage_id = value;
      if (key === 'current_stage_id') where.current_stage_id = value;
      if (key === 'template_task_id') where.template_task_id = value;
      if (key === 'responsible_employee_id') where.responsible_employee_id = value;
      if (key === 'type') where.type = value;
    }

    return where;
  }

  private mapCommonCreateData(dto: Record<string, any>): Record<string, any> {
    const data = this.trimPayload(dto);

    if (typeof data.code === 'string') {
      const normalized = String(data.code || '').trim().toUpperCase();
      data.code = normalized || null;
    }

    const dateFields = [
      'birth_date',
      'start_date',
      'end_date',
      'issued_at',
      'expires_at',
      'target_end_date',
      'due_date',
    ];

    for (const field of dateFields) {
      if (data[field] !== undefined) data[field] = this.toDateOnly(data[field]);
    }

    if (data.start_datetime !== undefined) data.start_datetime = this.toDate(data.start_datetime);
    if (data.end_datetime !== undefined) data.end_datetime = this.toDate(data.end_datetime);
    if (data.decided_at !== undefined) data.decided_at = this.toDate(data.decided_at);
    if (data.completed_at !== undefined) data.completed_at = this.toDate(data.completed_at);

    const intFields = [
      'level',
      'sort_order',
      'weekly_minutes',
      'max_days_per_year',
      'years_experience',
      'validity_months',
      'due_days_after_start',
      'wip_limit',
      'sort_order',
      'duration_minutes',
    ];
    for (const field of intFields) {
      if (data[field] !== undefined) data[field] = this.toInt(data[field]);
    }

    return data;
  }

  private isPrismaUniqueConstraintError(error: any): boolean {
    return String(error?.code || '') === 'P2002';
  }

  private parseUniqueConstraintFields(error: any): string[] {
    const raw = error?.meta?.target;
    if (Array.isArray(raw)) {
      return raw.map((item) => String(item || '').trim()).filter(Boolean);
    }

    const text = String(raw || '').trim();
    if (!text) return [];

    const paren = text.match(/\(([^)]+)\)/);
    const source = paren?.[1] || text;
    return source
      .split(',')
      .map((part) => part.replace(/[`"'()\s]/g, '').trim())
      .filter(Boolean);
  }

  private humanizeUniqueField(field: string): string {
    const key = String(field || '').trim().toLowerCase();
    if (key === 'code') return 'codigo';
    if (key === 'name') return 'nome';
    if (key === 'tenant_id') return 'tenant';
    return key;
  }

  private buildUniqueConstraintMessage(config: ResourceConfig, data: Record<string, any>, error: any): string {
    const allFields = this.parseUniqueConstraintFields(error);
    const fields = allFields.filter((field) => String(field || '').trim().toLowerCase() !== 'tenant_id');

    if (!fields.length) {
      return `Ja existe um registro duplicado para ${config.key}.`;
    }

    if (fields.length === 1) {
      const field = fields[0];
      const value = this.trimPayload({ value: data?.[field] })?.value;
      const human = this.humanizeUniqueField(field);

      if (value == null || String(value).trim() === '') {
        return `Ja existe um registro com este ${human}.`;
      }

      return `Ja existe um registro com ${human} "${String(value)}".`;
    }

    const humanFields = fields.map((field) => this.humanizeUniqueField(field)).join(', ');
    return `Ja existe um registro com combinacao duplicada: ${humanFields}.`;
  }

  private readonly resources: Record<string, ResourceConfig> = {
    departments: {
      key: 'departments',
      delegate: 'hr_departments',
      searchFields: ['name', 'code', 'description'],
      orderBy: [{ name: 'asc' }],
      include: {
        parent: { select: { id: true, name: true, code: true } },
        manager: { select: { id: true, full_name: true, employee_number: true } },
      },
      softDelete: true,
      sensitive: true,
    },
    positions: {
      key: 'positions',
      delegate: 'hr_positions',
      searchFields: ['name', 'code', 'description'],
      orderBy: [{ name: 'asc' }],
      softDelete: true,
      sensitive: true,
      filters: ['is_active'],
    },
    'work-locations': {
      key: 'work-locations',
      delegate: 'hr_work_locations',
      searchFields: ['name', 'code'],
      orderBy: [{ name: 'asc' }],
      softDelete: true,
      sensitive: true,
      filters: ['is_active'],
    },
    'employment-statuses': {
      key: 'employment-statuses',
      delegate: 'hr_employment_statuses',
      searchFields: ['name', 'code'],
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      softDelete: true,
      sensitive: true,
      filters: ['is_active'],
    },
    'document-types': {
      key: 'document-types',
      delegate: 'hr_document_types',
      searchFields: ['name', 'code'],
      orderBy: [{ name: 'asc' }],
      softDelete: true,
      sensitive: true,
      filters: ['is_active'],
    },
    'marital-statuses': {
      key: 'marital-statuses',
      delegate: 'hr_marital_statuses',
      searchFields: ['name', 'code'],
      orderBy: [{ name: 'asc' }],
      softDelete: true,
      sensitive: true,
      filters: ['is_active'],
    },
    employees: {
      key: 'employees',
      delegate: 'hr_employees',
      searchFields: ['employee_number', 'full_name', 'preferred_name', 'email_work', 'document_number'],
      orderBy: [{ full_name: 'asc' }],
      include: {
        employment_status: { select: { id: true, name: true, code: true, color: true } },
        marital_status: { select: { id: true, name: true, code: true } },
        document_type: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, full_name: true, email: true } },
        assignments: {
          where: { deleted_at: null, end_date: null },
          orderBy: [{ start_date: 'desc' }],
          take: 1,
          include: {
            department: { select: { id: true, name: true, code: true } },
            position: { select: { id: true, name: true, code: true } },
            manager_employee: { select: { id: true, full_name: true } },
          },
        },
      },
      softDelete: true,
      filters: ['is_active', 'status'],
    },
    assignments: {
      key: 'assignments',
      delegate: 'hr_department_assignments',
      orderBy: [{ start_date: 'desc' }],
      include: {
        employee: { select: { id: true, full_name: true, employee_number: true } },
        department: { select: { id: true, name: true, code: true } },
        position: { select: { id: true, name: true, code: true } },
        manager_employee: { select: { id: true, full_name: true } },
        work_location: { select: { id: true, name: true, code: true } },
      },
      softDelete: true,
      filters: ['employee_id', 'department_id', 'position_id', 'work_location_id', 'manager_employee_id'],
    },
    'work-schedules': {
      key: 'work-schedules',
      delegate: 'hr_work_schedules',
      searchFields: ['name'],
      orderBy: [{ is_default: 'desc' }, { name: 'asc' }],
      softDelete: true,
      sensitive: true,
      filters: ['is_active'],
    },
    'employee-schedule-assignments': {
      key: 'employee-schedule-assignments',
      delegate: 'hr_employee_schedule_assignments',
      orderBy: [{ start_date: 'desc' }],
      include: {
        employee: { select: { id: true, full_name: true, employee_number: true } },
        work_schedule: { select: { id: true, name: true } },
      },
      softDelete: true,
      filters: ['employee_id', 'work_schedule_id'],
    },
    'leave-types': {
      key: 'leave-types',
      delegate: 'hr_leave_types',
      searchFields: ['name', 'code'],
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      softDelete: true,
      sensitive: true,
      filters: ['is_active'],
    },
    'leave-requests': {
      key: 'leave-requests',
      delegate: 'hr_leave_requests',
      orderBy: [{ start_datetime: 'desc' }],
      include: {
        employee: { select: { id: true, full_name: true, employee_number: true } },
        leave_type: { select: { id: true, name: true, code: true, color: true } },
        approver_employee: { select: { id: true, full_name: true } },
      },
      softDelete: true,
      filters: ['employee_id', 'status', 'leave_type_id', 'approver_employee_id'],
    },
    'skill-categories': {
      key: 'skill-categories',
      delegate: 'hr_skill_categories',
      searchFields: ['name'],
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      softDelete: true,
      sensitive: true,
      filters: ['is_active'],
    },
    skills: {
      key: 'skills',
      delegate: 'hr_skills',
      searchFields: ['name', 'description'],
      orderBy: [{ name: 'asc' }],
      include: {
        category: { select: { id: true, name: true } },
      },
      softDelete: true,
      sensitive: true,
      filters: ['is_active', 'category_id'],
    },
    'employee-skills': {
      key: 'employee-skills',
      delegate: 'hr_employee_skills',
      orderBy: [{ updated_at: 'desc' }],
      include: {
        employee: { select: { id: true, full_name: true, employee_number: true } },
        skill: { select: { id: true, name: true } },
      },
      softDelete: true,
      filters: ['employee_id', 'skill_id'],
    },
    certifications: {
      key: 'certifications',
      delegate: 'hr_certifications',
      searchFields: ['name', 'issuer', 'description'],
      orderBy: [{ name: 'asc' }],
      softDelete: true,
      sensitive: true,
      filters: ['is_active'],
    },
    'employee-certifications': {
      key: 'employee-certifications',
      delegate: 'hr_employee_certifications',
      orderBy: [{ updated_at: 'desc' }],
      include: {
        employee: { select: { id: true, full_name: true, employee_number: true } },
        certification: { select: { id: true, name: true, issuer: true } },
      },
      softDelete: true,
      filters: ['employee_id', 'status', 'certification_id'],
    },
    'lifecycle-templates': {
      key: 'lifecycle-templates',
      delegate: 'hr_lifecycle_templates',
      searchFields: ['name', 'description'],
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { stages: true, tasks: true, employee_instances: true } },
      },
      softDelete: true,
      sensitive: true,
      filters: ['is_active', 'type'],
    },
    'lifecycle-stages': {
      key: 'lifecycle-stages',
      delegate: 'hr_lifecycle_stages',
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      include: {
        template: { select: { id: true, name: true, type: true } },
      },
      softDelete: true,
      sensitive: true,
      filters: ['template_id', 'is_active'],
    },
    'lifecycle-tasks': {
      key: 'lifecycle-tasks',
      delegate: 'hr_lifecycle_tasks',
      orderBy: [{ sort_order: 'asc' }, { title: 'asc' }],
      include: {
        template: { select: { id: true, name: true, type: true } },
        stage: { select: { id: true, name: true, sort_order: true } },
      },
      softDelete: true,
      sensitive: true,
      filters: ['template_id', 'is_active', 'stage_id'],
    },
    'employee-lifecycles': {
      key: 'employee-lifecycles',
      delegate: 'hr_employee_lifecycles',
      orderBy: [{ start_date: 'desc' }],
      include: {
        employee: { select: { id: true, full_name: true, employee_number: true } },
        template: { select: { id: true, name: true, type: true } },
        current_stage: { select: { id: true, name: true, sort_order: true } },
        _count: { select: { tasks: true } },
      },
      softDelete: true,
      filters: ['employee_id', 'status', 'template_id', 'current_stage_id'],
    },
    'employee-lifecycle-tasks': {
      key: 'employee-lifecycle-tasks',
      delegate: 'hr_employee_lifecycle_tasks',
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      include: {
        employee_lifecycle: {
          select: {
            id: true,
            employee_id: true,
            template_id: true,
            status: true,
          },
        },
        stage: { select: { id: true, name: true, sort_order: true } },
        responsible_employee: { select: { id: true, full_name: true } },
        template_task: { select: { id: true, title: true } },
      },
      softDelete: true,
      filters: ['employee_lifecycle_id', 'status', 'stage_id', 'template_task_id', 'responsible_employee_id'],
    },
  };

  private getResourceConfig(resourceKey: string): ResourceConfig {
    const config = this.resources[String(resourceKey || '').trim()];
    if (!config) {
      throw new NotFoundException('Recurso RH nao encontrado');
    }
    return config;
  }

  private async listByConfig(user: AuthUser, config: ResourceConfig, query: ListQuery = {}) {
    const delegate = this.getDelegate(config.delegate);
    const { page, pageSize, skip, take } = this.normalizePagination(query);

    const where = this.buildGenericWhere(query, config);
    const [items, total] = await Promise.all([
      delegate.findMany({
        where: {
          tenant_id: user.tenant_id,
          ...where,
        },
        include: config.include,
        orderBy: config.orderBy?.length ? config.orderBy : [{ updated_at: 'desc' }],
        skip,
        take,
      }),
      delegate.count({
        where: {
          tenant_id: user.tenant_id,
          ...where,
        },
      }),
    ]);

    return {
      items,
      total,
      page,
      page_size: pageSize,
    };
  }

  private async findByIdConfig(user: AuthUser, config: ResourceConfig, id: string) {
    const delegate = this.getDelegate(config.delegate);
    const row = await delegate.findFirst({
      where: {
        tenant_id: user.tenant_id,
        id,
        ...(config.softDelete === false ? {} : this.baseInclude),
      },
      include: config.include,
    });
    if (!row) throw new NotFoundException('Registro nao encontrado');
    return row;
  }

  private async createByConfig(user: AuthUser, config: ResourceConfig, dto: Record<string, any>) {
    if (config.sensitive) this.assertCanWrite(user, config.key);
    const delegate = this.getDelegate(config.delegate);

    let data = this.mapCommonCreateData(dto);
    if (config.parseCreate) data = await config.parseCreate(data, user);
    const payload = {
      ...data,
      tenant_id: user.tenant_id,
    };

    try {
      const created = await delegate.create({
        data: payload,
      });
      return this.findByIdConfig(user, config, created.id);
    } catch (error: any) {
      if (this.isPrismaUniqueConstraintError(error)) {
        throw new BadRequestException(this.buildUniqueConstraintMessage(config, payload, error));
      }
      throw error;
    }
  }

  private async updateByConfig(user: AuthUser, config: ResourceConfig, id: string, dto: Record<string, any>) {
    if (config.sensitive) this.assertCanWrite(user, config.key);
    await this.findByIdConfig(user, config, id);

    const delegate = this.getDelegate(config.delegate);

    let data = this.mapCommonCreateData(dto);
    if (config.parseUpdate) data = await config.parseUpdate(data, user, id);
    const payload = {
      ...data,
      updated_at: new Date(),
    };

    try {
      await delegate.updateMany({
        where: {
          tenant_id: user.tenant_id,
          id,
          ...(config.softDelete === false ? {} : this.baseInclude),
        },
        data: payload,
      });
      return this.findByIdConfig(user, config, id);
    } catch (error: any) {
      if (this.isPrismaUniqueConstraintError(error)) {
        throw new BadRequestException(this.buildUniqueConstraintMessage(config, payload, error));
      }
      throw error;
    }
  }

  private async deleteByConfig(user: AuthUser, config: ResourceConfig, id: string) {
    if (config.sensitive) this.assertCanWrite(user, config.key);
    const current = await this.findByIdConfig(user, config, id);
    const delegate = this.getDelegate(config.delegate);

    if (config.softDelete === false) {
      await delegate.deleteMany({ where: { tenant_id: user.tenant_id, id } });
    } else {
      await delegate.updateMany({
        where: {
          tenant_id: user.tenant_id,
          id,
          ...this.baseInclude,
        },
        data: {
          deleted_at: new Date(),
          updated_at: new Date(),
        },
      });
    }

    return current;
  }

  async listResource(user: AuthUser, resourceKey: string, query: ListQuery) {
    const config = this.getResourceConfig(resourceKey);
    return this.listByConfig(user, config, query);
  }

  async findResourceById(user: AuthUser, resourceKey: string, id: string) {
    const config = this.getResourceConfig(resourceKey);
    return this.findByIdConfig(user, config, id);
  }

  async createResource(user: AuthUser, resourceKey: string, dto: Record<string, any>) {
    const config = this.getResourceConfig(resourceKey);
    return this.createByConfig(user, config, dto);
  }

  async updateResource(user: AuthUser, resourceKey: string, id: string, dto: Record<string, any>) {
    const config = this.getResourceConfig(resourceKey);
    return this.updateByConfig(user, config, id, dto);
  }

  async removeResource(user: AuthUser, resourceKey: string, id: string) {
    const config = this.getResourceConfig(resourceKey);
    return this.deleteByConfig(user, config, id);
  }

  private async assertActiveAssignmentUnique(tenantId: string, employeeId: string, endDate: Date | null, excludeId?: string) {
    if (endDate) return;

    const current = await this.db.hr_department_assignments.findFirst({
      where: {
        tenant_id: tenantId,
        employee_id: employeeId,
        end_date: null,
        deleted_at: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (current) {
      throw new BadRequestException('Este colaborador ja possui alocacao ativa. Finalize a atual antes de criar outra.');
    }
  }

  private calculateDurationMinutes(start: Date, end: Date): number {
    const diffMs = end.getTime() - start.getTime();
    if (diffMs <= 0) {
      throw new BadRequestException('Periodo da ausencia invalido. Data final deve ser maior que a inicial.');
    }
    return Math.max(1, Math.round(diffMs / 60000));
  }

  private async assertLeaveNoOverlapApproved(
    tenantId: string,
    employeeId: string,
    start: Date,
    end: Date,
    excludeId?: string,
  ) {
    const conflict = await this.db.hr_leave_requests.findFirst({
      where: {
        tenant_id: tenantId,
        employee_id: employeeId,
        status: 'APPROVED',
        deleted_at: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        AND: [{ start_datetime: { lte: end } }, { end_datetime: { gte: start } }],
      },
      select: {
        id: true,
        start_datetime: true,
        end_datetime: true,
      },
    });

    if (conflict) {
      throw new BadRequestException('Existe ausencia aprovada em conflito de periodo para este colaborador.');
    }
  }

  private resolveCertificationStatusByDate(expiresAt?: Date | null): 'VALID' | 'EXPIRED' {
    if (!expiresAt) return 'VALID';
    const now = new Date();
    if (expiresAt.getTime() < now.getTime()) return 'EXPIRED';
    return 'VALID';
  }

  private async instantiateLifecycleTasks(user: AuthUser, lifecycleId: string, templateId: string, startDate: Date, fallbackStageId: string | null) {
    const templateTasks = await this.db.hr_lifecycle_tasks.findMany({
      where: {
        tenant_id: user.tenant_id,
        template_id: templateId,
        is_active: true,
        deleted_at: null,
      },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });

    if (!templateTasks.length) return;

    const data = templateTasks.map((task, index) => {
      const dueDate =
        task.due_days_after_start == null
          ? null
          : new Date(startDate.getTime() + Number(task.due_days_after_start || 0) * 24 * 60 * 60 * 1000);

      return {
        tenant_id: user.tenant_id,
        employee_lifecycle_id: lifecycleId,
        template_task_id: task.id,
        stage_id: task.stage_id || fallbackStageId,
        title: task.title,
        description: task.description || null,
        due_date: dueDate,
        status: 'OPEN',
        sort_order: task.sort_order ?? index,
      };
    });

    await this.db.hr_employee_lifecycle_tasks.createMany({ data });
  }

  private normalizeOptionCode(value: unknown): string {
    return String(value || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_')
      .replace(/[^A-Z0-9_]/g, '');
  }

  private async seedHrEmploymentStatusesFromOptionSetIfEmpty(user: AuthUser): Promise<void> {
    const hasRows = await this.db.hr_employment_statuses.count({
      where: { tenant_id: user.tenant_id, deleted_at: null },
    });
    if (hasRows > 0) return;

    const set = await this.db.option_sets.findFirst({
      where: {
        tenant_id: user.tenant_id,
        entity: 'hr_employees',
        field: 'employment_status_id',
      },
      include: {
        options: {
          orderBy: [{ sort_order: 'asc' }, { label: 'asc' }],
        },
      },
    });
    const options = Array.isArray(set?.options) ? set.options : [];
    if (!options.length) return;

    const usedCodes = new Set<string>();
    const rows = options
      .map((option: any, idx: number) => {
        const code = this.normalizeOptionCode(option?.value);
        const name = String(option?.label || '').trim();
        if (!code || !name) return null;
        if (code.length > 40 || name.length > 120) return null;
        if (usedCodes.has(code)) return null;
        usedCodes.add(code);
        return {
          tenant_id: user.tenant_id,
          code,
          name,
          color: String(option?.color || '').trim().slice(0, 20) || null,
          sort_order: this.toInt(option?.sort_order) ?? (idx + 1) * 10,
          is_active: !!option?.is_active,
          is_default: false,
        };
      })
      .filter((row): row is Record<string, any> => !!row);

    if (!rows.length) return;
    await this.db.hr_employment_statuses.createMany({ data: rows, skipDuplicates: true });
  }

  private async seedHrSimpleLookupFromOptionSetIfEmpty(
    user: AuthUser,
    field: 'document_type_id' | 'marital_status_id',
    delegate: 'hr_document_types' | 'hr_marital_statuses',
  ): Promise<void> {
    const hasRows = await this.db[delegate].count({
      where: { tenant_id: user.tenant_id, deleted_at: null },
    });
    if (hasRows > 0) return;

    const set = await this.db.option_sets.findFirst({
      where: {
        tenant_id: user.tenant_id,
        entity: 'hr_employees',
        field,
      },
      include: {
        options: {
          orderBy: [{ sort_order: 'asc' }, { label: 'asc' }],
        },
      },
    });
    const options = Array.isArray(set?.options) ? set.options : [];
    if (!options.length) return;

    const usedCodes = new Set<string>();
    const rows = options
      .map((option: any) => {
        const code = this.normalizeOptionCode(option?.value);
        const name = String(option?.label || '').trim();
        if (!code || !name) return null;
        if (code.length > 40 || name.length > 120) return null;
        if (usedCodes.has(code)) return null;
        usedCodes.add(code);
        return {
          tenant_id: user.tenant_id,
          code,
          name,
          is_active: !!option?.is_active,
        };
      })
      .filter((row): row is Record<string, any> => !!row);

    if (!rows.length) return;
    await this.db[delegate].createMany({ data: rows, skipDuplicates: true });
  }

  // Typed wrappers (explicit CRUD signatures for controller)
  listDepartments(user: AuthUser, query: ListQuery) { return this.listResource(user, 'departments', query); }
  findDepartmentById(user: AuthUser, id: string) { return this.findResourceById(user, 'departments', id); }
  createDepartment(user: AuthUser, dto: CreateHrDepartmentDto) { return this.createResource(user, 'departments', dto as any); }
  updateDepartment(user: AuthUser, id: string, dto: UpdateHrDepartmentDto) { return this.updateResource(user, 'departments', id, dto as any); }
  removeDepartment(user: AuthUser, id: string) { return this.removeResource(user, 'departments', id); }

  listPositions(user: AuthUser, query: ListQuery) { return this.listResource(user, 'positions', query); }
  findPositionById(user: AuthUser, id: string) { return this.findResourceById(user, 'positions', id); }
  createPosition(user: AuthUser, dto: CreateHrPositionDto) { return this.createResource(user, 'positions', dto as any); }
  updatePosition(user: AuthUser, id: string, dto: UpdateHrPositionDto) { return this.updateResource(user, 'positions', id, dto as any); }
  removePosition(user: AuthUser, id: string) { return this.removeResource(user, 'positions', id); }

  listWorkLocations(user: AuthUser, query: ListQuery) { return this.listResource(user, 'work-locations', query); }
  findWorkLocationById(user: AuthUser, id: string) { return this.findResourceById(user, 'work-locations', id); }
  createWorkLocation(user: AuthUser, dto: CreateHrWorkLocationDto) { return this.createResource(user, 'work-locations', dto as any); }
  updateWorkLocation(user: AuthUser, id: string, dto: UpdateHrWorkLocationDto) { return this.updateResource(user, 'work-locations', id, dto as any); }
  removeWorkLocation(user: AuthUser, id: string) { return this.removeResource(user, 'work-locations', id); }

  async listEmploymentStatuses(user: AuthUser, query: ListQuery) {
    await this.seedHrEmploymentStatusesFromOptionSetIfEmpty(user);
    return this.listResource(user, 'employment-statuses', query);
  }
  findEmploymentStatusById(user: AuthUser, id: string) { return this.findResourceById(user, 'employment-statuses', id); }
  createEmploymentStatus(user: AuthUser, dto: CreateHrEmploymentStatusDto) { return this.createResource(user, 'employment-statuses', dto as any); }
  updateEmploymentStatus(user: AuthUser, id: string, dto: UpdateHrEmploymentStatusDto) { return this.updateResource(user, 'employment-statuses', id, dto as any); }
  removeEmploymentStatus(user: AuthUser, id: string) { return this.removeResource(user, 'employment-statuses', id); }

  async listDocumentTypes(user: AuthUser, query: ListQuery) {
    await this.seedHrSimpleLookupFromOptionSetIfEmpty(user, 'document_type_id', 'hr_document_types');
    return this.listResource(user, 'document-types', query);
  }
  findDocumentTypeById(user: AuthUser, id: string) { return this.findResourceById(user, 'document-types', id); }
  createDocumentType(user: AuthUser, dto: CreateHrDocumentTypeDto) { return this.createResource(user, 'document-types', dto as any); }
  updateDocumentType(user: AuthUser, id: string, dto: UpdateHrDocumentTypeDto) { return this.updateResource(user, 'document-types', id, dto as any); }
  removeDocumentType(user: AuthUser, id: string) { return this.removeResource(user, 'document-types', id); }

  async listMaritalStatuses(user: AuthUser, query: ListQuery) {
    await this.seedHrSimpleLookupFromOptionSetIfEmpty(user, 'marital_status_id', 'hr_marital_statuses');
    return this.listResource(user, 'marital-statuses', query);
  }
  findMaritalStatusById(user: AuthUser, id: string) { return this.findResourceById(user, 'marital-statuses', id); }
  createMaritalStatus(user: AuthUser, dto: CreateHrMaritalStatusDto) { return this.createResource(user, 'marital-statuses', dto as any); }
  updateMaritalStatus(user: AuthUser, id: string, dto: UpdateHrMaritalStatusDto) { return this.updateResource(user, 'marital-statuses', id, dto as any); }
  removeMaritalStatus(user: AuthUser, id: string) { return this.removeResource(user, 'marital-statuses', id); }

  listEmployees(user: AuthUser, query: ListQuery) {
    const active = this.parseOptionalBoolean(query.is_active);
    const q = String(query.q || '').trim();
    const status = String(query.status || '').trim();
    const { page, pageSize, skip, take } = this.normalizePagination(query);

    const clauses: any[] = [];
    if (status) {
      clauses.push({
        OR: [{ employment_status_id: status }, { employment_status: { code: status } }],
      });
    }
    if (q) {
      clauses.push({
        OR: [
          { employee_number: { contains: q, mode: 'insensitive' } },
          { full_name: { contains: q, mode: 'insensitive' } },
          { preferred_name: { contains: q, mode: 'insensitive' } },
          { email_work: { contains: q, mode: 'insensitive' } },
          { document_number: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    const where: any = {
      tenant_id: user.tenant_id,
      deleted_at: null,
      ...(active === undefined ? {} : { is_active: active }),
      ...(String(query.employment_status_id || '').trim()
        ? { employment_status_id: String(query.employment_status_id).trim() }
        : {}),
      ...(String(query.marital_status_id || '').trim()
        ? { marital_status_id: String(query.marital_status_id).trim() }
        : {}),
      ...(String(query.document_type_id || '').trim()
        ? { document_type_id: String(query.document_type_id).trim() }
        : {}),
      ...(clauses.length ? { AND: clauses } : {}),
    };

    return Promise.all([
      this.db.hr_employees.findMany({
        where,
        include: this.resources.employees.include,
        orderBy: [{ full_name: 'asc' }],
        skip,
        take,
      }),
      this.db.hr_employees.count({ where }),
    ]).then(([items, total]) => ({
      items,
      total,
      page,
      page_size: pageSize,
    }));
  }

  findEmployeeById(user: AuthUser, id: string) { return this.findResourceById(user, 'employees', id); }

  async createEmployee(user: AuthUser, dto: CreateHrEmployeeDto) {
    return this.createResource(user, 'employees', {
      ...dto,
      employment_status_id: dto.employment_status_id,
    } as any);
  }

  updateEmployee(user: AuthUser, id: string, dto: UpdateHrEmployeeDto) {
    return this.updateResource(user, 'employees', id, dto as any);
  }

  removeEmployee(user: AuthUser, id: string) { return this.removeResource(user, 'employees', id); }

  async listAssignments(user: AuthUser, query: ListQuery) {
    return this.listResource(user, 'assignments', query);
  }

  async findAssignmentById(user: AuthUser, id: string) {
    return this.findResourceById(user, 'assignments', id);
  }

  async createAssignment(user: AuthUser, dto: CreateHrDepartmentAssignmentDto) {
    const endDate = this.toDateOnly(dto.end_date);
    await this.assertActiveAssignmentUnique(user.tenant_id, dto.employee_id, endDate);
    return this.createResource(user, 'assignments', dto as any);
  }

  async updateAssignment(user: AuthUser, id: string, dto: UpdateHrDepartmentAssignmentDto) {
    const existing = await this.findAssignmentById(user, id);
    const employeeId = String(dto.employee_id || existing.employee_id);
    const endDate = this.toDateOnly(dto.end_date !== undefined ? dto.end_date : existing.end_date);
    await this.assertActiveAssignmentUnique(user.tenant_id, employeeId, endDate, id);
    return this.updateResource(user, 'assignments', id, dto as any);
  }

  removeAssignment(user: AuthUser, id: string) { return this.removeResource(user, 'assignments', id); }

  listWorkSchedules(user: AuthUser, query: ListQuery) { return this.listResource(user, 'work-schedules', query); }
  findWorkScheduleById(user: AuthUser, id: string) { return this.findResourceById(user, 'work-schedules', id); }
  createWorkSchedule(user: AuthUser, dto: CreateHrWorkScheduleDto) {
    return this.createResource(user, 'work-schedules', {
      ...dto,
      schedule_json:
        dto.schedule_json && typeof dto.schedule_json === 'object'
          ? dto.schedule_json
          : {
              mon: { start: '09:00', end: '18:00', break: 60 },
              tue: { start: '09:00', end: '18:00', break: 60 },
              wed: { start: '09:00', end: '18:00', break: 60 },
              thu: { start: '09:00', end: '18:00', break: 60 },
              fri: { start: '09:00', end: '18:00', break: 60 },
            },
    } as any);
  }
  updateWorkSchedule(user: AuthUser, id: string, dto: UpdateHrWorkScheduleDto) { return this.updateResource(user, 'work-schedules', id, dto as any); }
  removeWorkSchedule(user: AuthUser, id: string) { return this.removeResource(user, 'work-schedules', id); }

  listEmployeeScheduleAssignments(user: AuthUser, query: ListQuery) { return this.listResource(user, 'employee-schedule-assignments', query); }
  findEmployeeScheduleAssignmentById(user: AuthUser, id: string) { return this.findResourceById(user, 'employee-schedule-assignments', id); }
  createEmployeeScheduleAssignment(user: AuthUser, dto: CreateHrEmployeeScheduleAssignmentDto) { return this.createResource(user, 'employee-schedule-assignments', dto as any); }
  updateEmployeeScheduleAssignment(user: AuthUser, id: string, dto: UpdateHrEmployeeScheduleAssignmentDto) { return this.updateResource(user, 'employee-schedule-assignments', id, dto as any); }
  removeEmployeeScheduleAssignment(user: AuthUser, id: string) { return this.removeResource(user, 'employee-schedule-assignments', id); }

  listLeaveTypes(user: AuthUser, query: ListQuery) { return this.listResource(user, 'leave-types', query); }
  findLeaveTypeById(user: AuthUser, id: string) { return this.findResourceById(user, 'leave-types', id); }
  createLeaveType(user: AuthUser, dto: CreateHrLeaveTypeDto) { return this.createResource(user, 'leave-types', dto as any); }
  updateLeaveType(user: AuthUser, id: string, dto: UpdateHrLeaveTypeDto) { return this.updateResource(user, 'leave-types', id, dto as any); }
  removeLeaveType(user: AuthUser, id: string) { return this.removeResource(user, 'leave-types', id); }

  listLeaveRequests(user: AuthUser, query: ListQuery) {
    return this.listResource(user, 'leave-requests', query);
  }

  findLeaveRequestById(user: AuthUser, id: string) {
    return this.findResourceById(user, 'leave-requests', id);
  }

  async createLeaveRequest(user: AuthUser, dto: CreateHrLeaveRequestDto) {
    const start = this.toDate(dto.start_datetime);
    const end = this.toDate(dto.end_datetime);
    if (!start || !end) throw new BadRequestException('Datas de ausencia invalidas.');

    await this.assertLeaveNoOverlapApproved(user.tenant_id, dto.employee_id, start, end);

    const durationMinutes = this.calculateDurationMinutes(start, end);
    const status = String(dto.status || 'DRAFT').toUpperCase();

    return this.createResource(user, 'leave-requests', {
      ...dto,
      status,
      duration_minutes: durationMinutes,
    } as any);
  }

  async updateLeaveRequest(user: AuthUser, id: string, dto: UpdateHrLeaveRequestDto) {
    const existing = await this.findLeaveRequestById(user, id);

    const start = this.toDate(dto.start_datetime ?? existing.start_datetime);
    const end = this.toDate(dto.end_datetime ?? existing.end_datetime);
    if (!start || !end) throw new BadRequestException('Datas de ausencia invalidas.');

    const employeeId = String(dto.employee_id || existing.employee_id);
    await this.assertLeaveNoOverlapApproved(user.tenant_id, employeeId, start, end, id);

    const durationMinutes = this.calculateDurationMinutes(start, end);

    return this.updateResource(user, 'leave-requests', id, {
      ...dto,
      duration_minutes: durationMinutes,
    } as any);
  }

  removeLeaveRequest(user: AuthUser, id: string) { return this.removeResource(user, 'leave-requests', id); }

  listSkillCategories(user: AuthUser, query: ListQuery) { return this.listResource(user, 'skill-categories', query); }
  findSkillCategoryById(user: AuthUser, id: string) { return this.findResourceById(user, 'skill-categories', id); }
  createSkillCategory(user: AuthUser, dto: CreateHrSkillCategoryDto) { return this.createResource(user, 'skill-categories', dto as any); }
  updateSkillCategory(user: AuthUser, id: string, dto: UpdateHrSkillCategoryDto) { return this.updateResource(user, 'skill-categories', id, dto as any); }
  removeSkillCategory(user: AuthUser, id: string) { return this.removeResource(user, 'skill-categories', id); }

  listSkills(user: AuthUser, query: ListQuery) { return this.listResource(user, 'skills', query); }
  findSkillById(user: AuthUser, id: string) { return this.findResourceById(user, 'skills', id); }
  createSkill(user: AuthUser, dto: CreateHrSkillDto) { return this.createResource(user, 'skills', dto as any); }
  updateSkill(user: AuthUser, id: string, dto: UpdateHrSkillDto) { return this.updateResource(user, 'skills', id, dto as any); }
  removeSkill(user: AuthUser, id: string) { return this.removeResource(user, 'skills', id); }

  listEmployeeSkills(user: AuthUser, query: ListQuery) { return this.listResource(user, 'employee-skills', query); }
  findEmployeeSkillById(user: AuthUser, id: string) { return this.findResourceById(user, 'employee-skills', id); }
  createEmployeeSkill(user: AuthUser, dto: CreateHrEmployeeSkillDto) { return this.createResource(user, 'employee-skills', dto as any); }
  updateEmployeeSkill(user: AuthUser, id: string, dto: UpdateHrEmployeeSkillDto) { return this.updateResource(user, 'employee-skills', id, dto as any); }
  removeEmployeeSkill(user: AuthUser, id: string) { return this.removeResource(user, 'employee-skills', id); }

  listCertifications(user: AuthUser, query: ListQuery) { return this.listResource(user, 'certifications', query); }
  findCertificationById(user: AuthUser, id: string) { return this.findResourceById(user, 'certifications', id); }
  createCertification(user: AuthUser, dto: CreateHrCertificationDto) { return this.createResource(user, 'certifications', dto as any); }
  updateCertification(user: AuthUser, id: string, dto: UpdateHrCertificationDto) { return this.updateResource(user, 'certifications', id, dto as any); }
  removeCertification(user: AuthUser, id: string) { return this.removeResource(user, 'certifications', id); }

  listEmployeeCertifications(user: AuthUser, query: ListQuery) { return this.listResource(user, 'employee-certifications', query); }
  findEmployeeCertificationById(user: AuthUser, id: string) { return this.findResourceById(user, 'employee-certifications', id); }

  createEmployeeCertification(user: AuthUser, dto: CreateHrEmployeeCertificationDto) {
    const expiresAt = this.toDateOnly(dto.expires_at);
    const status = dto.status || this.resolveCertificationStatusByDate(expiresAt);
    return this.createResource(user, 'employee-certifications', {
      ...dto,
      status,
    } as any);
  }

  updateEmployeeCertification(user: AuthUser, id: string, dto: UpdateHrEmployeeCertificationDto) {
    return this.updateResource(user, 'employee-certifications', id, dto as any);
  }

  removeEmployeeCertification(user: AuthUser, id: string) { return this.removeResource(user, 'employee-certifications', id); }

  listLifecycleTemplates(user: AuthUser, query: ListQuery) { return this.listResource(user, 'lifecycle-templates', query); }
  findLifecycleTemplateById(user: AuthUser, id: string) { return this.findResourceById(user, 'lifecycle-templates', id); }
  createLifecycleTemplate(user: AuthUser, dto: CreateHrLifecycleTemplateDto) { return this.createResource(user, 'lifecycle-templates', dto as any); }
  updateLifecycleTemplate(user: AuthUser, id: string, dto: UpdateHrLifecycleTemplateDto) { return this.updateResource(user, 'lifecycle-templates', id, dto as any); }
  removeLifecycleTemplate(user: AuthUser, id: string) { return this.removeResource(user, 'lifecycle-templates', id); }

  listLifecycleStages(user: AuthUser, query: ListQuery) { return this.listResource(user, 'lifecycle-stages', query); }
  findLifecycleStageById(user: AuthUser, id: string) { return this.findResourceById(user, 'lifecycle-stages', id); }
  createLifecycleStage(user: AuthUser, dto: CreateHrLifecycleStageDto) { return this.createResource(user, 'lifecycle-stages', dto as any); }
  updateLifecycleStage(user: AuthUser, id: string, dto: UpdateHrLifecycleStageDto) { return this.updateResource(user, 'lifecycle-stages', id, dto as any); }
  removeLifecycleStage(user: AuthUser, id: string) { return this.removeResource(user, 'lifecycle-stages', id); }

  listLifecycleTasks(user: AuthUser, query: ListQuery) { return this.listResource(user, 'lifecycle-tasks', query); }
  findLifecycleTaskById(user: AuthUser, id: string) { return this.findResourceById(user, 'lifecycle-tasks', id); }
  createLifecycleTask(user: AuthUser, dto: CreateHrLifecycleTaskDto) { return this.createResource(user, 'lifecycle-tasks', dto as any); }
  updateLifecycleTask(user: AuthUser, id: string, dto: UpdateHrLifecycleTaskDto) { return this.updateResource(user, 'lifecycle-tasks', id, dto as any); }
  removeLifecycleTask(user: AuthUser, id: string) { return this.removeResource(user, 'lifecycle-tasks', id); }

  listEmployeeLifecycles(user: AuthUser, query: ListQuery) {
    return this.listResource(user, 'employee-lifecycles', query);
  }

  async findEmployeeLifecycleById(user: AuthUser, id: string) {
    const lifecycle = await this.db.hr_employee_lifecycles.findFirst({
      where: {
        tenant_id: user.tenant_id,
        id,
        deleted_at: null,
      },
      include: {
        employee: { select: { id: true, full_name: true, employee_number: true } },
        template: { select: { id: true, name: true, type: true } },
        current_stage: { select: { id: true, name: true, sort_order: true } },
        tasks: {
          where: { deleted_at: null },
          include: {
            stage: { select: { id: true, name: true, sort_order: true } },
            responsible_employee: { select: { id: true, full_name: true } },
          },
          orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
        },
      },
    });

    if (!lifecycle) throw new NotFoundException('Instancia de onboarding/offboarding nao encontrada');
    return lifecycle;
  }

  async createEmployeeLifecycle(user: AuthUser, dto: CreateHrEmployeeLifecycleDto) {
    const template = await this.db.hr_lifecycle_templates.findFirst({
      where: {
        tenant_id: user.tenant_id,
        id: dto.template_id,
        deleted_at: null,
      },
      select: { id: true, is_active: true },
    });

    if (!template) throw new NotFoundException('Template de lifecycle nao encontrado');

    const stages = await this.db.hr_lifecycle_stages.findMany({
      where: {
        tenant_id: user.tenant_id,
        template_id: dto.template_id,
        is_active: true,
        deleted_at: null,
      },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      select: { id: true, sort_order: true },
    });

    const firstStageId = stages.length ? stages[0].id : null;
    const startDate = this.toDateOnly(dto.start_date);
    if (!startDate) throw new BadRequestException('Data inicial invalida.');

    const lifecycle = await this.db.hr_employee_lifecycles.create({
      data: {
        tenant_id: user.tenant_id,
        employee_id: dto.employee_id,
        template_id: dto.template_id,
        start_date: startDate,
        target_end_date: this.toDateOnly(dto.target_end_date),
        status: String(dto.status || 'ACTIVE').toUpperCase(),
        current_stage_id: firstStageId,
        created_by_user_id: user.id,
      },
    });

    await this.instantiateLifecycleTasks(user, lifecycle.id, dto.template_id, startDate, firstStageId);

    return this.findEmployeeLifecycleById(user, lifecycle.id);
  }

  async updateEmployeeLifecycle(user: AuthUser, id: string, dto: UpdateHrEmployeeLifecycleDto) {
    await this.findEmployeeLifecycleById(user, id);

    await this.db.hr_employee_lifecycles.updateMany({
      where: {
        tenant_id: user.tenant_id,
        id,
        deleted_at: null,
      },
      data: {
        ...(dto.employee_id !== undefined ? { employee_id: dto.employee_id } : {}),
        ...(dto.template_id !== undefined ? { template_id: dto.template_id } : {}),
        ...(dto.start_date !== undefined ? { start_date: this.toDateOnly(dto.start_date) } : {}),
        ...(dto.target_end_date !== undefined ? { target_end_date: this.toDateOnly(dto.target_end_date) } : {}),
        ...(dto.status !== undefined ? { status: String(dto.status).toUpperCase() } : {}),
        ...(dto.current_stage_id !== undefined ? { current_stage_id: dto.current_stage_id || null } : {}),
        updated_at: new Date(),
      },
    });

    return this.findEmployeeLifecycleById(user, id);
  }

  removeEmployeeLifecycle(user: AuthUser, id: string) {
    return this.removeResource(user, 'employee-lifecycles', id);
  }

  listEmployeeLifecycleTasks(user: AuthUser, query: ListQuery) {
    return this.listResource(user, 'employee-lifecycle-tasks', query);
  }

  findEmployeeLifecycleTaskById(user: AuthUser, id: string) {
    return this.findResourceById(user, 'employee-lifecycle-tasks', id);
  }

  createEmployeeLifecycleTask(user: AuthUser, dto: CreateHrEmployeeLifecycleTaskDto) {
    return this.createResource(user, 'employee-lifecycle-tasks', dto as any);
  }

  updateEmployeeLifecycleTask(user: AuthUser, id: string, dto: UpdateHrEmployeeLifecycleTaskDto) {
    return this.updateResource(user, 'employee-lifecycle-tasks', id, dto as any);
  }

  removeEmployeeLifecycleTask(user: AuthUser, id: string) {
    return this.removeResource(user, 'employee-lifecycle-tasks', id);
  }

  async moveEmployeeLifecycleTask(user: AuthUser, id: string, dto: MoveHrEmployeeLifecycleTaskDto) {
    const current = await this.findEmployeeLifecycleTaskById(user, id);

    const nextStatus = String(dto.status || current.status || 'OPEN').toUpperCase();
    const isDone = nextStatus === 'DONE';

    await this.db.hr_employee_lifecycle_tasks.updateMany({
      where: {
        tenant_id: user.tenant_id,
        id,
        deleted_at: null,
      },
      data: {
        ...(dto.stage_id !== undefined ? { stage_id: dto.stage_id } : {}),
        ...(dto.sort_order !== undefined ? { sort_order: dto.sort_order } : {}),
        ...(dto.status !== undefined ? { status: nextStatus } : {}),
        completed_at: isDone ? new Date() : null,
        completed_by_user_id: isDone ? user.id : null,
        updated_at: new Date(),
      },
    });

    return this.findEmployeeLifecycleTaskById(user, id);
  }

  async getLifecycleKanban(user: AuthUser, query: { employee_id?: string; type?: string }) {
    const employeeId = String(query.employee_id || '').trim();
    const type = String(query.type || '').trim().toUpperCase();

    const lifecycle = await this.db.hr_employee_lifecycles.findFirst({
      where: {
        tenant_id: user.tenant_id,
        ...(employeeId ? { employee_id: employeeId } : {}),
        ...(type ? { template: { type: type as any } } : {}),
        status: 'ACTIVE',
        deleted_at: null,
      },
      include: {
        employee: { select: { id: true, full_name: true } },
        template: { select: { id: true, name: true, type: true } },
      },
      orderBy: [{ start_date: 'desc' }],
    });

    if (!lifecycle) {
      return { lifecycle: null, stages: [], tasks: [] };
    }

    const [stages, tasks] = await Promise.all([
      this.db.hr_lifecycle_stages.findMany({
        where: {
          tenant_id: user.tenant_id,
          template_id: lifecycle.template_id,
          deleted_at: null,
        },
        orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      }),
      this.db.hr_employee_lifecycle_tasks.findMany({
        where: {
          tenant_id: user.tenant_id,
          employee_lifecycle_id: lifecycle.id,
          deleted_at: null,
        },
        include: {
          stage: { select: { id: true, name: true, sort_order: true } },
          responsible_employee: { select: { id: true, full_name: true } },
        },
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      }),
    ]);

    return {
      lifecycle,
      stages,
      tasks,
    };
  }

  async setupDefaults(user: AuthUser, dto: HrSetupDefaultsDto = {}) {
    this.assertCanWrite(user, 'employment-statuses');
    const skip = new Set((dto.skip || []).map((item) => String(item || '').trim().toLowerCase()));

    const created: Record<string, number> = {
      employment_statuses: 0,
      leave_types: 0,
      skill_categories: 0,
      onboarding_template: 0,
    };

    await this.prisma.transaction(async (tx: any) => {
      if (!skip.has('employment_statuses')) {
        const statuses = [
          { code: 'ACTIVE', name: 'Ativo', color: '#1ab394', sort_order: 10, is_default: true },
          { code: 'ON_LEAVE', name: 'Afastado', color: '#f8ac59', sort_order: 20, is_default: false },
          { code: 'TERMINATED', name: 'Desligado', color: '#ed5565', sort_order: 30, is_default: false },
        ];

        for (const row of statuses) {
          const found = await tx.hr_employment_statuses.findFirst({
            where: {
              tenant_id: user.tenant_id,
              code: row.code,
              deleted_at: null,
            },
            select: { id: true },
          });
          if (found) continue;
          await tx.hr_employment_statuses.create({ data: { tenant_id: user.tenant_id, ...row } });
          created.employment_statuses += 1;
        }
      }

      if (!skip.has('leave_types')) {
        const leaveTypes = [
          { code: 'VACATION', name: 'Ferias', requires_approval: true, is_paid: true, counts_as_vacation: true, allow_hourly: false, sort_order: 10 },
          { code: 'MEDICAL', name: 'Atestado', requires_approval: true, is_paid: true, counts_as_vacation: false, allow_hourly: true, sort_order: 20 },
          { code: 'ABSENCE', name: 'Falta', requires_approval: true, is_paid: false, counts_as_vacation: false, allow_hourly: true, sort_order: 30 },
        ];

        for (const row of leaveTypes) {
          const found = await tx.hr_leave_types.findFirst({
            where: {
              tenant_id: user.tenant_id,
              code: row.code,
              deleted_at: null,
            },
            select: { id: true },
          });
          if (found) continue;
          await tx.hr_leave_types.create({ data: { tenant_id: user.tenant_id, ...row } });
          created.leave_types += 1;
        }
      }

      if (!skip.has('skill_categories')) {
        const categories = [
          { name: 'Idiomas', sort_order: 10 },
          { name: 'Ferramentas', sort_order: 20 },
          { name: 'Operacao', sort_order: 30 },
        ];

        for (const row of categories) {
          const found = await tx.hr_skill_categories.findFirst({
            where: {
              tenant_id: user.tenant_id,
              name: row.name,
              deleted_at: null,
            },
            select: { id: true },
          });
          if (found) continue;
          await tx.hr_skill_categories.create({ data: { tenant_id: user.tenant_id, ...row } });
          created.skill_categories += 1;
        }
      }

      if (!skip.has('onboarding_template')) {
        let template = await tx.hr_lifecycle_templates.findFirst({
          where: {
            tenant_id: user.tenant_id,
            name: 'Onboarding Padrao',
            type: 'ONBOARDING',
            deleted_at: null,
          },
        });

        if (!template) {
          template = await tx.hr_lifecycle_templates.create({
            data: {
              tenant_id: user.tenant_id,
              name: 'Onboarding Padrao',
              type: 'ONBOARDING',
              description: 'Template inicial de onboarding',
            },
          });
          created.onboarding_template += 1;
        }

        const stageDefinitions = [
          { name: 'A Fazer', sort_order: 10, color: '#f8ac59' },
          { name: 'Em Andamento', sort_order: 20, color: '#1c84c6' },
          { name: 'Concluido', sort_order: 30, color: '#1ab394' },
        ];

        const stageMap = new Map<string, string>();

        for (const stage of stageDefinitions) {
          let row = await tx.hr_lifecycle_stages.findFirst({
            where: {
              tenant_id: user.tenant_id,
              template_id: template.id,
              name: stage.name,
              deleted_at: null,
            },
          });

          if (!row) {
            row = await tx.hr_lifecycle_stages.create({
              data: {
                tenant_id: user.tenant_id,
                template_id: template.id,
                name: stage.name,
                sort_order: stage.sort_order,
                color: stage.color,
              },
            });
          }
          stageMap.set(stage.name, row.id);
        }

        const firstStageId = stageMap.get('A Fazer') || null;
        const checklist = [
          { title: 'Enviar documentos admissionais', responsible_role: 'HR', due_days_after_start: 0, sort_order: 10 },
          { title: 'Provisionar acessos de sistemas', responsible_role: 'IT', due_days_after_start: 1, sort_order: 20 },
          { title: 'Reuniao com gestor direto', responsible_role: 'MANAGER', due_days_after_start: 2, sort_order: 30 },
        ];

        for (const task of checklist) {
          const exists = await tx.hr_lifecycle_tasks.findFirst({
            where: {
              tenant_id: user.tenant_id,
              template_id: template.id,
              title: task.title,
              deleted_at: null,
            },
          });
          if (exists) continue;
          await tx.hr_lifecycle_tasks.create({
            data: {
              tenant_id: user.tenant_id,
              template_id: template.id,
              stage_id: firstStageId,
              title: task.title,
              responsible_role: task.responsible_role as any,
              due_days_after_start: task.due_days_after_start,
              sort_order: task.sort_order,
            },
          });
        }
      }
    });

    return {
      ok: true,
      created,
    };
  }
}
