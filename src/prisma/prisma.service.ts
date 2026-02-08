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
  public readonly process_types: PrismaClient['process_types'];
  public readonly transport_types: PrismaClient['transport_types'];
  public readonly transport_statuses: PrismaClient['transport_statuses'];

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
    'password_resets',
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

            // findUnique can't be safely AND-filtered by Prisma. Convert to findFirst.
            if (operation === 'findUnique') {
              operation = 'findFirst';
            }

            const actionsWithWhere = new Set([
              'findFirst',
              'findMany',
              'update',
              'updateMany',
              'delete',
              'deleteMany',
              'upsert',
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
              args.where = andTenantWhere(args.where, tenantId);
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
    this.process_types = this.client.process_types;
    this.transport_types = this.client.transport_types;
    this.transport_statuses = this.client.transport_statuses;
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