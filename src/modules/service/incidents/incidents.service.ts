import { Injectable, NotFoundException } from '@nestjs/common';
import { ProjectOperationsService } from '../../project-operations/project-operations.service';
import { CreateIncidentDto, UpdateIncidentDto } from './incidents.dto';
import { IncidentAutomationService } from './incident-automation.service';
import { IncidentsRepository } from './incidents.repository';

@Injectable()
export class IncidentsService {
  constructor(
    private readonly repository: IncidentsRepository,
    private readonly automationService: IncidentAutomationService,
    private readonly projectOperationsService: ProjectOperationsService,
  ) {}

  list(tenantId: string) {
    return this.repository.findMany(tenantId);
  }

  async getById(tenantId: string, id: string) {
    const item = await this.repository.findById(tenantId, id);
    if (!item) throw new NotFoundException('Incidente não encontrado.');
    return item;
  }

  async getTimeline(tenantId: string, id: string) {
    await this.getById(tenantId, id);
    return this.repository.findTimeline(tenantId, id);
  }

  async getRelated(tenantId: string, id: string) {
    await this.getById(tenantId, id);
    return this.repository.findRelated(tenantId, id);
  }

  async create(tenantId: string, userId: string, dto: CreateIncidentDto) {
    const prepared = await this.automationService.prepareCreate(tenantId, this.normalizeCreateDto(dto, userId));
    const created = await this.repository.create(tenantId, prepared);
    await this.automationService.afterMutation({
      tenantId,
      userId,
      eventType: 'CREATE',
      before: null,
      after: created as Record<string, unknown>,
      changedFields: Object.keys(prepared || {}),
    });
    return this.getById(tenantId, String(created?.id || ''));
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateIncidentDto) {
    const before = await this.getById(tenantId, id);
    const prepared = await this.automationService.prepareUpdate(
      tenantId,
      before as Record<string, unknown>,
      this.normalizeUpdateDto(dto),
    );
    await this.repository.update(tenantId, id, prepared);
    const after = await this.getById(tenantId, id);
    await this.automationService.afterMutation({
      tenantId,
      userId,
      eventType: 'UPDATE',
      before: before as Record<string, unknown>,
      after: after as Record<string, unknown>,
      changedFields: Object.keys(prepared || {}),
    });
    return after;
  }

  async remove(tenantId: string, id: string) {
    await this.getById(tenantId, id);
    await this.repository.remove(tenantId, id);
  }

  async createWorkOrderFromIncident(
    authUser: { id: string; tenant_id: string; role?: string },
    incidentId: string,
    dto?: Partial<{ title: string; description: string; planned_start: string; planned_end: string; estimated_hours: number }>,
  ) {
    const incident = await this.getById(authUser.tenant_id, incidentId);
    return this.projectOperationsService.createWorkOrder(authUser, {
      title: String(dto?.title || incident.title || '').trim() || `Work order ${incident.number || ''}`.trim(),
      description: String(dto?.description || incident.description || '').trim() || undefined,
      incident_id: String(incident.id),
      owner_user_id: String(incident.owner_user_id || '').trim() || undefined,
      planned_start: dto?.planned_start || undefined,
      planned_end: dto?.planned_end || undefined,
      estimated_hours: dto?.estimated_hours || undefined,
    });
  }

  private normalizeCreateDto(dto: CreateIncidentDto, userId: string): CreateIncidentDto {
    return this.cleanUndefined({
      ...dto,
      number: this.normalizeOptionalText(dto.number),
      contact_id: this.normalizeOptionalText(dto.contact_id),
      opened_by_user_id: dto.opened_by_user_id || userId,
    });
  }

  private normalizeUpdateDto(dto: UpdateIncidentDto): UpdateIncidentDto {
    return this.cleanUndefined({
      ...dto,
      number: undefined,
      contact_id: this.normalizeOptionalText(dto.contact_id),
    });
  }

  private normalizeOptionalText(value?: string | null): string | undefined {
    const text = String(value || '').trim();
    return text || undefined;
  }

  private cleanUndefined<T extends Record<string, unknown>>(input: T): T {
    return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;
  }
}
