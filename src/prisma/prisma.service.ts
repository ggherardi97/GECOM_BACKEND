import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { getTenantId } from '../common/tenant/tenant-context';

type PrismaMiddlewareParams = {
  model?: string;
  action: string;
  args: any;
};

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly client: PrismaClient;

  // Expose delegates (so existing code keeps working: this.prisma.users.findMany, etc.)
  public readonly users: PrismaClient['users'];
  public readonly companies: PrismaClient['companies'];
  public readonly processes: PrismaClient['processes'];
  public readonly transports: PrismaClient['transports'];
  public readonly invoices: PrismaClient['invoices'];
  public readonly invoice_lines: PrismaClient['invoice_lines'];
  public readonly products: PrismaClient['products'];
  public readonly documents: PrismaClient['documents'];
  public readonly events: PrismaClient['events'];
  public readonly sessions: PrismaClient['sessions'];
  public readonly password_resets: PrismaClient['password_resets'];
  public readonly currencies: PrismaClient['currencies'];
  public readonly tenants: PrismaClient['tenants'];
  public readonly process_types: PrismaClient['process_types'];
  public readonly notifications: PrismaClient['notifications'];
  public readonly notification_reads: PrismaClient['notification_reads'];
  public readonly boards: PrismaClient['boards'];
  public readonly board_columns: PrismaClient['board_columns'];
  public readonly board_cards: PrismaClient['board_cards'];
  public readonly board_tags: PrismaClient['board_tags'];
  public readonly board_card_tags: PrismaClient['board_card_tags'];
  public readonly board_card_comments: PrismaClient['board_card_comments'];
  public readonly board_card_audit: PrismaClient['board_card_audit'];
  public readonly board_card_assignees: PrismaClient['board_card_assignees'];
  public readonly lead_pipeline_stages: PrismaClient['lead_pipeline_stages'];
  public readonly leads: PrismaClient['leads'];
  public readonly lead_stage_history: PrismaClient['lead_stage_history'];
  public readonly lead_activities: PrismaClient['lead_activities'];
  public readonly lead_tags: PrismaClient['lead_tags'];
  public readonly lead_tag_links: PrismaClient['lead_tag_links'];
  public readonly transport_types: PrismaClient['transport_types'];
  public readonly transport_statuses: PrismaClient['transport_statuses'];
  public readonly saved_views: PrismaClient['saved_views'];
  public readonly user_default_views: PrismaClient['user_default_views'];
  public readonly tracking_configs: PrismaClient['tracking_configs'];
  public readonly tracking_links: PrismaClient['tracking_links'];
  public readonly incidents: PrismaClient['incidents'];
  public readonly sla_policies: PrismaClient['sla_policies'];
  public readonly sla_kpis: PrismaClient['sla_kpis'];
  public readonly sla_instances: PrismaClient['sla_instances'];
  public readonly sla_instance_kpis: PrismaClient['sla_instance_kpis'];
  public readonly sla_events: PrismaClient['sla_events'];
  public readonly service_queues: PrismaClient['service_queues'];
  public readonly service_queue_members: PrismaClient['service_queue_members'];
  public readonly customer_assets: PrismaClient['customer_assets'];
  public readonly service_subjects: PrismaClient['service_subjects'];
  public readonly service_calendars: PrismaClient['service_calendars'];
  public readonly service_calendar_rules: PrismaClient['service_calendar_rules'];
  public readonly service_calendar_exceptions: PrismaClient['service_calendar_exceptions'];
  public readonly service_resources: PrismaClient['service_resources'];
  public readonly service_appointments: PrismaClient['service_appointments'];
  public readonly service_task_types: PrismaClient['service_task_types'];
  public readonly service_tasks: PrismaClient['service_tasks'];
  public readonly trade_simulations: PrismaClient['trade_simulations'];
  public readonly trade_simulation_items: PrismaClient['trade_simulation_items'];
  public readonly trade_simulation_costs: PrismaClient['trade_simulation_costs'];
  public readonly trade_simulation_taxes: PrismaClient['trade_simulation_taxes'];
  public readonly tax_profiles: PrismaClient['tax_profiles'];
  public readonly ncm_tax_rules: PrismaClient['ncm_tax_rules'];
  public readonly status_configs: PrismaClient['status_configs'];
  public readonly opportunities: PrismaClient['opportunities'];
  public readonly opportunity_lines: PrismaClient['opportunity_lines'];
  public readonly sales_approvals: PrismaClient['sales_approvals'];
  public readonly price_tables: PrismaClient['price_tables'];
  public readonly price_table_items: PrismaClient['price_table_items'];
  public readonly sales_goals: PrismaClient['sales_goals'];
  public readonly sales_commissions: PrismaClient['sales_commissions'];
  public readonly contracts: PrismaClient['contracts'];
  public readonly contract_lines: PrismaClient['contract_lines'];
  public readonly contract_invoice_links: PrismaClient['contract_invoice_links'];
  public readonly automations: PrismaClient['automations'];
  public readonly automation_executions: PrismaClient['automation_executions'];
  public readonly modules: PrismaClient['modules'];
  public readonly plans: PrismaClient['plans'];
  public readonly plan_modules: PrismaClient['plan_modules'];
  public readonly tenant_subscriptions: PrismaClient['tenant_subscriptions'];
  public readonly tenant_module_overrides: PrismaClient['tenant_module_overrides'];

  // Models that MUST be tenant-scoped
  private static readonly tenantModels = new Set<string>([
    'users',
    'companies',
    'processes',
    'transports',
    'invoices',
    'invoice_lines',
    'products',
    'documents',
    'events',
    'sessions',
    'saved_views',
    'user_default_views',
    'tracking_configs',
    'tracking_links',
    'password_resets',
    'notifications',
    'notification_reads',
    'boards',
    'board_columns',
    'board_cards',
    'board_tags',
    'board_card_tags',
    'board_card_comments',
    'board_card_audit',
    'board_card_assignees',
    'lead_pipeline_stages',
    'leads',
    'lead_stage_history',
    'lead_activities',
    'lead_tags',
    'lead_tag_links',
    'incidents',
    'sla_policies',
    'sla_kpis',
    'sla_instances',
    'sla_instance_kpis',
    'sla_events',
    'service_queues',
    'service_queue_members',
    'customer_assets',
    'service_subjects',
    'service_calendars',
    'service_calendar_rules',
    'service_calendar_exceptions',
    'service_resources',
    'service_appointments',
    'service_task_types',
    'service_tasks',
    'trade_simulations',
    'trade_simulation_items',
    'trade_simulation_costs',
    'trade_simulation_taxes',
    'tax_profiles',
    'ncm_tax_rules',
    'status_configs',
    'opportunities',
    'opportunity_lines',
    'sales_approvals',
    'price_tables',
    'price_table_items',
    'sales_goals',
    'sales_commissions',
    'contracts',
    'contract_lines',
    'contract_invoice_links',
    'automations',
    'automation_executions',
    'financial_cost_centers',
    'financial_categories',
    'financial_bank_accounts',
    'financial_bank_movements',
    'financial_receivables',
    'financial_receivable_payments',
    'financial_payables',
    'financial_payable_payments',
    'hr_employment_statuses',
    'hr_document_types',
    'hr_marital_statuses',
    'hr_positions',
    'hr_work_locations',
    'hr_departments',
    'hr_employees',
    'hr_department_assignments',
    'hr_work_schedules',
    'hr_employee_schedule_assignments',
    'hr_leave_types',
    'hr_leave_requests',
    'hr_skill_categories',
    'hr_skills',
    'hr_employee_skills',
    'hr_certifications',
    'hr_employee_certifications',
    'hr_lifecycle_templates',
    'hr_lifecycle_stages',
    'hr_lifecycle_tasks',
    'hr_employee_lifecycles',
    'hr_employee_lifecycle_tasks',
    'po_project_statuses',
    'po_deliverable_statuses',
    'po_work_order_statuses',
    'po_resource_roles',
    'po_projects',
    'po_project_processes',
    'po_milestones',
    'po_deliverables',
    'po_checklists',
    'po_checklist_items',
    'po_work_orders',
    'po_work_order_assignments',
    'po_work_order_appointments',

    // add others that have tenant_id
  ]);

  // Models allowed to run WITHOUT tenant context (login/refresh/reset flows)
  private static readonly allowNoTenantModels = new Set<string>([
    'users',
    'sessions',
    'password_resets',
  ]);

  constructor() {
    const base = new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
    });

    const extended = base.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }: any) {
            const params: PrismaMiddlewareParams = {
              model,
              action: operation,
              args,
            };

            // If model is not tenant-scoped, just run
            if (!params.model || !PrismaService.tenantModels.has(params.model)) {
              return query(args);
            }

            const tenantId = getTenantId();

            // No tenant in context: allow only auth-related models
            if (!tenantId) {
              if (!PrismaService.allowNoTenantModels.has(params.model)) {
                throw new Error(`Tenant context is missing for model "${params.model}".`);
              }
              return query(args);
            }

            // Ensure args exists
            args = args ?? {};

            const actionsWithWhere = new Set([
              'findFirst',
              'findMany',
              'updateMany',
              'deleteMany',
              'count',
              'aggregate',
              'groupBy',
            ]);

            if (actionsWithWhere.has(operation)) {
              args.where = andTenantWhere(args.where, tenantId);
            }

            if (operation === 'create') {
              args.data = applyTenantToData(args.data, tenantId);
            }

            if (operation === 'createMany') {
              if (Array.isArray(args.data)) {
                args.data = args.data.map((row: any) => applyTenantToData(row, tenantId));
              } else {
                args.data = applyTenantToData(args.data, tenantId);
              }
            }

            if (operation === 'upsert') {
              args.create = applyTenantToData(args.create, tenantId);
              // update path: protected by where
            }

            // run with modified args
            return query(args);
          },
        },
      },
    }) as PrismaClient;

    this.client = extended;

    // bind delegates
    this.users = this.client.users;
    this.companies = this.client.companies;
    this.processes = this.client.processes;
    this.transports = this.client.transports;
    this.invoices = this.client.invoices;
    this.invoice_lines = this.client.invoice_lines;
    this.products = this.client.products;
    this.documents = this.client.documents;
    this.events = this.client.events;
    this.sessions = this.client.sessions;
    this.password_resets = this.client.password_resets;
    this.currencies = this.client.currencies;
    this.tenants = this.client.tenants;
    this.process_types = this.client.process_types;
    this.transport_types = this.client.transport_types;
    this.transport_statuses = this.client.transport_statuses;
    this.saved_views = this.client.saved_views;
    this.user_default_views = this.client.user_default_views;
    this.tracking_configs = this.client.tracking_configs;
    this.tracking_links = this.client.tracking_links;
    this.incidents = this.client.incidents;
    this.sla_policies = this.client.sla_policies;
    this.sla_kpis = this.client.sla_kpis;
    this.sla_instances = this.client.sla_instances;
    this.sla_instance_kpis = this.client.sla_instance_kpis;
    this.sla_events = this.client.sla_events;
    this.service_queues = this.client.service_queues;
    this.service_queue_members = this.client.service_queue_members;
    this.customer_assets = this.client.customer_assets;
    this.service_subjects = this.client.service_subjects;
    this.service_calendars = this.client.service_calendars;
    this.service_calendar_rules = this.client.service_calendar_rules;
    this.service_calendar_exceptions = this.client.service_calendar_exceptions;
    this.service_resources = this.client.service_resources;
    this.service_appointments = this.client.service_appointments;
    this.service_task_types = this.client.service_task_types;
    this.service_tasks = this.client.service_tasks;
    this.trade_simulations = this.client.trade_simulations;
    this.trade_simulation_items = this.client.trade_simulation_items;
    this.trade_simulation_costs = this.client.trade_simulation_costs;
    this.trade_simulation_taxes = this.client.trade_simulation_taxes;
    this.tax_profiles = this.client.tax_profiles;
    this.ncm_tax_rules = this.client.ncm_tax_rules;
    this.status_configs = this.client.status_configs;
    this.opportunities = this.client.opportunities;
    this.opportunity_lines = this.client.opportunity_lines;
    this.sales_approvals = this.client.sales_approvals;
    this.price_tables = this.client.price_tables;
    this.price_table_items = this.client.price_table_items;
    this.sales_goals = this.client.sales_goals;
    this.sales_commissions = this.client.sales_commissions;
    this.contracts = this.client.contracts;
    this.contract_lines = this.client.contract_lines;
    this.contract_invoice_links = this.client.contract_invoice_links;
    this.automations = this.client.automations;
    this.automation_executions = this.client.automation_executions;
    this.modules = this.client.modules;
    this.plans = this.client.plans;
    this.plan_modules = this.client.plan_modules;
    this.tenant_subscriptions = this.client.tenant_subscriptions;
    this.tenant_module_overrides = this.client.tenant_module_overrides;
    this.notifications = this.client.notifications;
    this.notification_reads = this.client.notification_reads;
    this.boards = this.client.boards;
    this.board_columns = this.client.board_columns;
    this.board_cards = this.client.board_cards;
    this.board_tags = this.client.board_tags;
    this.board_card_tags = this.client.board_card_tags;
    this.board_card_comments = this.client.board_card_comments;
    this.board_card_audit = this.client.board_card_audit;
    this.board_card_assignees = this.client.board_card_assignees;
    this.lead_pipeline_stages = this.client.lead_pipeline_stages;
    this.leads = this.client.leads;
    this.lead_stage_history = this.client.lead_stage_history;
    this.lead_activities = this.client.lead_activities;
    this.lead_tags = this.client.lead_tags;
    this.lead_tag_links = this.client.lead_tag_links;

  }

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }

  async transaction<T>(fn: (prisma: PrismaClient) => Promise<T>): Promise<T> {
    return await this.client.$transaction(fn);
  }

  // OPTIONAL: if you need raw client sometimes
  get raw(): PrismaClient {
    return this.client;
  }
}

function andTenantWhere(where: any, tenantId: string): any {
  const tenantClause = { tenant_id: tenantId };

  if (!where || Object.keys(where).length === 0) {
    return tenantClause;
  }

  if (typeof where === 'object' && where.tenant_id) {
    return where;
  }

  return { AND: [where, tenantClause] };
}

function applyTenantToData(data: any, tenantId: string): any {
  if (!data || typeof data !== 'object') return data;

  if (data.tenant_id && data.tenant_id !== tenantId) {
    throw new Error('Invalid tenant_id in payload.');
  }

  return { ...data, tenant_id: tenantId };
}
