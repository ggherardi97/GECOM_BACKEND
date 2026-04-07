import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreatePoChecklistItemDto,
  CreatePoWorkOrderDto,
  GeneratePoWorkOrderAppointmentsDto,
  MovePoChecklistItemDto,
  SetupPoDefaultsDto,
} from './dto/project-operations.dto';

type AuthUser = {
  id: string;
  tenant_id: string;
  role?: string;
};

type ListQuery = {
  q?: string;
  is_active?: string;
  status?: string;
  project_id?: string;
  process_id?: string;
  owner_user_id?: string;
  resource_id?: string;
  incident_id?: string;
  priority?: string;
  work_order_id?: string;
  checklist_id?: string;
  due_from?: string;
  due_to?: string;
  start_from?: string;
  start_to?: string;
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
  hasIsActive?: boolean;
  statusField?: string;
  projectField?: string;
  processField?: string;
  ownerField?: string;
  priorityField?: string;
  resourceField?: string;
  incidentField?: string;
  workOrderField?: string;
  checklistField?: string;
  dueDateField?: string;
  startDateField?: string;
  parseCreate?: (dto: Record<string, any>, user: AuthUser) => Promise<Record<string, any>>;
  parseUpdate?: (dto: Record<string, any>, user: AuthUser, id: string) => Promise<Record<string, any>>;
};

@Injectable()
export class ProjectOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  private get db(): any {
    return this.prisma.raw;
  }

  private getRole(user: AuthUser): string {
    return String(user.role || '').trim().toUpperCase();
  }

  private assertCanWrite(user: AuthUser) {
    const role = this.getRole(user);
    if (role === 'ADMIN' || role === 'MANAGER') return;
    throw new ForbiddenException('Voce nao possui permissao para alterar o modulo Project & Operations.');
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

  private toDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private toDateOnly(value: string | Date | null | undefined): Date | null {
    const date = this.toDate(value);
    if (!date) return null;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
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

  private parseOptionalBoolean(value?: string): boolean | undefined {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return undefined;
    if (['1', 'true', 'yes', 'y', 'sim', 's'].includes(raw)) return true;
    if (['0', 'false', 'no', 'n', 'nao'].includes(raw)) return false;
    return undefined;
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

  private mapCommonData(dto: Record<string, any>): Record<string, any> {
    const data = this.trimPayload(dto);

    const dateOnlyFields = ['start_date', 'target_end_date', 'actual_end_date', 'due_date'];
    const dateTimeFields = ['planned_start', 'planned_end', 'actual_start', 'actual_end', 'start_at', 'end_at'];
    const intFields = ['sort_order', 'allocation_percent'];
    const decimalFields = ['value_amount', 'estimated_hours', 'planned_hours'];

    for (const field of dateOnlyFields) {
      if (data[field] !== undefined) data[field] = this.toDateOnly(data[field]);
    }
    for (const field of dateTimeFields) {
      if (data[field] !== undefined) data[field] = this.toDate(data[field]);
    }
    for (const field of intFields) {
      if (data[field] !== undefined) data[field] = this.toInt(data[field]);
    }
    for (const field of decimalFields) {
      if (data[field] !== undefined) data[field] = this.toDecimal(data[field]);
    }

    return data;
  }

  private getDelegate(name: string): any {
    const delegate = (this.db as any)?.[name];
    if (!delegate) throw new NotFoundException(`Delegate nao encontrado: ${name}`);
    return delegate;
  }

  private buildTextFilter(searchFields: string[] | undefined, q: string | undefined) {
    const term = String(q || '').trim();
    if (!term || !(searchFields || []).length) return {};
    return {
      OR: (searchFields || []).map((field) => ({
        [field]: { contains: term, mode: 'insensitive' },
      })),
    };
  }

  private buildWhere(query: ListQuery, config: ResourceConfig) {
    const where: Record<string, any> = {
      ...(config.softDelete === false ? {} : { deleted_at: null }),
      ...this.buildTextFilter(config.searchFields, query.q),
    };

    const active = this.parseOptionalBoolean(query.is_active);
    if (config.hasIsActive && active !== undefined) where.is_active = active;

    const status = String(query.status || '').trim();
    if (status && config.statusField) where[config.statusField] = status;

    const projectId = String(query.project_id || '').trim();
    if (projectId && config.projectField) where[config.projectField] = projectId;

    const processId = String(query.process_id || '').trim();
    if (processId && config.processField) where[config.processField] = processId;

    const ownerUserId = String(query.owner_user_id || '').trim();
    if (ownerUserId && config.ownerField) where[config.ownerField] = ownerUserId;

    const priority = String(query.priority || '').trim().toUpperCase();
    if (priority && config.priorityField) where[config.priorityField] = priority;

    const resourceId = String(query.resource_id || '').trim();
    if (resourceId && config.resourceField) where[config.resourceField] = resourceId;

    const incidentId = String(query.incident_id || '').trim();
    if (incidentId && config.incidentField) where[config.incidentField] = incidentId;

    const workOrderId = String(query.work_order_id || '').trim();
    if (workOrderId && config.workOrderField) where[config.workOrderField] = workOrderId;

    const checklistId = String(query.checklist_id || '').trim();
    if (checklistId && config.checklistField) where[config.checklistField] = checklistId;

    const dueFrom = this.toDateOnly(query.due_from);
    const dueTo = this.toDateOnly(query.due_to);
    if (config.dueDateField && (dueFrom || dueTo)) {
      where[config.dueDateField] = {
        ...(dueFrom ? { gte: dueFrom } : {}),
        ...(dueTo ? { lte: dueTo } : {}),
      };
    }

    const startFrom = this.toDate(query.start_from);
    const startTo = this.toDate(query.start_to);
    if (config.startDateField && (startFrom || startTo)) {
      where[config.startDateField] = {
        ...(startFrom ? { gte: startFrom } : {}),
        ...(startTo ? { lte: startTo } : {}),
      };
    }

    return where;
  }

  private async listByConfig(user: AuthUser, config: ResourceConfig, query: ListQuery = {}) {
    const delegate = this.getDelegate(config.delegate);
    const { page, pageSize, skip, take } = this.normalizePagination(query);
    const where = this.buildWhere(query, config);

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
        ...(config.softDelete === false ? {} : { deleted_at: null }),
      },
      include: config.include,
    });
    if (!row) throw new NotFoundException('Registro nao encontrado.');
    return row;
  }

  private async createByConfig(user: AuthUser, config: ResourceConfig, dto: Record<string, any>) {
    this.assertCanWrite(user);
    const delegate = this.getDelegate(config.delegate);

    let data = this.mapCommonData(dto);
    if (config.parseCreate) data = await config.parseCreate(data, user);

    const created = await delegate.create({
      data: {
        ...data,
        tenant_id: user.tenant_id,
      },
    });

    return this.findByIdConfig(user, config, created.id);
  }

  private async updateByConfig(user: AuthUser, config: ResourceConfig, id: string, dto: Record<string, any>) {
    this.assertCanWrite(user);
    await this.findByIdConfig(user, config, id);

    const delegate = this.getDelegate(config.delegate);
    let data = this.mapCommonData(dto);
    if (config.parseUpdate) data = await config.parseUpdate(data, user, id);

    await delegate.updateMany({
      where: {
        tenant_id: user.tenant_id,
        id,
        ...(config.softDelete === false ? {} : { deleted_at: null }),
      },
      data: {
        ...data,
        updated_at: new Date(),
      },
    });

    return this.findByIdConfig(user, config, id);
  }

  private async removeByConfig(user: AuthUser, config: ResourceConfig, id: string) {
    this.assertCanWrite(user);
    const current = await this.findByIdConfig(user, config, id);
    const delegate = this.getDelegate(config.delegate);

    if (config.softDelete === false) {
      await delegate.deleteMany({
        where: { tenant_id: user.tenant_id, id },
      });
    } else {
      await delegate.updateMany({
        where: { tenant_id: user.tenant_id, id, deleted_at: null },
        data: { deleted_at: new Date(), updated_at: new Date() },
      });
    }

    return current;
  }

  private async resolveDefaultStatusId(
    tx: PrismaClient | Prisma.TransactionClient,
    tableName: 'po_project_statuses' | 'po_deliverable_statuses' | 'po_work_order_statuses',
    tenantId: string,
  ): Promise<string | null> {
    const delegate = (tx as any)[tableName];
    if (!delegate) return null;

    const defaultRow = await delegate.findFirst({
      where: {
        tenant_id: tenantId,
        deleted_at: null,
        is_active: true,
        is_default: true,
      },
      select: { id: true },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    });
    if (defaultRow?.id) return defaultRow.id;

    const firstRow = await delegate.findFirst({
      where: {
        tenant_id: tenantId,
        deleted_at: null,
        is_active: true,
      },
      select: { id: true },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    });
    return firstRow?.id || null;
  }

  private parseSequence(code: string | null | undefined): number {
    const match = String(code || '').toUpperCase().match(/^WO-(\d{1,12})$/);
    if (!match) return 0;
    return Number(match[1]) || 0;
  }

  private async generateWorkOrderCode(
    tx: PrismaClient | Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string> {
    const recent = await (tx as any).po_work_orders.findMany({
      where: { tenant_id: tenantId },
      select: { code: true },
      orderBy: [{ created_at: 'desc' }],
      take: 200,
    });

    let maxSeq = 0;
    for (const row of recent || []) {
      maxSeq = Math.max(maxSeq, this.parseSequence(row?.code));
    }
    if (!maxSeq) {
      const total = await (tx as any).po_work_orders.count({
        where: { tenant_id: tenantId },
      });
      maxSeq = total || 0;
    }

    let next = maxSeq + 1;
    // Ensure uniqueness in case of concurrent inserts.
    for (let i = 0; i < 20; i += 1) {
      const code = `WO-${String(next).padStart(6, '0')}`;
      const exists = await (tx as any).po_work_orders.findFirst({
        where: { tenant_id: tenantId, code },
        select: { id: true },
      });
      if (!exists) return code;
      next += 1;
    }
    return `WO-${String(Date.now()).slice(-6)}`;
  }

  private readonly resources: Record<string, ResourceConfig> = {
    'project-statuses': {
      key: 'project-statuses',
      delegate: 'po_project_statuses',
      searchFields: ['name', 'code'],
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      softDelete: true,
      hasIsActive: true,
    },
    'deliverable-statuses': {
      key: 'deliverable-statuses',
      delegate: 'po_deliverable_statuses',
      searchFields: ['name', 'code'],
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      softDelete: true,
      hasIsActive: true,
    },
    'work-order-statuses': {
      key: 'work-order-statuses',
      delegate: 'po_work_order_statuses',
      searchFields: ['name', 'code'],
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      softDelete: true,
      hasIsActive: true,
    },
    'resource-roles': {
      key: 'resource-roles',
      delegate: 'po_resource_roles',
      searchFields: ['name', 'code', 'description'],
      orderBy: [{ name: 'asc' }],
      softDelete: true,
      hasIsActive: true,
    },
    projects: {
      key: 'projects',
      delegate: 'po_projects',
      searchFields: ['code', 'name', 'description'],
      orderBy: [{ updated_at: 'desc' }],
      softDelete: true,
      statusField: 'status_id',
      ownerField: 'owner_user_id',
      include: {
        status: { select: { id: true, name: true, code: true, color: true } },
        owner_user: { select: { id: true, full_name: true, email: true } },
        company: { select: { id: true, company_name: true } },
        _count: { select: { project_processes: true, milestones: true, deliverables: true, checklists: true, work_orders: true } },
      },
      parseCreate: async (dto, user) => {
        const data = { ...dto };
        if (!data.owner_user_id) data.owner_user_id = user.id;
        if (!data.status_id) data.status_id = await this.resolveDefaultStatusId(this.db, 'po_project_statuses', user.tenant_id);
        return data;
      },
    },
    'project-processes': {
      key: 'project-processes',
      delegate: 'po_project_processes',
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      softDelete: false,
      projectField: 'project_id',
      processField: 'process_id',
      include: {
        project: { select: { id: true, code: true, name: true } },
        process: { select: { id: true, process_number: true, exporter: true, importer: true } },
      },
    },
    milestones: {
      key: 'milestones',
      delegate: 'po_milestones',
      searchFields: ['title', 'description'],
      orderBy: [{ sort_order: 'asc' }, { due_date: 'asc' }, { created_at: 'asc' }],
      softDelete: true,
      statusField: 'status',
      projectField: 'project_id',
      processField: 'process_id',
      dueDateField: 'due_date',
      include: {
        project: { select: { id: true, code: true, name: true } },
        process: { select: { id: true, process_number: true } },
      },
    },
    deliverables: {
      key: 'deliverables',
      delegate: 'po_deliverables',
      searchFields: ['title', 'description'],
      orderBy: [{ due_date: 'asc' }, { updated_at: 'desc' }],
      softDelete: true,
      statusField: 'status_id',
      projectField: 'project_id',
      processField: 'process_id',
      dueDateField: 'due_date',
      include: {
        project: { select: { id: true, code: true, name: true } },
        process: { select: { id: true, process_number: true } },
        currency: { select: { id: true, code: true, symbol: true } },
        status: { select: { id: true, name: true, code: true, color: true } },
      },
      parseCreate: async (dto, user) => {
        const data = { ...dto };
        if (!data.status_id) data.status_id = await this.resolveDefaultStatusId(this.db, 'po_deliverable_statuses', user.tenant_id);
        return data;
      },
    },
    checklists: {
      key: 'checklists',
      delegate: 'po_checklists',
      searchFields: ['name'],
      orderBy: [{ updated_at: 'desc' }],
      softDelete: true,
      projectField: 'project_id',
      processField: 'process_id',
      include: {
        project: { select: { id: true, code: true, name: true } },
        process: { select: { id: true, process_number: true } },
        _count: { select: { items: true } },
      },
    },
    'checklist-items': {
      key: 'checklist-items',
      delegate: 'po_checklist_items',
      searchFields: ['title'],
      orderBy: [{ sort_order: 'asc' }, { due_date: 'asc' }, { created_at: 'asc' }],
      softDelete: true,
      statusField: 'status',
      checklistField: 'checklist_id',
      ownerField: 'assigned_user_id',
      dueDateField: 'due_date',
      include: {
        checklist: {
          select: {
            id: true,
            name: true,
            process_id: true,
            project_id: true,
            project: { select: { id: true, code: true, name: true } },
          },
        },
        assigned_user: { select: { id: true, full_name: true, email: true } },
      },
    },
    'work-orders': {
      key: 'work-orders',
      delegate: 'po_work_orders',
      searchFields: ['code', 'title', 'description'],
      orderBy: [{ updated_at: 'desc' }],
      softDelete: true,
      statusField: 'status_id',
      projectField: 'project_id',
      incidentField: 'incident_id',
      ownerField: 'owner_user_id',
      priorityField: 'priority',
      startDateField: 'planned_start',
      include: {
        incident: { select: { id: true, number: true, title: true, status: true } },
        project: { select: { id: true, code: true, name: true } },
        status: { select: { id: true, name: true, code: true, color: true } },
        created_by_user: { select: { id: true, full_name: true, email: true } },
        owner_user: { select: { id: true, full_name: true, email: true } },
        _count: { select: { assignments: true, appointments: true } },
      },
      parseCreate: async (dto, user) => {
        const payload = { ...dto };
        if (!payload.status_id) payload.status_id = await this.resolveDefaultStatusId(this.db, 'po_work_order_statuses', user.tenant_id);
        payload.priority = String(payload.priority || 'MEDIUM').toUpperCase();
        payload.created_by_user_id = user.id;

        if (!payload.code) {
          payload.code = await this.generateWorkOrderCode(this.db, user.tenant_id);
        } else {
          payload.code = String(payload.code).trim().toUpperCase();
        }
        return payload;
      },
      parseUpdate: async (dto) => {
        const payload = { ...dto };
        if (payload.priority !== undefined && payload.priority !== null) {
          payload.priority = String(payload.priority).toUpperCase();
        }
        return payload;
      },
    },
    'work-order-assignments': {
      key: 'work-order-assignments',
      delegate: 'po_work_order_assignments',
      orderBy: [{ created_at: 'asc' }],
      softDelete: false,
      workOrderField: 'work_order_id',
      resourceField: 'resource_id',
      include: {
        work_order: { select: { id: true, code: true, title: true, status_id: true } },
        resource: { select: { id: true, name: true, user_id: true, capacity_per_day: true } },
        role: { select: { id: true, name: true, code: true } },
      },
    },
    'work-order-appointments': {
      key: 'work-order-appointments',
      delegate: 'po_work_order_appointments',
      orderBy: [{ created_at: 'desc' }],
      softDelete: false,
      workOrderField: 'work_order_id',
      include: {
        work_order: { select: { id: true, code: true, title: true } },
        appointment: {
          select: {
            id: true,
            title: true,
            start_at: true,
            end_at: true,
            status: true,
            notes: true,
            resource: { select: { id: true, name: true } },
          },
        },
      },
    },
  };

  private getConfig(resourceKey: string): ResourceConfig {
    const config = this.resources[String(resourceKey || '').trim()];
    if (!config) throw new NotFoundException('Recurso de Project & Operations nao encontrado.');
    return config;
  }

  private getRelatedTableAliases(resourceKey: string): string[] {
    const key = String(resourceKey || '').trim().toLowerCase();
    switch (key) {
      case 'projects':
        return ['po_projects', 'po_project', 'project', 'projects'];
      case 'work-orders':
        return ['po_work_orders', 'po_work_order', 'work_order', 'work_orders'];
      default:
        return [];
    }
  }

  private async findRelatedEvents(user: AuthUser, resourceKey: string, id: string) {
    const aliases = this.getRelatedTableAliases(resourceKey);
    if (!aliases.length) return [];

    return this.db.events.findMany({
      where: {
        tenant_id: user.tenant_id,
        related_id: id,
        related_table: { in: aliases },
      },
      orderBy: [{ start_time: 'desc' }, { created_at: 'desc' }],
    });
  }

  private buildProjectSummaryTimeline(project: any) {
    const items: Array<Record<string, any>> = [];

    items.push({
      id: `project-created-${project.id}`,
      kind: 'PROJECT_CREATED',
      occurred_at: project.created_at,
      title: project.name || project.code || 'Projeto',
      subtitle: project.code || null,
      description: project.description || null,
      meta: {
        status: project.status?.name || null,
        company: project.company?.company_name || null,
      },
    });

    if (project.actual_end_date) {
      items.push({
        id: `project-completed-${project.id}`,
        kind: 'PROJECT_COMPLETED',
        occurred_at: project.actual_end_date,
        title: project.name || project.code || 'Projeto',
        subtitle: project.code || null,
        description: null,
        meta: {
          status: project.status?.name || null,
        },
      });
    }

    return items;
  }

  private buildWorkOrderSummaryTimeline(workOrder: any) {
    const items: Array<Record<string, any>> = [];

    items.push({
      id: `work-order-created-${workOrder.id}`,
      kind: 'WORK_ORDER_CREATED',
      occurred_at: workOrder.created_at,
      title: workOrder.title || workOrder.code || 'Work order',
      subtitle: workOrder.code || null,
      description: workOrder.description || null,
      meta: {
        status: workOrder.status?.name || null,
        priority: workOrder.priority || null,
      },
    });

    if (workOrder.actual_start) {
      items.push({
        id: `work-order-started-${workOrder.id}`,
        kind: 'WORK_ORDER_STARTED',
        occurred_at: workOrder.actual_start,
        title: workOrder.title || workOrder.code || 'Work order',
        subtitle: workOrder.code || null,
        description: null,
        meta: {
          status: workOrder.status?.name || null,
        },
      });
    }

    if (workOrder.actual_end) {
      items.push({
        id: `work-order-completed-${workOrder.id}`,
        kind: 'WORK_ORDER_COMPLETED',
        occurred_at: workOrder.actual_end,
        title: workOrder.title || workOrder.code || 'Work order',
        subtitle: workOrder.code || null,
        description: null,
        meta: {
          status: workOrder.status?.name || null,
        },
      });
    }

    return items;
  }

  async getTimeline(user: AuthUser, resourceKey: string, id: string) {
    const key = String(resourceKey || '').trim().toLowerCase();
    if (key === 'projects') return this.getProjectTimeline(user, id);
    if (key === 'work-orders') return this.getWorkOrderTimeline(user, id);
    throw new NotFoundException('Timeline nao disponivel para este recurso.');
  }

  async getRelated(user: AuthUser, resourceKey: string, id: string) {
    const key = String(resourceKey || '').trim().toLowerCase();
    if (key === 'projects') return this.getProjectRelated(user, id);
    if (key === 'work-orders') return this.getWorkOrderRelated(user, id);
    throw new NotFoundException('Relacionados nao disponiveis para este recurso.');
  }

  private async getProjectTimeline(user: AuthUser, id: string) {
    const project = await this.findResourceById(user, 'projects', id);
    const [projectProcesses, milestones, deliverables, checklists, workOrders, events, linkedAppointments] = await Promise.all([
      this.db.po_project_processes.findMany({
        where: {
          tenant_id: user.tenant_id,
          project_id: id,
        },
        include: {
          process: { select: { id: true, process_number: true, exporter: true, importer: true } },
        },
        orderBy: [{ sort_order: 'asc' }, { created_at: 'desc' }],
      }),
      this.db.po_milestones.findMany({
        where: {
          tenant_id: user.tenant_id,
          project_id: id,
          deleted_at: null,
        },
        orderBy: [{ due_date: 'asc' }, { created_at: 'desc' }],
      }),
      this.db.po_deliverables.findMany({
        where: {
          tenant_id: user.tenant_id,
          project_id: id,
          deleted_at: null,
        },
        include: {
          status: { select: { id: true, name: true, code: true, color: true } },
        },
        orderBy: [{ due_date: 'asc' }, { created_at: 'desc' }],
      }),
      this.db.po_checklists.findMany({
        where: {
          tenant_id: user.tenant_id,
          project_id: id,
          deleted_at: null,
        },
        include: {
          _count: { select: { items: true } },
        },
        orderBy: [{ updated_at: 'desc' }],
      }),
      this.db.po_work_orders.findMany({
        where: {
          tenant_id: user.tenant_id,
          project_id: id,
          deleted_at: null,
        },
        include: {
          incident: { select: { id: true, number: true, title: true } },
          status: { select: { id: true, name: true, code: true, color: true } },
          owner_user: { select: { id: true, full_name: true, email: true } },
        },
        orderBy: [{ created_at: 'desc' }],
      }),
      this.findRelatedEvents(user, 'projects', id),
      this.db.po_work_order_appointments.findMany({
        where: {
          tenant_id: user.tenant_id,
          work_order: {
            is: {
              project_id: id,
              deleted_at: null,
            },
          },
        },
        include: {
          work_order: {
            select: {
              id: true,
              code: true,
              title: true,
              status: { select: { id: true, name: true, code: true, color: true } },
            },
          },
          appointment: {
            include: {
              resource: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ created_at: 'desc' }],
      }),
    ]);

    const items: Array<Record<string, any>> = [...this.buildProjectSummaryTimeline(project)];

    projectProcesses.forEach((row: any) => {
      items.push({
        id: `project-process-${row.id}`,
        kind: 'PROCESS_LINK',
        occurred_at: row.created_at,
        title: row.process?.process_number || 'Processo vinculado',
        subtitle: project.code || project.name || null,
        description: row.process?.exporter || row.process?.importer || null,
        meta: {
          process_id: row.process_id,
        },
      });
    });

    milestones.forEach((row: any) => {
      items.push({
        id: `project-milestone-${row.id}`,
        kind: 'MILESTONE',
        occurred_at: row.due_date || row.created_at,
        title: row.title || 'Marco',
        subtitle: row.status || null,
        description: row.description || null,
      });
    });

    deliverables.forEach((row: any) => {
      items.push({
        id: `project-deliverable-${row.id}`,
        kind: 'DELIVERABLE',
        occurred_at: row.due_date || row.created_at,
        title: row.title || 'Entrega',
        subtitle: row.status?.name || null,
        description: row.description || null,
      });
    });

    checklists.forEach((row: any) => {
      items.push({
        id: `project-checklist-${row.id}`,
        kind: 'CHECKLIST',
        occurred_at: row.updated_at || row.created_at,
        title: row.name || 'Checklist',
        subtitle: row._count?.items != null ? `${row._count.items} itens` : null,
        description: null,
      });
    });

    workOrders.forEach((row: any) => {
      items.push({
        id: `project-work-order-${row.id}`,
        kind: 'WORK_ORDER',
        occurred_at: row.created_at || row.planned_start || row.updated_at,
        title: row.title || row.code || 'Work order',
        subtitle: row.code || row.status?.name || null,
        description: row.description || row.incident?.title || null,
        meta: {
          status: row.status?.name || null,
          owner: row.owner_user?.full_name || null,
        },
      });
    });

    events.forEach((row: any) => {
      items.push({
        id: `project-event-${row.id}`,
        kind: 'EVENT',
        occurred_at: row.start_time || row.created_at,
        title: row.title || 'Evento',
        subtitle: row.related_table || null,
        description: row.description || null,
        meta: {
          type: row.type,
          status: row.status,
          finished: row.finished,
        },
      });
    });

    linkedAppointments.forEach((row: any) => {
      const appointment = row.appointment;
      items.push({
        id: `project-appointment-${row.id}`,
        kind: 'APPOINTMENT',
        occurred_at: appointment?.start_at || row.created_at,
        title: appointment?.title || 'Atividade',
        subtitle: appointment?.resource?.name || row.work_order?.code || null,
        description: appointment?.notes || row.work_order?.title || null,
        meta: {
          work_order_code: row.work_order?.code || null,
          status: appointment?.status || null,
        },
      });
    });

    return items.sort((a, b) => new Date(b.occurred_at || 0).getTime() - new Date(a.occurred_at || 0).getTime());
  }

  private async getProjectRelated(user: AuthUser, id: string) {
    await this.findResourceById(user, 'projects', id);
    const [projectProcesses, milestones, deliverables, checklists, workOrders, events, linkedAppointments] = await Promise.all([
      this.db.po_project_processes.findMany({
        where: {
          tenant_id: user.tenant_id,
          project_id: id,
        },
        include: {
          process: { select: { id: true, process_number: true, exporter: true, importer: true } },
        },
        orderBy: [{ sort_order: 'asc' }, { created_at: 'desc' }],
      }),
      this.db.po_milestones.findMany({
        where: {
          tenant_id: user.tenant_id,
          project_id: id,
          deleted_at: null,
        },
        include: {
          project: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ due_date: 'asc' }, { created_at: 'desc' }],
      }),
      this.db.po_deliverables.findMany({
        where: {
          tenant_id: user.tenant_id,
          project_id: id,
          deleted_at: null,
        },
        include: {
          project: { select: { id: true, code: true, name: true } },
          currency: { select: { id: true, code: true, symbol: true } },
          status: { select: { id: true, name: true, code: true, color: true } },
        },
        orderBy: [{ due_date: 'asc' }, { created_at: 'desc' }],
      }),
      this.db.po_checklists.findMany({
        where: {
          tenant_id: user.tenant_id,
          project_id: id,
          deleted_at: null,
        },
        include: {
          project: { select: { id: true, code: true, name: true } },
          _count: { select: { items: true } },
        },
        orderBy: [{ updated_at: 'desc' }],
      }),
      this.db.po_work_orders.findMany({
        where: {
          tenant_id: user.tenant_id,
          project_id: id,
          deleted_at: null,
        },
        include: {
          incident: { select: { id: true, number: true, title: true } },
          status: { select: { id: true, name: true, code: true, color: true } },
          owner_user: { select: { id: true, full_name: true, email: true } },
          _count: { select: { assignments: true, appointments: true } },
        },
        orderBy: [{ updated_at: 'desc' }],
      }),
      this.findRelatedEvents(user, 'projects', id),
      this.db.po_work_order_appointments.findMany({
        where: {
          tenant_id: user.tenant_id,
          work_order: {
            is: {
              project_id: id,
              deleted_at: null,
            },
          },
        },
        include: {
          work_order: {
            select: { id: true, code: true, title: true },
          },
          appointment: {
            include: {
              resource: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ created_at: 'desc' }],
      }),
    ]);

    return {
      project_processes: projectProcesses,
      milestones,
      deliverables,
      checklists,
      work_orders: workOrders,
      events,
      activities: linkedAppointments,
    };
  }

  private async getWorkOrderTimeline(user: AuthUser, id: string) {
    const workOrder = await this.findResourceById(user, 'work-orders', id);
    const [assignments, appointments, events] = await Promise.all([
      this.db.po_work_order_assignments.findMany({
        where: {
          tenant_id: user.tenant_id,
          work_order_id: id,
        },
        include: {
          resource: { select: { id: true, name: true, capacity_per_day: true } },
          role: { select: { id: true, name: true, code: true } },
        },
        orderBy: [{ created_at: 'desc' }],
      }),
      this.db.po_work_order_appointments.findMany({
        where: {
          tenant_id: user.tenant_id,
          work_order_id: id,
        },
        include: {
          appointment: {
            include: {
              resource: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ created_at: 'desc' }],
      }),
      this.findRelatedEvents(user, 'work-orders', id),
    ]);

    const items: Array<Record<string, any>> = [...this.buildWorkOrderSummaryTimeline(workOrder)];

    assignments.forEach((row: any) => {
      items.push({
        id: `work-order-assignment-${row.id}`,
        kind: 'ASSIGNMENT',
        occurred_at: row.created_at,
        title: row.resource?.name || 'Recurso alocado',
        subtitle: row.role?.name || null,
        description:
          row.planned_hours != null
            ? `${row.planned_hours}h planejadas`
            : row.allocation_percent != null
              ? `${row.allocation_percent}% de alocacao`
              : null,
        meta: {
          resource_id: row.resource_id,
          role_id: row.role_id,
        },
      });
    });

    appointments.forEach((row: any) => {
      const appointment = row.appointment;
      items.push({
        id: `work-order-appointment-${row.id}`,
        kind: 'APPOINTMENT',
        occurred_at: appointment?.start_at || row.created_at,
        title: appointment?.title || 'Atividade',
        subtitle: appointment?.resource?.name || null,
        description: appointment?.notes || null,
        meta: {
          status: appointment?.status || null,
          end_at: appointment?.end_at || null,
        },
      });
    });

    events.forEach((row: any) => {
      items.push({
        id: `work-order-event-${row.id}`,
        kind: 'EVENT',
        occurred_at: row.start_time || row.created_at,
        title: row.title || 'Evento',
        subtitle: row.related_table || null,
        description: row.description || null,
        meta: {
          type: row.type,
          status: row.status,
          finished: row.finished,
        },
      });
    });

    return items.sort((a, b) => new Date(b.occurred_at || 0).getTime() - new Date(a.occurred_at || 0).getTime());
  }

  private async getWorkOrderRelated(user: AuthUser, id: string) {
    await this.findResourceById(user, 'work-orders', id);
    const [assignments, appointments, events] = await Promise.all([
      this.db.po_work_order_assignments.findMany({
        where: {
          tenant_id: user.tenant_id,
          work_order_id: id,
        },
        include: {
          resource: { select: { id: true, name: true, capacity_per_day: true } },
          role: { select: { id: true, name: true, code: true } },
        },
        orderBy: [{ created_at: 'desc' }],
      }),
      this.db.po_work_order_appointments.findMany({
        where: {
          tenant_id: user.tenant_id,
          work_order_id: id,
        },
        include: {
          appointment: {
            include: {
              resource: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ created_at: 'desc' }],
      }),
      this.findRelatedEvents(user, 'work-orders', id),
    ]);

    return {
      assignments,
      appointments,
      events,
    };
  }

  listResource(user: AuthUser, resourceKey: string, query: ListQuery = {}) {
    return this.listByConfig(user, this.getConfig(resourceKey), query);
  }

  findResourceById(user: AuthUser, resourceKey: string, id: string) {
    return this.findByIdConfig(user, this.getConfig(resourceKey), id);
  }

  createResource(user: AuthUser, resourceKey: string, dto: Record<string, any>) {
    return this.createByConfig(user, this.getConfig(resourceKey), dto);
  }

  updateResource(user: AuthUser, resourceKey: string, id: string, dto: Record<string, any>) {
    return this.updateByConfig(user, this.getConfig(resourceKey), id, dto);
  }

  removeResource(user: AuthUser, resourceKey: string, id: string) {
    return this.removeByConfig(user, this.getConfig(resourceKey), id);
  }

  async createWorkOrder(user: AuthUser, dto: CreatePoWorkOrderDto) {
    this.assertCanWrite(user);
    const data = this.mapCommonData(dto as any);

    const created = await this.prisma.transaction(async (tx) => {
      const payload = { ...data } as any;
      if (!payload.status_id) {
        payload.status_id = await this.resolveDefaultStatusId(tx, 'po_work_order_statuses', user.tenant_id);
      }
      payload.priority = String(payload.priority || 'MEDIUM').toUpperCase();
      payload.created_by_user_id = user.id;
      if (!payload.code) {
        payload.code = await this.generateWorkOrderCode(tx, user.tenant_id);
      } else {
        payload.code = String(payload.code).trim().toUpperCase();
      }

      return tx.po_work_orders.create({
        data: {
          ...payload,
          tenant_id: user.tenant_id,
        },
      });
    });

    return this.findResourceById(user, 'work-orders', created.id);
  }

  async updateChecklistItemMove(user: AuthUser, id: string, dto: MovePoChecklistItemDto) {
    this.assertCanWrite(user);
    const existing = await this.findResourceById(user, 'checklist-items', id);
    await this.db.po_checklist_items.updateMany({
      where: {
        tenant_id: user.tenant_id,
        id: existing.id,
        deleted_at: null,
      },
      data: {
        ...(dto.status !== undefined ? { status: String(dto.status).toUpperCase() } : {}),
        ...(dto.sort_order !== undefined ? { sort_order: this.toInt(dto.sort_order) } : {}),
        updated_at: new Date(),
      },
    });
    return this.findResourceById(user, 'checklist-items', id);
  }

  async createChecklistItem(user: AuthUser, dto: CreatePoChecklistItemDto) {
    return this.createResource(user, 'checklist-items', {
      ...dto,
      status: String(dto.status || 'OPEN').toUpperCase(),
    } as any);
  }

  async createWorkOrderAssignment(user: AuthUser, workOrderId: string, dto: Record<string, any>) {
    return this.createResource(user, 'work-order-assignments', {
      ...dto,
      work_order_id: workOrderId,
    });
  }

  async listWorkOrderAssignments(user: AuthUser, workOrderId: string, query: ListQuery = {}) {
    return this.listResource(user, 'work-order-assignments', {
      ...query,
      work_order_id: workOrderId,
    });
  }

  async listWorkOrderAppointments(user: AuthUser, workOrderId: string, query: ListQuery = {}) {
    return this.listResource(user, 'work-order-appointments', {
      ...query,
      work_order_id: workOrderId,
    });
  }

  async createWorkOrderAppointment(user: AuthUser, workOrderId: string, dto: Record<string, any>) {
    return this.createResource(user, 'work-order-appointments', {
      ...dto,
      work_order_id: workOrderId,
    });
  }

  async generateAppointmentsFromWorkOrder(
    user: AuthUser,
    workOrderId: string,
    dto: GeneratePoWorkOrderAppointmentsDto,
  ) {
    this.assertCanWrite(user);

    const workOrder = await this.db.po_work_orders.findFirst({
      where: {
        tenant_id: user.tenant_id,
        id: workOrderId,
        deleted_at: null,
      },
      include: {
        assignments: {
          include: { resource: { select: { id: true, name: true, is_active: true } } },
          orderBy: [{ created_at: 'asc' }],
        },
        incident: {
          select: { id: true, number: true, title: true },
        },
      },
    });

    if (!workOrder) throw new NotFoundException('Work order nao encontrada.');

    const startAt = this.toDate(dto.start_at) || workOrder.planned_start || null;
    const endAt = this.toDate(dto.end_at) || workOrder.planned_end || null;
    if (!startAt || !endAt || endAt <= startAt) {
      throw new BadRequestException('Informe periodo valido para gerar agendamentos.');
    }

    const explicitResources = Array.isArray(dto.resource_ids)
      ? dto.resource_ids.map((item) => String(item || '').trim()).filter(Boolean)
      : [];

    const resourceIds = explicitResources.length
      ? explicitResources
      : (workOrder.assignments || []).map((item: any) => String(item.resource_id || '').trim()).filter(Boolean);

    if (!resourceIds.length) {
      throw new BadRequestException('A work order nao possui recursos alocados para gerar agendamento.');
    }

    const resources = await this.db.service_resources.findMany({
      where: {
        tenant_id: user.tenant_id,
        id: { in: resourceIds },
        is_active: true,
      },
      select: { id: true, name: true },
    });

    if (!resources.length) throw new BadRequestException('Nenhum recurso ativo encontrado para agendamento.');

    const appointmentStatus = String(dto.appointment_status || 'SCHEDULED').toUpperCase() as AppointmentStatus;
    const baseTitle = String(dto.title || '').trim() || `${workOrder.code} - ${workOrder.title}`;
    const note = dto.notes ? String(dto.notes).trim() : null;

    const result = await this.prisma.transaction(async (tx) => {
      const createdLinks: Array<{ id: string }> = [];

      for (const resource of resources) {
        const appointment = await tx.service_appointments.create({
          data: {
            tenant_id: user.tenant_id,
            resource_id: resource.id,
            incident_id: workOrder.incident_id || null,
            title: `${baseTitle} (${resource.name})`,
            start_at: startAt,
            end_at: endAt,
            status: appointmentStatus,
            notes: note,
          },
        });

        const link = await tx.po_work_order_appointments.create({
          data: {
            tenant_id: user.tenant_id,
            work_order_id: workOrderId,
            appointment_id: appointment.id,
          },
          select: { id: true },
        });
        createdLinks.push(link);
      }

      return createdLinks;
    });

    const ids = result.map((item) => item.id);
    const links = await this.db.po_work_order_appointments.findMany({
      where: {
        tenant_id: user.tenant_id,
        id: { in: ids },
      },
      include: this.resources['work-order-appointments'].include,
      orderBy: [{ created_at: 'desc' }],
    });

    return {
      created: links.length,
      items: links,
    };
  }

  async setupDefaults(user: AuthUser, dto: SetupPoDefaultsDto = {}) {
    this.assertCanWrite(user);
    const skip = new Set((dto.skip || []).map((item) => String(item || '').trim().toLowerCase()));

    const created = {
      project_statuses: 0,
      deliverable_statuses: 0,
      work_order_statuses: 0,
      resource_roles: 0,
    };

    await this.prisma.transaction(async (tx) => {
      if (!skip.has('project_statuses')) {
        const rows = [
          { code: 'PLANNING', name: 'Planejamento', color: '#1c84c6', sort_order: 10, is_default: true },
          { code: 'IN_PROGRESS', name: 'Em andamento', color: '#f8ac59', sort_order: 20, is_default: false },
          { code: 'DONE', name: 'Concluido', color: '#1ab394', sort_order: 30, is_default: false },
          { code: 'CANCELED', name: 'Cancelado', color: '#ed5565', sort_order: 40, is_default: false },
        ];
        for (const row of rows) {
          const exists = await tx.po_project_statuses.findFirst({
            where: { tenant_id: user.tenant_id, code: row.code, deleted_at: null },
            select: { id: true },
          });
          if (exists) continue;
          await tx.po_project_statuses.create({ data: { tenant_id: user.tenant_id, ...row, is_active: true } });
          created.project_statuses += 1;
        }
      }

      if (!skip.has('deliverable_statuses')) {
        const rows = [
          { code: 'PLANNED', name: 'Planejada', color: '#1c84c6', sort_order: 10, is_default: true },
          { code: 'IN_PROGRESS', name: 'Em execucao', color: '#f8ac59', sort_order: 20, is_default: false },
          { code: 'DELIVERED', name: 'Entregue', color: '#1ab394', sort_order: 30, is_default: false },
          { code: 'CANCELED', name: 'Cancelada', color: '#ed5565', sort_order: 40, is_default: false },
        ];
        for (const row of rows) {
          const exists = await tx.po_deliverable_statuses.findFirst({
            where: { tenant_id: user.tenant_id, code: row.code, deleted_at: null },
            select: { id: true },
          });
          if (exists) continue;
          await tx.po_deliverable_statuses.create({ data: { tenant_id: user.tenant_id, ...row, is_active: true } });
          created.deliverable_statuses += 1;
        }
      }

      if (!skip.has('work_order_statuses')) {
        const rows = [
          { code: 'OPEN', name: 'Aberta', color: '#1c84c6', sort_order: 10, is_default: true },
          { code: 'DOING', name: 'Em execucao', color: '#f8ac59', sort_order: 20, is_default: false },
          { code: 'BLOCKED', name: 'Bloqueada', color: '#ed5565', sort_order: 30, is_default: false },
          { code: 'DONE', name: 'Concluida', color: '#1ab394', sort_order: 40, is_default: false },
          { code: 'CANCELED', name: 'Cancelada', color: '#a7b1c2', sort_order: 50, is_default: false },
        ];
        for (const row of rows) {
          const exists = await tx.po_work_order_statuses.findFirst({
            where: { tenant_id: user.tenant_id, code: row.code, deleted_at: null },
            select: { id: true },
          });
          if (exists) continue;
          await tx.po_work_order_statuses.create({ data: { tenant_id: user.tenant_id, ...row, is_active: true } });
          created.work_order_statuses += 1;
        }
      }

      if (!skip.has('resource_roles')) {
        const rows = [
          { code: 'LEAD', name: 'Responsavel tecnico', description: 'Responsavel principal da execucao' },
          { code: 'ANALYST', name: 'Analista', description: 'Execucao operacional' },
          { code: 'SUPPORT', name: 'Suporte', description: 'Apoio na entrega' },
        ];
        for (const row of rows) {
          const exists = await tx.po_resource_roles.findFirst({
            where: { tenant_id: user.tenant_id, code: row.code, deleted_at: null },
            select: { id: true },
          });
          if (exists) continue;
          await tx.po_resource_roles.create({
            data: { tenant_id: user.tenant_id, ...row, is_active: true },
          });
          created.resource_roles += 1;
        }
      }
    });

    return { ok: true, created };
  }
}
