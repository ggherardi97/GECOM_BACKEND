import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ProcessRepository } from './process.repository';
import { EventService } from '../events/event.service';
import { CreateProcessDTO } from './dto/create-process.dto';
import { processes } from '@prisma/client';
import { EventType } from '../events/enums/event-type.enum';
import { ProcessStatus } from './enums/process-status.enum';

@Injectable()
export class ProcessService {
  constructor(
    private readonly repository: ProcessRepository,
    private readonly eventService: EventService,
  ) {}

  async create(data: CreateProcessDTO): Promise<processes> {
    const existingProcess = await this.repository.findByProcessNumber(data.process_number);
    if (existingProcess) {
      throw new BadRequestException(
        `Process with number ${data.process_number} already exists`,
      );
    }

    const process = await this.repository.create(data);

    await this.eventService.create({
      related_table: 'processes',
      related_id: process.id,
      title: 'Process Created',
      description: `Process ${process.process_number} was created`,
      type: EventType.SYSTEM_LOG,
      start_time: new Date(),
      finished: true,
    });

    return process;
  }

  async findAll(): Promise<processes[]> {
    return await this.repository.findAll();
  }

  async findById(id: string): Promise<processes> {
    const process = await this.repository.findById(id);
    if (!process) {
      throw new NotFoundException(`Process with ID ${id} not found`);
    }
    return process;
  }

  async findByCompanyId(companyId: string): Promise<processes[]> {
    return await this.repository.findByCompanyId(companyId);
  }

  async updateStatus(id: string, newStatus: number): Promise<processes> {
    const process = await this.findById(id);

    if (process.status === newStatus) {
      throw new BadRequestException('Process already has this status');
    }

    const updatedProcess = await this.repository.updateStatus(id, newStatus);

    await this.eventService.create({
      related_table: 'processes',
      related_id: process.id,
      title: 'Status Changed',
      description: `Process status changed from ${this.getStatusName(process.status)} to ${this.getStatusName(newStatus)}`,
      type: EventType.STATUS_CHANGE,
      status: newStatus,
      start_time: new Date(),
      finished: true,
    });

    return updatedProcess;
  }

  async updateCompleted(id: string, completed: number): Promise<processes> {
    if (completed < 0 || completed > 100) {
      throw new BadRequestException('Completion percentage must be between 0 and 100');
    }

    const process = await this.findById(id);
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
      finished: true,
    });

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
