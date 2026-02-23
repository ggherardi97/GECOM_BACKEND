import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProcessDTO } from './dto/create-process.dto';

// IMPORTANT: use type-only import and alias to avoid conflicts with runtime variables.
import type { processes, events as EventRow } from '@prisma/client';

type CreateProcessInput = Omit<CreateProcessDTO, 'process_number' | 'status' | 'status_config_id'> & {
  process_number: string;
  status: number;
  status_config_id?: string | null;
};

@Injectable()
export class ProcessRepository {
  private logger = new Logger(ProcessRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  // -------------------- Dashboard select --------------------
  private static readonly dashboardSelect = {
    id: true,
    process_number: true,
    status: true,
    status_config_id: true,
    total_value: true,
    completed: true,
    invoice: true,
    ship_date: true,
    created_on: true,
    status_config: {
      select: {
        id: true,
        code: true,
        label: true,
        color: true,
        entity: true,
      },
    },
    companies: {
      select: {
        id: true,
        company_name: true,
        phone: true,
      },
    },
    users: {
      select:{
        id: true,
        full_name: true,
        phonenumber:true,
      }
    }
  } as const;

  async create(data: CreateProcessInput, tenantId: string): Promise<processes> {
    try {
      return await this.prisma.processes.create({
        data: {
          tenant_id: tenantId,
          process_number: data.process_number,
          status: data.status,
          status_config_id: data.status_config_id ?? null,
          total_value: data.total_value ?? 0,
          invoice: data.invoice ?? null,
          company_id: data.company_id,
          process_type_id: data.process_type_id,
          primary_contact_id: data.primary_contact_id,
          ship_date: data.ship_date ? new Date(data.ship_date) : null,
          completed: data.completed ?? 0,
        },
      });
    } catch (error) {
      this.logger.error('Error creating process:', error as any);
      throw error;
    }
  }

  // -------------------- Full (existing) --------------------
  async findAll(
    tenantId: string,
    filter?: { status?: number; status_config_id?: string },
  ): Promise<processes[]> {
    return this.prisma.processes.findMany({
      where: {
        tenant_id: tenantId,
        deleted_at: null,
        ...(filter?.status !== undefined ? { status: filter.status } : {}),
        ...(filter?.status_config_id ? { status_config_id: filter.status_config_id } : {}),
      } as any,
      include: {
        companies: true,
        process_types: true,
        transports: true,
        status_config: true,
        users: {
          select: {
            id: true,
            full_name: true,
            email: true,
          },
        },
      },
      orderBy: {
        created_on: 'desc',
      },
    });
  }

  async findById(id: string, tenantId: string): Promise<processes | null> {
    return this.prisma.processes.findFirst({
      where: { id, tenant_id: tenantId } as any,
      include: {
        companies: true,
        process_types: true,
        transports: true,
        status_config: true,
        users: {
          select: {
            id: true,
            full_name: true,
            email: true,
          },
        },
      },
    });
  }

  async findByCompanyId(
    companyId: string,
    tenantId: string,
    filter?: { status?: number; status_config_id?: string },
  ): Promise<processes[]> {
    return this.prisma.processes.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        deleted_at: null,
        ...(filter?.status !== undefined ? { status: filter.status } : {}),
        ...(filter?.status_config_id ? { status_config_id: filter.status_config_id } : {}),
      } as any,
      include: {
        companies: true,
        process_types: true,
        transports: true,
        status_config: true,
        users: {
          select: {
            id: true,
            full_name: true,
            email: true,
          },
        },
      },
      orderBy: {
        created_on: 'desc',
      },
    });
  }

  // -------------------- Dashboard (new lightweight) --------------------
  async findAllDashboard(
    tenantId: string,
    filter?: { status?: number; status_config_id?: string },
  ): Promise<any[]> {
    return this.prisma.processes.findMany({
      where: {
        tenant_id: tenantId,
        deleted_at: null,
        ...(filter?.status !== undefined ? { status: filter.status } : {}),
        ...(filter?.status_config_id ? { status_config_id: filter.status_config_id } : {}),
      } as any,
      select: ProcessRepository.dashboardSelect as any,
      orderBy: {
        created_on: 'desc',
      },
    });
  }

  async findByCompanyIdDashboard(
    companyId: string,
    tenantId: string,
    filter?: { status?: number; status_config_id?: string },
  ): Promise<any[]> {
    return this.prisma.processes.findMany({
      where: {
        tenant_id: tenantId,
        company_id: companyId,
        deleted_at: null,
        ...(filter?.status !== undefined ? { status: filter.status } : {}),
        ...(filter?.status_config_id ? { status_config_id: filter.status_config_id } : {}),
      } as any,
      select: ProcessRepository.dashboardSelect as any,
      orderBy: {
        created_on: 'desc',
      },
    });
  }

  async findByProcessNumber(processNumber: string, tenantId: string): Promise<processes | null> {
    return this.prisma.processes.findFirst({
      where: {
        tenant_id: tenantId,
        process_number: processNumber,
        deleted_at: null,
      } as any,
    });
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: number,
    status_config_id?: string | null,
  ): Promise<processes | null> {
    const result = await this.prisma.processes.updateMany({
      where: { id, tenant_id: tenantId } as any,
      data: { status, status_config_id: status_config_id ?? null },
    });

    if (!result || result.count === 0) return null;
    return this.findById(id, tenantId);
  }

  async updateCompleted(id: string, tenantId: string, completed: number): Promise<processes | null> {
    const result = await this.prisma.processes.updateMany({
      where: { id, tenant_id: tenantId } as any,
      data: { completed },
    });

    if (!result || result.count === 0) return null;
    return this.findById(id, tenantId);
  }

  async softDelete(id: string, tenantId: string): Promise<processes | null> {
    const result = await this.prisma.processes.updateMany({
      where: { id, tenant_id: tenantId } as any,
      data: { deleted_at: new Date() },
    });

    if (!result || result.count === 0) return null;
    return this.findById(id, tenantId);
  }

  async update(
    id: string,
    tenantId: string,
    data: {
      completed?: number;
      status?: number;
      status_config_id?: string | null;
      total_value?: number;
      ship_date?: string | Date | null;
    }
  ): Promise<processes | null> {
    const updateData: any = {};

    if (data.completed !== undefined) updateData.completed = data.completed;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.status_config_id !== undefined) updateData.status_config_id = data.status_config_id;
    if (data.total_value !== undefined) updateData.total_value = data.total_value;

    if (data.ship_date !== undefined) {
      updateData.ship_date = data.ship_date == null ? null : new Date(data.ship_date);
    }

    const result = await this.prisma.processes.updateMany({
      where: { id, tenant_id: tenantId } as any,
      data: updateData,
    });

    if (!result || result.count === 0) return null;
    return this.findById(id, tenantId);
  }

  /**
   * Returns events for one or multiple processes.
   * We support both related_table values: 'process' and 'processes' (legacy).
   */
  async findEventsByProcessIds(processIds: string[], tenantId: string): Promise<EventRow[]> {
    if (!processIds || processIds.length === 0) return [];

    return this.prisma.events.findMany({
      where: {
        tenant_id: tenantId,
        related_id: { in: processIds },
        related_table: { in: ['process', 'processes'] },
      } as any,
      orderBy: {
        start_time: 'desc',
      },
    });
  }

  /**
   * Creates a process with an auto-generated process_number using DB sequence `process_number_seq`.
   * Format: PROC-000001 (6 digits)
   */
  async createWithAutoNumber(
    data: Omit<CreateProcessDTO, 'process_number' | 'status' | 'status_config_id'> & {
      status: number;
      status_config_id?: string | null;
    },
    tenantId: string,
  ): Promise<processes> {
    return this.prisma.transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ seq: bigint }>>`
        SELECT nextval('process_number_seq') AS seq
      `;

      const seq = rows?.[0]?.seq;
      if (seq == null) {
        throw new Error('Failed to generate process number sequence.');
      }

      const numeric = String(seq);
      const processNumber = `PROC-${numeric.padStart(6, '0')}`;

      return tx.processes.create({
        data: {
          tenant_id: tenantId,
          process_number: processNumber,
          status: data.status,
          status_config_id: data.status_config_id ?? null,
          total_value: data.total_value ?? 0,
          invoice: data.invoice ?? null,
          company_id: data.company_id,
          process_type_id: data.process_type_id,
          primary_contact_id: data.primary_contact_id,
          ship_date: data.ship_date ? new Date(data.ship_date) : null,
          completed: data.completed ?? 0,
        },
      });
    });
  }
}
