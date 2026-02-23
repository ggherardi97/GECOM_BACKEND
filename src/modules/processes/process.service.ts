import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ProcessRepository } from './process.repository';
import { EventService } from '../events/event.service';
import { CreateProcessDTO } from './dto/create-process.dto';
import { UpdateProcessDTO } from './dto/update-process.dto';

import type { processes, events as EventRow } from '@prisma/client';

import { EventType } from '../events/enums/event-type.enum';
import { StatusConfigService } from '../status-config/status-config.service';

@Injectable()
export class ProcessService {
  constructor(
    private readonly repository: ProcessRepository,
    private readonly eventService: EventService,
    private readonly statusConfigService: StatusConfigService,
  ) {}

  async create(data: CreateProcessDTO, tenantId: string): Promise<processes> {
    if (data.total_value !== undefined && (!Number.isFinite(Number(data.total_value)) || Number(data.total_value) < 0)) {
      throw new BadRequestException('total_value must be a non-negative number');
    }

    const resolvedStatus = await this.statusConfigService.resolveProcessStatus(tenantId, {
      status: data.status,
      status_config_id: data.status_config_id,
    });

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
          status: resolvedStatus.status,
          status_config_id: resolvedStatus.statusConfig.id,
          process_number: providedProcessNumber,
        } as any,
        tenantId,
      );
    } else {
      createdProcess = await this.repository.createWithAutoNumber(
        {
          status: resolvedStatus.status,
          status_config_id: resolvedStatus.statusConfig.id,
          invoice: data.invoice,
          company_id: data.company_id,
          process_type_id: data.process_type_id,
          primary_contact_id: data.primary_contact_id,
          ship_date: data.ship_date,
          completed: data.completed,
          total_value: data.total_value,
        },
        tenantId,
      );
    }

    await this.eventService.create(
      {
        related_table: 'processes',
        related_id: createdProcess.id,
        title: 'Processo iniciado',
        status: resolvedStatus.status,
        description: `Processo ${createdProcess.process_number} iniciado com status ${resolvedStatus.statusConfig.label}`,
        type: EventType.SYSTEM_LOG,
        start_time: new Date(),
        end_time: new Date(),
        finished: true,
        document_related: false,
      } as any,
      tenantId,
    );

    return createdProcess;
  }

  async findAll(
    filters: { company_id?: string; status?: number | string; status_config_id?: string },
    tenantId: string,
  ): Promise<any[]> {
    let resolvedStatusFilter:
      | {
          status: number;
          statusConfig: { id: string };
        }
      | undefined;

    if (
      (filters.status !== undefined && String(filters.status).trim().length > 0) ||
      (filters.status_config_id !== undefined && String(filters.status_config_id).trim().length > 0)
    ) {
      resolvedStatusFilter = await this.statusConfigService.resolveProcessStatus(tenantId, {
        status: filters.status,
        status_config_id: filters.status_config_id,
      });
    }

    const repositoryFilter = {
      status: resolvedStatusFilter?.status,
      status_config_id: resolvedStatusFilter?.statusConfig.id,
    };

    const list = filters.company_id
      ? await this.repository.findByCompanyId(filters.company_id, tenantId, repositoryFilter)
      : await this.repository.findAll(tenantId, repositoryFilter);

    return this.attachEvents(list, tenantId);
  }

  async findAllDashboard(
    filters: { company_id?: string; status?: number | string; status_config_id?: string },
    tenantId: string,
  ): Promise<any[]> {
    let resolvedStatusFilter:
      | {
          status: number;
          statusConfig: { id: string };
        }
      | undefined;

    if (
      (filters.status !== undefined && String(filters.status).trim().length > 0) ||
      (filters.status_config_id !== undefined && String(filters.status_config_id).trim().length > 0)
    ) {
      resolvedStatusFilter = await this.statusConfigService.resolveProcessStatus(tenantId, {
        status: filters.status,
        status_config_id: filters.status_config_id,
      });
    }

    const repositoryFilter = {
      status: resolvedStatusFilter?.status,
      status_config_id: resolvedStatusFilter?.statusConfig.id,
    };

    if (filters.company_id) {
      return this.repository.findByCompanyIdDashboard(filters.company_id, tenantId, repositoryFilter);
    }
    return this.repository.findAllDashboard(tenantId, repositoryFilter);
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
    if (data.total_value !== undefined && (!Number.isFinite(Number(data.total_value)) || Number(data.total_value) < 0)) {
      throw new BadRequestException('total_value must be a non-negative number');
    }

    let resolvedStatus:
      | {
          status: number;
          statusConfig: { id: string };
        }
      | undefined;

    if (data.status !== undefined || data.status_config_id !== undefined) {
      resolvedStatus = await this.statusConfigService.resolveProcessStatus(tenantId, {
        status: data.status,
        status_config_id: data.status_config_id,
      });
    }

    const updated = await this.repository.update(id, tenantId, {
      completed: data.completed != null ? Number(data.completed) : undefined,
      status: resolvedStatus?.status,
      status_config_id: resolvedStatus?.statusConfig.id,
      total_value: data.total_value !== undefined ? Number(data.total_value) : undefined,
      ship_date: data.ship_date === undefined ? undefined : data.ship_date,
    });

    if (!updated) throw new NotFoundException('Process not found');
    return updated;
  }

  async updateStatus(
    id: string,
    tenantId: string,
    input: { status?: number; status_config_id?: string },
  ): Promise<processes> {
    const resolvedNextStatus = await this.statusConfigService.resolveProcessStatus(tenantId, {
      status: input.status,
      status_config_id: input.status_config_id,
    });

    const process = await this.findById(id, tenantId);
    const resolvedCurrentStatus = await this.statusConfigService.resolveProcessStatus(tenantId, {
      status: process.status,
      status_config_id: process.status_config_id,
    });

    if (
      process.status === resolvedNextStatus.status &&
      process.status_config_id === resolvedNextStatus.statusConfig.id
    ) {
      throw new BadRequestException('Process already has this status');
    }

    const updatedProcess = await this.repository.updateStatus(
      id,
      tenantId,
      resolvedNextStatus.status,
      resolvedNextStatus.statusConfig.id,
    );
    if (!updatedProcess) throw new NotFoundException('Process not found');

    await this.eventService.create(
      {
        related_table: 'processes',
        related_id: process.id,
        title: 'Status alterado',
        description: `Status alterado de ${resolvedCurrentStatus.statusConfig.label} para ${resolvedNextStatus.statusConfig.label}`,
        type: EventType.STATUS_CHANGE,
        status: resolvedNextStatus.status,
        start_time: new Date(),
        end_time: new Date(),
        finished: true,
        document_related: false,
      } as any,
      tenantId,
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
        title: 'Processo excluido',
        description: `Processo ${process.process_number} foi excluido`,
        type: EventType.SYSTEM_LOG,
        start_time: new Date(),
        end_time: new Date(),
        finished: true,
        document_related: false,
      } as any,
      tenantId,
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
}
