import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProcessDTO } from './dto/create-process.dto';

// IMPORTANT: use type-only import and alias to avoid conflicts with runtime variables.
import type { processes, events as EventRow } from '@prisma/client';

@Injectable()
export class ProcessRepository {
  private logger = new Logger(ProcessRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateProcessDTO): Promise<processes> {
    try {
      return await this.prisma.processes.create({
        data: {
          process_number: data.process_number,
          status: data.status,
          invoice: data.invoice,
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

  async findAll(): Promise<processes[]> {
    return await this.prisma.processes.findMany({
      where: {
        deleted_at: null,
      },
      include: {
        companies: true,
        process_types: true,
        transports: true,
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

  async findById(id: string): Promise<processes | null> {
    return await this.prisma.processes.findUnique({
      where: { id },
      include: {
        companies: true,
        process_types: true,
        transports: true,
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

  async findByCompanyId(companyId: string): Promise<processes[]> {
    return await this.prisma.processes.findMany({
      where: {
        company_id: companyId,
        deleted_at: null,
      },
      include: {
        companies: true,
        process_types: true,
        transports: true,
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

  async findByProcessNumber(processNumber: string): Promise<processes | null> {
    return await this.prisma.processes.findFirst({
      where: {
        process_number: processNumber,
        deleted_at: null,
      },
    });
  }

  async updateStatus(id: string, status: number): Promise<processes> {
    return await this.prisma.processes.update({
      where: { id },
      data: { status },
    });
  }

  async updateCompleted(id: string, completed: number): Promise<processes> {
    return await this.prisma.processes.update({
      where: { id },
      data: { completed },
    });
  }

  async softDelete(id: string): Promise<processes> {
    return await this.prisma.processes.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  /**
   * Returns events for one or multiple processes.
   * We support both related_table values: 'process' and 'processes' (legacy).
   */
  async findEventsByProcessIds(processIds: string[]): Promise<EventRow[]> {
    if (!processIds || processIds.length === 0) return [];

    return this.prisma.events.findMany({
      where: {
        related_id: { in: processIds },
        related_table: { in: ['process', 'processes'] },
      },
      orderBy: {
        start_time: 'desc',
      },
    });
  }
  async update(
    id: string,
    data: { completed?: number; status?: number; ship_date?: string | Date | null }
  ): Promise<processes> {
    const updateData: any = {};

    if (data.completed !== undefined) updateData.completed = data.completed;
    if (data.status !== undefined) updateData.status = data.status;

    if (data.ship_date !== undefined) {
      updateData.ship_date = data.ship_date == null ? null : new Date(data.ship_date);
    }

    return await this.prisma.processes.update({
      where: { id },
      data: updateData,
    });
  }

  public async createWithAutoNumber(data: any) {
    return this.prisma.$transaction(async (tx) => {
      // Get next sequence value
      const rows = await tx.$queryRaw<Array<{ seq: bigint }>>`
        SELECT nextval('process_number_seq') AS seq
      `;

      const seq = rows?.[0]?.seq;
      if (seq == null) {
        throw new Error('Failed to generate process number sequence.');
      }

      // Build PROC-000001 format (6 digits)
      const numeric = String(seq);
      const processNumber = `PROC-${numeric.padStart(6, '0')}`;

      // Create process with the generated number
      const created = await tx.processes.create({
        data: {
          ...data,
          process_number: processNumber,
        },
      });

      return created;
    });
  }
}