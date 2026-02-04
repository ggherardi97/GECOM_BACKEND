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

  async create(data: CreateProcessDTO): Promise<processes> {
    const providedProcessNumber = String((data as any)?.process_number || '').trim();

    // If user provided a number, keep the existing uniqueness validation + normal create.
    if (providedProcessNumber) {
      const existingProcess = await this.repository.findByProcessNumber(providedProcessNumber);
      if (existingProcess) {
        throw new BadRequestException(`Process with number ${providedProcessNumber} already exists`);
      }

      const createdProcess = await this.repository.create({
        ...data,
        process_number: providedProcessNumber,
      });

      await this.eventService.create({
        related_table: 'processes',
        related_id: createdProcess.id,
        title: 'Processo Iniciado',
        status: 0,
        description: `Processo ${createdProcess.process_number} iniciado em ${createdProcess.created_on}`,
        type: EventType.SYSTEM_LOG,
        start_time: new Date(),
        end_time: new Date(),
        finished: true,
        document_related: false,
      } as any);

      return createdProcess;
    }

    // Otherwise: auto-generate (PROC-000001...) in the repository using a DB sequence.
    const createdProcess = await this.repository.createWithAutoNumber({
      ...data,
      // Ensure we don't pass empty string to Prisma
      process_number: undefined as any,
    });

    await this.eventService.create({
      related_table: 'processes',
      related_id: createdProcess.id,
      title: 'Processo Iniciado',
      status: 0,
      description: `Processo ${createdProcess.process_number} iniciado em ${createdProcess.created_on}`,
      type: EventType.SYSTEM_LOG,
      start_time: new Date(),
      end_time: new Date(),
      finished: true,
      document_related: false,
    } as any);

    return createdProcess;
  }

  async findAll(): Promise<any[]> {
    const list = await this.repository.findAll();
    return await this.attachEvents(list);
  }

  async findById(id: string): Promise<any> {
    const process = await this.repository.findById(id);
    if (!process) {
      throw new NotFoundException(`Process with ID ${id} not found`);
    }

    const eventRows = await this.repository.findEventsByProcessIds([process.id]);

    return {
      ...(process as any),
      events: eventRows,
    };
  }

  async findByCompanyId(companyId: string): Promise<any[]> {
    const list = await this.repository.findByCompanyId(companyId);
    return await this.attachEvents(list);
  }
  async update(id: string, data: UpdateProcessDTO): Promise<processes> {
    // Ensure process exists
    await this.findById(id);

    // Basic validation
    if (data.completed != null) {
      const completed = Number(data.completed);
      if (Number.isNaN(completed) || completed < 0 || completed > 100) {
        throw new BadRequestException('Completion percentage must be between 0 and 100');
      }
    }

    if (data.status != null && Number.isNaN(Number(data.status))) {
      throw new BadRequestException('Status must be a number');
    }

    // ship_date can be null (clear), or ISO string/date
    const updated = await this.repository.update(id, {
      completed: data.completed != null ? Number(data.completed) : undefined,
      status: data.status != null ? Number(data.status) : undefined,
      ship_date: data.ship_date === undefined ? undefined : data.ship_date, // keep null if sent
    });

    return updated;
  }

  async updateStatus(id: string, newStatus: number): Promise<processes> {
    const process = await this.findById(id);

    if (process.status === newStatus) {
      throw new BadRequestException('Process already has this status');
    }

    const updatedProcess = await this.repository.updateStatus(id, newStatus);

    await this.eventService.create({
      related_table: 'process',
      related_id: process.id,
      title: 'Status Changed',
      description: `Process status changed from ${this.getStatusName(process.status)} to ${this.getStatusName(newStatus)}`,
      type: EventType.STATUS_CHANGE,
      status: newStatus,
      start_time: new Date(),
      end_time: new Date(),
      finished: true,
      document_related: false,
    } as any);

    return updatedProcess;
  }

  private async attachEvents(list: processes[]): Promise<any[]> {
    if (!list || list.length === 0) return list as any[];

    const ids = list.map((p) => p.id);

    // IMPORTANT: do not name this variable 'events' to avoid TS confusion with Prisma types.
    const eventRows = await this.repository.findEventsByProcessIds(ids);

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

  async updateCompleted(id: string, completed: number): Promise<processes> {
    if (completed < 0 || completed > 100) {
      throw new BadRequestException('Completion percentage must be between 0 and 100');
    }

    await this.findById(id);
    return await this.repository.updateCompleted(id, completed);
  }

  async getProcessEvents(id: string) {
    await this.findById(id);
    return await this.eventService.listEventsByRelated('processes', id);
  }

  async softDelete(id: string): Promise<processes> {
    const process = await this.findById(id);

    const deletedProcess = await this.repository.softDelete(id);

    await this.eventService.create({
      related_table: 'processes',
      related_id: process.id,
      title: 'Process Deleted',
      description: `Process ${process.process_number} was deleted`,
      type: EventType.SYSTEM_LOG,
      start_time: new Date(),
      end_time: new Date(),
      finished: true,
      document_related: false,
    } as any);

    return deletedProcess;
  }

  private getStatusName(status: number): string {
    const statusNames: Record<number, string> = {
      [ProcessStatus.PENDING]: 'Pending',
      [ProcessStatus.IN_PROGRESS]: 'In Progress',
      [ProcessStatus.AWAITING_APPROVAL]: 'Awaiting Approval',
      [ProcessStatus.APPROVED]: 'Approved',
      [ProcessStatus.IN_PRODUCTION]: 'In Production',
      [ProcessStatus.SHIPPED]: 'Shipped',
      [ProcessStatus.DELIVERED]: 'Delivered',
      [ProcessStatus.CANCELLED]: 'Cancelled',
      [ProcessStatus.COMPLETED]: 'Completed',
    };

    return statusNames[status] || 'Unknown';
  }
}
