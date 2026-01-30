import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProcessDTO } from './dto/create-process.dto';
import { processes } from '@prisma/client';

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
      this.logger.error('Error creating process:', error);
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
}
