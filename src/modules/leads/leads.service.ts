import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { lead_activity_type_enum, lead_source_enum, lead_status_enum, lead_type_enum, user_role_enum, user_status_enum } from '@prisma/client';
import { LeadRepository } from './leads.repository';
import { CreateLeadDto } from './dto/create-lead.dto';
import { CreatePublicGecomLeadDto } from './dto/create-public-gecom-lead.dto';
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
import { AutomationDispatcherService } from '../automation/automation-dispatcher.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';

type AuthUser = {
  id?: string;
  user_id?: string;
  tenant_id: string;
  role?: string | null;
};

const GECOM_TENANT_ID = 'cfad9e93-2206-44cd-9cc3-351f74113a5f';

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: LeadRepository,
    private readonly statusConfigService: StatusConfigService,
    private readonly mailerService: MailerService,
    @Inject(forwardRef(() => AutomationDispatcherService))
    private readonly automationDispatcher: AutomationDispatcherService,
  ) {}

  private normalizeText(value: unknown): string {
    return String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private splitFullName(fullName: string): { firstName?: string; lastName?: string } {
    const parts = this.normalizeText(fullName).split(' ').filter(Boolean);
    if (!parts.length) return {};
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' ') || undefined,
    };
  }

  private async resolveGecomTenant() {
    const tenant = await this.prisma.tenants.findFirst({
      where: {
        id: GECOM_TENANT_ID,
        deleted_at: null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        company: {
          select: {
            id: true,
            company_name: true,
            user_id: true,
            deleted_at: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant da GECOM nao encontrado para o id ${GECOM_TENANT_ID}.`);
    }

    if (!tenant.company || tenant.company.deleted_at) {
      throw new NotFoundException(`Empresa principal do tenant GECOM nao encontrada para o id ${GECOM_TENANT_ID}.`);
    }

    return tenant;
  }

  private async resolveGecomLeadOwner(tenantId: string, preferredUserId?: string | null) {
    const preferredId = String(preferredUserId ?? '').trim();

    if (preferredId) {
      const preferredUser = await this.prisma.users.findFirst({
        where: {
          id: preferredId,
          tenant_id: tenantId,
          status: user_status_enum.ACTIVE,
        },
        select: {
          id: true,
          full_name: true,
          email: true,
        },
      });

      if (preferredUser) return preferredUser;
    }

    const adminOrManager = await this.prisma.users.findFirst({
      where: {
        tenant_id: tenantId,
        status: user_status_enum.ACTIVE,
        role: {
          in: [user_role_enum.ADMIN, user_role_enum.MANAGER],
        },
      },
      orderBy: [{ created_at: 'asc' }],
      select: {
        id: true,
        full_name: true,
        email: true,
      },
    });

    if (adminOrManager) return adminOrManager;

    const fallbackUser = await this.prisma.users.findFirst({
      where: {
        tenant_id: tenantId,
        status: user_status_enum.ACTIVE,
      },
      orderBy: [{ created_at: 'asc' }],
      select: {
        id: true,
        full_name: true,
        email: true,
      },
    });

    if (!fallbackUser) {
      throw new NotFoundException('Nenhum usuario ativo encontrado para receber leads da GECOM.');
    }

    return fallbackUser;
  }

  private async sendGecomPublicLeadNotification(params: {
    leadId?: string | null;
    tenantName?: string | null;
    leadName: string;
    companyName: string;
    phone: string;
    operationMode: string;
    importVolume: string;
    formContext?: string;
    leadCreationIssue?: string;
  }) {
    const subject = 'Novo lead registrado pela plataforma GECOM';
    const tenantLabel = this.normalizeText(params.tenantName) || 'Nao identificado';
    const leadIdLabel = this.normalizeText(params.leadId) || 'Nao gerado';

    await this.mailerService.sendAutomationEmail({
      to: 'contato@portalgecom.log.br',
      cc: 'ggherardi97@gmail.com',
      subject,
      html: `
        <p>Um novo lead foi registrado pela landing page da GECOM.</p>
        <p><strong>Tenant:</strong> ${this.escapeHtml(tenantLabel)}</p>
        <p><strong>Lead ID:</strong> ${this.escapeHtml(leadIdLabel)}</p>
        <p><strong>Nome:</strong> ${this.escapeHtml(params.leadName)}</p>
        <p><strong>Empresa:</strong> ${this.escapeHtml(params.companyName)}</p>
        <p><strong>Telefone:</strong> ${this.escapeHtml(params.phone)}</p>
        <p><strong>Como opera hoje:</strong> ${this.escapeHtml(params.operationMode)}</p>
        <p><strong>Volume mensal:</strong> ${this.escapeHtml(params.importVolume)}</p>
        ${
          params.formContext
            ? `<p><strong>Origem do formulario:</strong> ${this.escapeHtml(params.formContext)}</p>`
            : ''
        }
        ${
          params.leadCreationIssue
            ? `<p><strong>Observacao:</strong> ${this.escapeHtml(params.leadCreationIssue)}</p>`
            : ''
        }
      `,
      text: [
        'Um novo lead foi registrado pela landing page da GECOM.',
        `Tenant: ${tenantLabel}`,
        `Lead ID: ${leadIdLabel}`,
        `Nome: ${params.leadName}`,
        `Empresa: ${params.companyName}`,
        `Telefone: ${params.phone}`,
        `Como opera hoje: ${params.operationMode}`,
        `Volume mensal: ${params.importVolume}`,
        ...(params.formContext ? [`Origem do formulario: ${params.formContext}`] : []),
        ...(params.leadCreationIssue ? [`Observacao: ${params.leadCreationIssue}`] : []),
      ].join('\n'),
    });
  }

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

    const completeLead = await this.repository.findLeadById(user.tenant_id, lead.id);

    this.automationDispatcher.dispatch({
      tenantId: user.tenant_id,
      userId,
      entityName: 'leads',
      eventType: 'CREATE',
      recordId: lead.id,
      payload: (completeLead ?? lead) as unknown as Record<string, unknown>,
    });

    return completeLead ?? lead;
  }

  async createPublicGecomContactLead(dto: CreatePublicGecomLeadDto) {
    const fullName = this.normalizeText(dto.name);
    const phone = this.normalizeText(dto.phone);
    const companyName = this.normalizeText(dto.company);
    const operationMode = this.normalizeText(dto.operation_mode);
    const importVolume = this.normalizeText(dto.import_volume);
    const formContext = this.normalizeText(dto.form_context);
    const splitName = this.splitFullName(fullName);

    let gecomTenant: Awaited<ReturnType<LeadsService['resolveGecomTenant']>> | null = null;
    let lead: any = null;
    let completeLead: any = null;
    let leadCreationIssue: string | null = null;

    try {
      gecomTenant = await this.resolveGecomTenant();
      const ownerUser = await this.resolveGecomLeadOwner(gecomTenant.id, gecomTenant.company?.user_id ?? null);

      await this.repository.ensureDefaultStages(gecomTenant.id);

      const stages = await this.repository.listStages(gecomTenant.id);
      const firstActiveStage = stages.find((stage) => stage.is_active);

      const resolvedStatus = await this.statusConfigService.resolveLeadStatus(gecomTenant.id, {
        status: lead_status_enum.NEW,
      });

    const notes = [
      'Lead criado pela landing page publica /gecom.',
      `Empresa: ${companyName}`,
      `Como opera hoje: ${operationMode}`,
      `Volume mensal de importação: ${importVolume}`,
      `Telefone informado: ${phone}`,
      ...(formContext ? [`Origem do formulario: ${formContext}`] : []),
    ].join('\n\n');

      lead = await this.repository.createLead({
        tenantId: gecomTenant.id,
        name: fullName,
        type: lead_type_enum.PERSON,
        companyName,
        firstName: splitName.firstName,
        lastName: splitName.lastName,
        phone,
        source: lead_source_enum.WEBSITE,
        ownerUserId: ownerUser.id,
        status: resolvedStatus.status,
        statusConfigId: resolvedStatus.statusConfig.id,
        stageId: firstActiveStage?.id,
        notes,
      });

      if (firstActiveStage?.id) {
        await this.repository.createStageHistory({
          tenantId: gecomTenant.id,
          leadId: lead.id,
          toStageId: firstActiveStage.id,
          changedByUserId: ownerUser.id,
          note: 'Lead criado pela landing page publica /gecom',
        });
      }

      completeLead = await this.repository.findLeadById(gecomTenant.id, lead.id);

      this.automationDispatcher.dispatch({
        tenantId: gecomTenant.id,
        userId: ownerUser.id,
        entityName: 'leads',
        eventType: 'CREATE',
        recordId: lead.id,
        payload: (completeLead ?? lead) as unknown as Record<string, unknown>,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        leadCreationIssue = error.message;
      } else {
        leadCreationIssue = error instanceof Error ? error.message : 'Falha ao criar lead no tenant GECOM.';
      }
    }

    let emailSent = true;
    let emailError: string | null = null;

    try {
      await this.sendGecomPublicLeadNotification({
        leadId: lead?.id || null,
        tenantName: gecomTenant?.company?.company_name || gecomTenant?.name || null,
        leadName: fullName,
        companyName,
        phone,
        operationMode,
        importVolume,
        formContext: formContext || undefined,
        leadCreationIssue: leadCreationIssue || undefined,
      });
    } catch (error) {
      emailSent = false;
      emailError = error instanceof Error ? error.message : 'Falha ao enviar o email de notificacao.';
    }

    if (!emailSent && !lead) {
      throw new BadRequestException(emailError || 'Nao foi possivel registrar o contato.');
    }

    return {
      success: true,
      lead: completeLead ?? lead ?? null,
      lead_created: Boolean(lead),
      lead_creation_issue: leadCreationIssue,
      email_sent: emailSent,
      email_error: emailError,
    };
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
