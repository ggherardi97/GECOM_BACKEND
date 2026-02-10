import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ProcessRepository } from './process.repository';
import { EventService } from '../events/event.service';
import { CreateProcessDTO } from './dto/create-process.dto';
import { UpdateProcessDTO } from './dto/update-process.dto';

// IMPORTANT: type-only import + alias avoids TS conflicts with local variables.
import type { processes, events as EventRow } from '@prisma/client';

import { EventType } from '../events/enums/event-type.enum';
import { ProcessStatus } from './enums/process-status.enum';

@Injectable()
export class ProcessService {
  constructor(
    private readonly repository: ProcessRepository,
    private readonly eventService: EventService
  ) {}

  async create(data: CreateProcessDTO, tenantId: string): Promise<processes> {
    const providedProcessNumber = String(data.process_number ?? '').trim();

    let createdProcess: processes;

    if (providedProcessNumber) {
      const existingProcess = await this.repository.findByProcessNumber(providedProcessNumber, tenantId);
      if (existingProcess) {
        throw new BadRequestException(`Process with number ${providedProcessNumber} already exists`);
      }

      createdProcess = await this.repository.create(
        {
          ...data,
          process_number: providedProcessNumber,
        } as any,
        tenantId
      );
    } else {
      createdProcess = await this.repository.createWithAutoNumber(
        {
          status: data.status,
          invoice: data.invoice,
          company_id: data.company_id,
          process_type_id: data.process_type_id,
          primary_contact_id: data.primary_contact_id,
          ship_date: data.ship_date,
          completed: data.completed,
        },
        tenantId
      );
    }

    await this.eventService.create(
      {
        related_table: 'processes',
        related_id: createdProcess.id,
        title: 'Processo iniciado',
        status: 0,
        description: `Processo ${createdProcess.process_number} iniciado em ${createdProcess.created_on}`,
        type: EventType.SYSTEM_LOG,
        start_time: new Date(),
        end_time: new Date(),
        finished: true,
        document_related: false,
      } as any,
      tenantId
    );

    return createdProcess;
  }

  /**
   * Default (full) list: includes relations + attaches events.
   * Keep this as-is to avoid breaking other pages.
   */
  async findAll(filters: { company_id?: string }, tenantId: string): Promise<any[]> {
    const list = filters.company_id
      ? await this.repository.findByCompanyId(filters.company_id, tenantId)
      : await this.repository.findAll(tenantId);

    return this.attachEvents(list, tenantId);
  }

  /**
   * Dashboard-optimized list: minimal select, NO heavy includes, NO events.
   */
  async findAllDashboard(filters: { company_id?: string }, tenantId: string): Promise<any[]> {
    if (filters.company_id) {
      return this.repository.findByCompanyIdDashboard(filters.company_id, tenantId);
    }
    return this.repository.findAllDashboard(tenantId);
  }

  async findById(id: string, tenantId: string): Promise<any> {
    const process = await this.repository.findById(id, tenantId);
    if (!process) {
      throw new NotFoundException(`Process with ID ${id} not found`);
    }

    const eventRows = await this.repository.findEventsByProcessIds([process.id], tenantId);

    return {
      ...(process as any),
      events: eventRows,
    };
  }

  async update(id: string, tenantId: string, data: UpdateProcessDTO): Promise<processes> {
    await this.findById(id, tenantId);

    if (data.completed != null) {
      const completed = Number(data.completed);
      if (Number.isNaN(completed) || completed < 0 || completed > 100) {
        throw new BadRequestException('Completion percentage must be between 0 and 100');
      }
    }

    if (data.status != null && Number.isNaN(Number(data.status))) {
      throw new BadRequestException('Status must be a number');
    }

    const updated = await this.repository.update(id, tenantId, {
      completed: data.completed != null ? Number(data.completed) : undefined,
      status: data.status != null ? Number(data.status) : undefined,
      ship_date: data.ship_date === undefined ? undefined : data.ship_date,
    });

    if (!updated) throw new NotFoundException('Process not found');
    return updated;
  }

  async updateStatus(id: string, tenantId: string, newStatus: number): Promise<processes> {
    const process = await this.findById(id, tenantId);

    if (process.status === newStatus) {
      throw new BadRequestException('Process already has this status');
    }

    const updatedProcess = await this.repository.updateStatus(id, tenantId, newStatus);
    if (!updatedProcess) throw new NotFoundException('Process not found');

    await this.eventService.create(
      {
        related_table: 'processes',
        related_id: process.id,
        title: 'Status alterado',
        description: `Status alterado de ${this.getStatusName(process.status)} para ${this.getStatusName(newStatus)}`,
        type: EventType.STATUS_CHANGE,
        status: newStatus,
        start_time: new Date(),
        end_time: new Date(),
        finished: true,
        document_related: false,
      } as any,
      tenantId
    );

    return updatedProcess;
  }

  async getProcessEvents(id: string, tenantId: string) {
    await this.findById(id, tenantId);
    return this.eventService.listEventsByRelated('processes', id, tenantId);
  }

  async softDelete(id: string, tenantId: string): Promise<processes> {
    const process = await this.findById(id, tenantId);

    const deletedProcess = await this.repository.softDelete(id, tenantId);
    if (!deletedProcess) throw new NotFoundException('Process not found');

    await this.eventService.create(
      {
        related_table: 'processes',
        related_id: process.id,
        title: 'Processo excluído',
        description: `Processo ${process.process_number} foi excluído`,
        type: EventType.SYSTEM_LOG,
        start_time: new Date(),
        end_time: new Date(),
        finished: true,
        document_related: false,
      } as any,
      tenantId
    );

    return deletedProcess;
  }

  private async attachEvents(list: processes[], tenantId: string): Promise<any[]> {
    if (!list || list.length === 0) return list as any[];

    const ids = list.map((p) => p.id);

    const eventRows = await this.repository.findEventsByProcessIds(ids, tenantId);
    const byRelatedId = new Map<string, EventRow[]>();

    for (const ev of eventRows) {
      const key = ev.related_id;
      const current = byRelatedId.get(key) ?? [];
      current.push(ev);
      byRelatedId.set(key, current);
    }

    return list.map((p) => ({
      ...(p as any),
      events: byRelatedId.get(p.id) ?? [],
    }));
  }

  private getStatusName(status: number): string {
    const statusNames: Record<number, string> = {
      [ProcessStatus.PENDING]: 'Pendente',
      [ProcessStatus.IN_PROGRESS]: 'Em andamento',
      [ProcessStatus.AWAITING_APPROVAL]: 'Aguardando aprovação',
      [ProcessStatus.APPROVED]: 'Aprovado',
      [ProcessStatus.IN_PRODUCTION]: 'Em produção',
      [ProcessStatus.SHIPPED]: 'Enviado',
      [ProcessStatus.DELIVERED]: 'Entregue',
      [ProcessStatus.CANCELLED]: 'Cancelado',
      [ProcessStatus.COMPLETED]: 'Concluído',
    };

    return statusNames[status] || 'Desconhecido';
  }
}
