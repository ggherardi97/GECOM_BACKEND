import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { lead_activity_type_enum, lead_source_enum, lead_status_enum, lead_type_enum } from '@prisma/client';
import { LeadRepository } from './leads.repository';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { MoveLeadStageDto } from './dto/move-lead-stage.dto';
import { CreateLeadStageDto } from './dto/create-lead-stage.dto';
import { UpdateLeadStageDto } from './dto/update-lead-stage.dto';
import { CreateLeadActivityDto } from './dto/create-lead-activity.dto';
import { UpdateLeadActivityDto } from './dto/update-lead-activity.dto';
import { CreateLeadTagDto } from './dto/create-lead-tag.dto';
import { SetLeadTagsDto } from './dto/set-lead-tags.dto';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { ListLeadsQueryDto } from './dto/list-leads.dto';
import { StatusConfigService } from '../status-config/status-config.service';

type AuthUser = {
  id?: string;
  user_id?: string;
  tenant_id: string;
  role?: string | null;
};

@Injectable()
export class LeadsService {
  constructor(
    private readonly repository: LeadRepository,
    private readonly statusConfigService: StatusConfigService,
  ) {}

  private getUserId(user: AuthUser): string {
    const id = String(user.id ?? user.user_id ?? '').trim();
    if (!id) throw new BadRequestException('Authenticated user id is missing');
    return id;
  }

  private isPrivileged(user: AuthUser): boolean {
    const role = String(user.role ?? '').toUpperCase();
    return role === 'ADMIN' || role === 'MANAGER';
  }

  private canManageLead(user: AuthUser, lead: any): boolean {
    if (this.isPrivileged(user)) return true;
    return lead.owner_user_id === this.getUserId(user);
  }

  private isConverted(lead: any): boolean {
    const code = String(lead?.status_config?.code ?? '').toUpperCase();
    return lead.status === lead_status_enum.CONVERTED || code === 'CONVERTED';
  }

  async listStages(user: AuthUser) {
    await this.repository.ensureDefaultStages(user.tenant_id);
    return this.repository.listStages(user.tenant_id);
  }

  async createStage(user: AuthUser, dto: CreateLeadStageDto) {
    if (!this.isPrivileged(user)) {
      throw new ForbiddenException('Only ADMIN/MANAGER can create stages');
    }

    return this.repository.createStage({
      tenantId: user.tenant_id,
      name: dto.name,
      sortOrder: dto.sort_order,
      isWon: dto.is_won,
      isLost: dto.is_lost,
      isActive: dto.is_active,
    });
  }

  async updateStage(user: AuthUser, stageId: string, dto: UpdateLeadStageDto) {
    if (!this.isPrivileged(user)) {
      throw new ForbiddenException('Only ADMIN/MANAGER can update stages');
    }

    const stage = await this.repository.findStageById(user.tenant_id, stageId);
    if (!stage) throw new NotFoundException('Lead stage not found');

    const updated = await this.repository.updateStage({
      tenantId: user.tenant_id,
      stageId,
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.sort_order !== undefined ? { sort_order: dto.sort_order } : {}),
        ...(dto.is_won !== undefined ? { is_won: dto.is_won } : {}),
        ...(dto.is_lost !== undefined ? { is_lost: dto.is_lost } : {}),
        ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
        updated_at: new Date(),
      },
    });

    if (!updated) throw new NotFoundException('Lead stage not found');
    return updated;
  }

  async listLeads(user: AuthUser, query: ListLeadsQueryDto) {
    let statusFilter:
      | {
          status: lead_status_enum;
          statusConfig: { id: string };
        }
      | undefined;

    if (query.status || query.status_config_id) {
      statusFilter = await this.statusConfigService.resolveLeadStatus(user.tenant_id, {
        status: query.status,
        status_config_id: query.status_config_id,
      });
    }

    return this.repository.listLeads({
      tenantId: user.tenant_id,
      status: statusFilter?.status,
      statusConfigId: statusFilter?.statusConfig.id,
      q: query.q,
      ownerUserId: query.owner_user_id,
      stageId: query.stage_id,
    });
  }

  async getLeadById(user: AuthUser, leadId: string) {
    const lead = await this.repository.findLeadById(user.tenant_id, leadId);
    if (!lead) throw new NotFoundException('Lead not found');

    if (!this.canManageLead(user, lead) && !this.isPrivileged(user)) {
      throw new ForbiddenException('You do not have access to this lead');
    }

    return lead;
  }

  async createLead(user: AuthUser, dto: CreateLeadDto) {
    const userId = this.getUserId(user);

    await this.repository.ensureDefaultStages(user.tenant_id);

    let stageId = dto.stage_id;
    if (!stageId) {
      const stages = await this.repository.listStages(user.tenant_id);
      const firstActive = stages.find((s) => s.is_active);
      stageId = firstActive?.id;
    }

    if (stageId) {
      const stage = await this.repository.findStageById(user.tenant_id, stageId);
      if (!stage) throw new BadRequestException('Invalid stage_id for tenant');
    }

    const ownerUserId = dto.owner_user_id ?? userId;
    const resolvedStatus = await this.statusConfigService.resolveLeadStatus(user.tenant_id, {
      status: dto.status,
      status_config_id: dto.status_config_id,
    });

    const lead = await this.repository.createLead({
      tenantId: user.tenant_id,
      name: dto.name,
      type: dto.type as lead_type_enum,
      companyName: dto.company_name,
      firstName: dto.first_name,
      lastName: dto.last_name,
      email: dto.email,
      phone: dto.phone,
      website: dto.website,
      source: dto.source as lead_source_enum,
      ownerUserId,
      status: resolvedStatus.status,
      statusConfigId: resolvedStatus.statusConfig.id,
      stageId,
      disqualifyReason: dto.disqualify_reason,
      estimatedValue: dto.estimated_value,
      currencyCode: dto.currency_code,
      notes: dto.notes,
      convertedCompanyId: dto.converted_company_id,
      convertedContactId: dto.converted_contact_id,
      convertedAt: dto.converted_at ? new Date(dto.converted_at) : undefined,
    });

    if (stageId) {
      await this.repository.createStageHistory({
        tenantId: user.tenant_id,
        leadId: lead.id,
        toStageId: stageId,
        changedByUserId: userId,
        note: 'Lead created',
      });
    }

    return this.repository.findLeadById(user.tenant_id, lead.id);
  }

  async updateLead(user: AuthUser, leadId: string, dto: UpdateLeadDto) {
    const lead = await this.repository.findLeadById(user.tenant_id, leadId);
    if (!lead) throw new NotFoundException('Lead not found');
    if (!this.canManageLead(user, lead)) throw new ForbiddenException('You cannot update this lead');

    if (this.isConverted(lead)) {
      const forbidden = ['type', 'company_name', 'first_name', 'last_name', 'email', 'phone', 'website'];
      const attempted = forbidden.some((field) => Object.prototype.hasOwnProperty.call(dto as any, field));
      if (attempted) {
        throw new BadRequestException('Lead already converted; identity fields are locked');
      }
    }

    if (dto.stage_id) {
      const stage = await this.repository.findStageById(user.tenant_id, dto.stage_id);
      if (!stage) throw new BadRequestException('Invalid stage_id for tenant');
    }

    let resolvedStatus:
      | {
          status: lead_status_enum;
          statusConfig: { id: string };
        }
      | undefined;

    if (dto.status !== undefined || dto.status_config_id !== undefined) {
      resolvedStatus = await this.statusConfigService.resolveLeadStatus(user.tenant_id, {
        status: dto.status,
        status_config_id: dto.status_config_id,
      });
    }

    const updated = await this.repository.updateLead({
      tenantId: user.tenant_id,
      leadId,
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type as lead_type_enum } : {}),
        ...(dto.company_name !== undefined ? { company_name: dto.company_name } : {}),
        ...(dto.first_name !== undefined ? { first_name: dto.first_name } : {}),
        ...(dto.last_name !== undefined ? { last_name: dto.last_name } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.website !== undefined ? { website: dto.website } : {}),
        ...(dto.source !== undefined ? { source: dto.source as lead_source_enum } : {}),
        ...(dto.owner_user_id !== undefined ? { owner_user_id: dto.owner_user_id } : {}),
        ...(resolvedStatus !== undefined
          ? {
              status: resolvedStatus.status,
              status_config_id: resolvedStatus.statusConfig.id,
            }
          : {}),
        ...(dto.stage_id !== undefined ? { stage_id: dto.stage_id } : {}),
        ...(dto.disqualify_reason !== undefined ? { disqualify_reason: dto.disqualify_reason } : {}),
        ...(dto.estimated_value !== undefined ? { estimated_value: dto.estimated_value } : {}),
        ...(dto.currency_code !== undefined ? { currency_code: dto.currency_code } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.converted_company_id !== undefined ? { converted_company_id: dto.converted_company_id } : {}),
        ...(dto.converted_contact_id !== undefined ? { converted_contact_id: dto.converted_contact_id } : {}),
        ...(dto.converted_at !== undefined ? { converted_at: dto.converted_at ? new Date(dto.converted_at) : null } : {}),
        updated_at: new Date(),
      },
    });

    if (!updated) throw new NotFoundException('Lead not found');

    if (dto.stage_id && dto.stage_id !== lead.stage_id) {
      const userId = this.getUserId(user);
      await this.repository.createStageHistory({
        tenantId: user.tenant_id,
        leadId,
        fromStageId: lead.stage_id ?? undefined,
        toStageId: dto.stage_id,
        changedByUserId: userId,
        note: 'Stage updated via lead update',
      });
    }

    return updated;
  }

  async moveStage(user: AuthUser, leadId: string, dto: MoveLeadStageDto) {
    const userId = this.getUserId(user);
    const lead = await this.repository.findLeadById(user.tenant_id, leadId);
    if (!lead) throw new NotFoundException('Lead not found');
    if (!this.canManageLead(user, lead)) throw new ForbiddenException('You cannot move this lead');

    const stage = await this.repository.findStageById(user.tenant_id, dto.stage_id);
    if (!stage) throw new BadRequestException('Invalid stage_id for tenant');

    let resolvedStatus:
      | {
          status: lead_status_enum;
          statusConfig: { id: string };
        }
      | undefined;

    if (stage.is_won) {
      resolvedStatus = await this.statusConfigService.resolveLeadStatus(user.tenant_id, { status: lead_status_enum.CONVERTED });
    } else if (stage.is_lost) {
      resolvedStatus = await this.statusConfigService.resolveLeadStatus(user.tenant_id, { status: lead_status_enum.DISQUALIFIED });
    } else if (lead.status === lead_status_enum.NEW) {
      resolvedStatus = await this.statusConfigService.resolveLeadStatus(user.tenant_id, { status: lead_status_enum.WORKING });
    } else {
      resolvedStatus = await this.statusConfigService.resolveLeadStatus(user.tenant_id, {
        status: lead.status,
        status_config_id: lead.status_config_id,
      });
    }

    const updated = await this.repository.updateLead({
      tenantId: user.tenant_id,
      leadId,
      data: {
        stage_id: dto.stage_id,
        status: resolvedStatus.status,
        status_config_id: resolvedStatus.statusConfig.id,
        ...(resolvedStatus.status === lead_status_enum.CONVERTED ? { converted_at: lead.converted_at ?? new Date() } : {}),
        ...(resolvedStatus.status !== lead_status_enum.CONVERTED ? { converted_at: null } : {}),
        updated_at: new Date(),
      },
    });

    if (!updated) throw new NotFoundException('Lead not found');

    await this.repository.createStageHistory({
      tenantId: user.tenant_id,
      leadId,
      fromStageId: lead.stage_id ?? undefined,
      toStageId: dto.stage_id,
      changedByUserId: userId,
      note: dto.note,
    });

    return updated;
  }

  async convertLead(user: AuthUser, leadId: string, dto: ConvertLeadDto) {
    const lead = await this.repository.findLeadById(user.tenant_id, leadId);
    if (!lead) throw new NotFoundException('Lead not found');
    if (!this.canManageLead(user, lead)) throw new ForbiddenException('You cannot convert this lead');

    const resolvedConverted = await this.statusConfigService.resolveLeadStatus(user.tenant_id, {
      status: lead_status_enum.CONVERTED,
    });

    const updated = await this.repository.updateLead({
      tenantId: user.tenant_id,
      leadId,
      data: {
        status: resolvedConverted.status,
        status_config_id: resolvedConverted.statusConfig.id,
        converted_company_id: dto.company_id ?? lead.converted_company_id,
        converted_contact_id: dto.contact_id ?? lead.converted_contact_id,
        converted_at: lead.converted_at ?? new Date(),
        updated_at: new Date(),
      },
    });

    if (!updated) throw new NotFoundException('Lead not found');
    return updated;
  }

  async listActivities(user: AuthUser, leadId: string) {
    const lead = await this.repository.findLeadById(user.tenant_id, leadId);
    if (!lead) throw new NotFoundException('Lead not found');
    if (!this.canManageLead(user, lead)) throw new ForbiddenException('You cannot access activities of this lead');

    return this.repository.listActivities(user.tenant_id, leadId);
  }

  async createActivity(user: AuthUser, leadId: string, dto: CreateLeadActivityDto) {
    const userId = this.getUserId(user);
    const lead = await this.repository.findLeadById(user.tenant_id, leadId);
    if (!lead) throw new NotFoundException('Lead not found');
    if (!this.canManageLead(user, lead)) throw new ForbiddenException('You cannot create activities for this lead');

    return this.repository.createActivity({
      tenantId: user.tenant_id,
      leadId,
      type: dto.type as lead_activity_type_enum,
      subject: dto.subject,
      description: dto.description,
      dueDate: dto.due_date ? new Date(dto.due_date) : undefined,
      completedAt: dto.completed_at ? new Date(dto.completed_at) : undefined,
      createdByUserId: userId,
      assignedToUserId: dto.assigned_to_user_id,
    });
  }

  async updateActivity(user: AuthUser, activityId: string, dto: UpdateLeadActivityDto) {
    const userId = this.getUserId(user);

    const updated = await this.repository.updateActivity({
      tenantId: user.tenant_id,
      activityId,
      data: {
        ...(dto.type !== undefined ? { type: dto.type as lead_activity_type_enum } : {}),
        ...(dto.subject !== undefined ? { subject: dto.subject } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.due_date !== undefined ? { due_date: dto.due_date ? new Date(dto.due_date) : null } : {}),
        ...(dto.completed_at !== undefined ? { completed_at: dto.completed_at ? new Date(dto.completed_at) : null } : {}),
        ...(dto.assigned_to_user_id !== undefined ? { assigned_to_user_id: dto.assigned_to_user_id } : {}),
        ...(dto.completed_at !== undefined && dto.completed_at && !dto.assigned_to_user_id
          ? { assigned_to_user_id: userId }
          : {}),
        updated_at: new Date(),
      },
    });

    if (!updated) throw new NotFoundException('Activity not found');

    const lead = await this.repository.findLeadById(user.tenant_id, updated.lead_id);
    if (!lead) throw new NotFoundException('Lead not found');
    if (!this.canManageLead(user, lead)) throw new ForbiddenException('You cannot update activities of this lead');

    return updated;
  }

  async listTags(user: AuthUser) {
    return this.repository.listTags(user.tenant_id);
  }

  async createTag(user: AuthUser, dto: CreateLeadTagDto) {
    return this.repository.createTag({
      tenantId: user.tenant_id,
      name: dto.name.trim(),
      color: dto.color,
    });
  }

  async setLeadTags(user: AuthUser, leadId: string, dto: SetLeadTagsDto) {
    const lead = await this.repository.findLeadById(user.tenant_id, leadId);
    if (!lead) throw new NotFoundException('Lead not found');
    if (!this.canManageLead(user, lead)) throw new ForbiddenException('You cannot edit tags for this lead');

    return this.repository.setLeadTags({
      tenantId: user.tenant_id,
      leadId,
      tagIds: dto.tag_ids,
    });
  }
}
