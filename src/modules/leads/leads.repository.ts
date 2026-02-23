import { Injectable } from '@nestjs/common';
import {
  lead_activity_type_enum,
  lead_source_enum,
  lead_status_enum,
  lead_type_enum,
  Prisma,
} from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LeadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listStages(tenantId: string) {
    return this.prisma.lead_pipeline_stages.findMany({
      where: { tenant_id: tenantId },
      orderBy: [{ sort_order: 'asc' }],
    });
  }

  async findStageById(tenantId: string, stageId: string) {
    return this.prisma.lead_pipeline_stages.findFirst({
      where: { tenant_id: tenantId, id: stageId },
    });
  }

  async createStage(params: {
    tenantId: string;
    name: string;
    sortOrder?: number;
    isWon?: boolean;
    isLost?: boolean;
    isActive?: boolean;
  }) {
    const sortOrder =
      params.sortOrder ??
      (await this.prisma.lead_pipeline_stages.aggregate({
        where: { tenant_id: params.tenantId },
        _max: { sort_order: true },
      }).then((r) => Number(r._max.sort_order ?? -1) + 1));

    return this.prisma.lead_pipeline_stages.create({
      data: {
        tenant_id: params.tenantId,
        name: params.name,
        sort_order: sortOrder,
        is_won: params.isWon ?? false,
        is_lost: params.isLost ?? false,
        is_active: params.isActive ?? true,
      },
    });
  }

  async updateStage(params: { tenantId: string; stageId: string; data: Prisma.lead_pipeline_stagesUncheckedUpdateInput }) {
    const updated = await this.prisma.lead_pipeline_stages.updateMany({
      where: { tenant_id: params.tenantId, id: params.stageId },
      data: params.data,
    });

    if (updated.count === 0) return null;

    return this.findStageById(params.tenantId, params.stageId);
  }

  async ensureDefaultStages(tenantId: string) {
    const count = await this.prisma.lead_pipeline_stages.count({ where: { tenant_id: tenantId } });
    if (count > 0) return;

    await this.prisma.lead_pipeline_stages.createMany({
      data: [
        { tenant_id: tenantId, name: 'Novo', sort_order: 0, is_won: false, is_lost: false, is_active: true },
        { tenant_id: tenantId, name: 'Em Contato', sort_order: 1, is_won: false, is_lost: false, is_active: true },
        { tenant_id: tenantId, name: 'Qualificado', sort_order: 2, is_won: false, is_lost: false, is_active: true },
        { tenant_id: tenantId, name: 'Fechado Ganho', sort_order: 3, is_won: true, is_lost: false, is_active: true },
        { tenant_id: tenantId, name: 'Fechado Perdido', sort_order: 4, is_won: false, is_lost: true, is_active: true },
      ],
    });
  }

  async listLeads(params: {
    tenantId: string;
    status?: lead_status_enum;
    statusConfigId?: string;
    q?: string;
    ownerUserId?: string;
    stageId?: string;
  }) {
    const q = params.q?.trim();

    return this.prisma.leads.findMany({
      where: {
        tenant_id: params.tenantId,
        ...(params.statusConfigId ? { status_config_id: params.statusConfigId } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(params.ownerUserId ? { owner_user_id: params.ownerUserId } : {}),
        ...(params.stageId ? { stage_id: params.stageId } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { company_name: { contains: q, mode: 'insensitive' } },
                { first_name: { contains: q, mode: 'insensitive' } },
                { last_name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }],
      include: {
        owner_user: { select: { id: true, full_name: true, email: true } },
        stage: true,
        status_config: true,
        _count: { select: { activities: true, tags: true } },
      },
    });
  }

  async findLeadById(tenantId: string, leadId: string) {
    return this.prisma.leads.findFirst({
      where: { tenant_id: tenantId, id: leadId },
      include: {
        owner_user: { select: { id: true, full_name: true, email: true } },
        stage: true,
        status_config: true,
        converted_company: { select: { id: true, company_name: true } },
        stage_history: {
          orderBy: [{ changed_at: 'desc' }],
          include: {
            from_stage: true,
            to_stage: true,
            changed_by_user: { select: { id: true, full_name: true, email: true } },
          },
        },
        activities: {
          orderBy: [{ created_at: 'desc' }],
          include: {
            created_by_user: { select: { id: true, full_name: true, email: true } },
            assigned_to_user: { select: { id: true, full_name: true, email: true } },
          },
        },
        tags: {
          include: { tag: true },
        },
      },
    });
  }

  async createLead(params: {
    tenantId: string;
    name: string;
    type: lead_type_enum;
    companyName?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    website?: string;
    source?: lead_source_enum;
    ownerUserId: string;
    status?: lead_status_enum;
    statusConfigId?: string;
    stageId?: string;
    disqualifyReason?: string;
    estimatedValue?: number;
    currencyCode?: string;
    notes?: string;
    convertedCompanyId?: string;
    convertedContactId?: string;
    convertedAt?: Date;
  }) {
    return this.prisma.leads.create({
      data: {
        tenant_id: params.tenantId,
        name: params.name,
        type: params.type,
        company_name: params.companyName ?? null,
        first_name: params.firstName ?? null,
        last_name: params.lastName ?? null,
        email: params.email ?? null,
        phone: params.phone ?? null,
        website: params.website ?? null,
        source: params.source ?? lead_source_enum.MANUAL,
        owner_user_id: params.ownerUserId,
        status: params.status ?? lead_status_enum.NEW,
        status_config_id: params.statusConfigId ?? null,
        stage_id: params.stageId ?? null,
        disqualify_reason: params.disqualifyReason ?? null,
        estimated_value: params.estimatedValue ?? null,
        currency_code: params.currencyCode ?? null,
        notes: params.notes ?? null,
        converted_company_id: params.convertedCompanyId ?? null,
        converted_contact_id: params.convertedContactId ?? null,
        converted_at: params.convertedAt ?? null,
      },
    });
  }

  async updateLead(params: { tenantId: string; leadId: string; data: Prisma.leadsUncheckedUpdateInput }) {
    const updated = await this.prisma.leads.updateMany({
      where: { tenant_id: params.tenantId, id: params.leadId },
      data: params.data,
    });

    if (updated.count === 0) return null;
    return this.findLeadById(params.tenantId, params.leadId);
  }

  async createStageHistory(params: {
    tenantId: string;
    leadId: string;
    fromStageId?: string;
    toStageId: string;
    changedByUserId: string;
    note?: string;
  }) {
    return this.prisma.lead_stage_history.create({
      data: {
        tenant_id: params.tenantId,
        lead_id: params.leadId,
        from_stage_id: params.fromStageId ?? null,
        to_stage_id: params.toStageId,
        changed_by_user_id: params.changedByUserId,
        note: params.note ?? null,
      },
    });
  }

  async listActivities(tenantId: string, leadId: string) {
    return this.prisma.lead_activities.findMany({
      where: { tenant_id: tenantId, lead_id: leadId },
      orderBy: [{ created_at: 'desc' }],
      include: {
        created_by_user: { select: { id: true, full_name: true, email: true } },
        assigned_to_user: { select: { id: true, full_name: true, email: true } },
      },
    });
  }

  async createActivity(params: {
    tenantId: string;
    leadId: string;
    type: lead_activity_type_enum;
    subject: string;
    description?: string;
    dueDate?: Date;
    completedAt?: Date;
    createdByUserId: string;
    assignedToUserId?: string;
  }) {
    return this.prisma.lead_activities.create({
      data: {
        tenant_id: params.tenantId,
        lead_id: params.leadId,
        type: params.type,
        subject: params.subject,
        description: params.description ?? null,
        due_date: params.dueDate ?? null,
        completed_at: params.completedAt ?? null,
        created_by_user_id: params.createdByUserId,
        assigned_to_user_id: params.assignedToUserId ?? null,
      },
      include: {
        created_by_user: { select: { id: true, full_name: true, email: true } },
        assigned_to_user: { select: { id: true, full_name: true, email: true } },
      },
    });
  }

  async updateActivity(params: { tenantId: string; activityId: string; data: Prisma.lead_activitiesUncheckedUpdateInput }) {
    const updated = await this.prisma.lead_activities.updateMany({
      where: {
        tenant_id: params.tenantId,
        id: params.activityId,
      },
      data: params.data,
    });

    if (updated.count === 0) return null;

    return this.prisma.lead_activities.findFirst({
      where: {
        tenant_id: params.tenantId,
        id: params.activityId,
      },
      include: {
        created_by_user: { select: { id: true, full_name: true, email: true } },
        assigned_to_user: { select: { id: true, full_name: true, email: true } },
      },
    });
  }

  async listTags(tenantId: string) {
    return this.prisma.lead_tags.findMany({
      where: { tenant_id: tenantId },
      orderBy: [{ name: 'asc' }],
    });
  }

  async createTag(params: { tenantId: string; name: string; color?: string }) {
    try {
      return await this.prisma.lead_tags.create({
        data: {
          tenant_id: params.tenantId,
          name: params.name,
          color: params.color ?? null,
        },
      });
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.prisma.lead_tags.findFirst({
          where: {
            tenant_id: params.tenantId,
            name: params.name,
          },
        });
      }
      throw error;
    }
  }

  async setLeadTags(params: { tenantId: string; leadId: string; tagIds: string[] }) {
    const ids = Array.from(new Set(params.tagIds));

    return this.prisma.transaction(async (tx) => {
      const db = tx as any;

      await db.lead_tag_links.deleteMany({
        where: {
          tenant_id: params.tenantId,
          lead_id: params.leadId,
        },
      });

      if (ids.length > 0) {
        await db.lead_tag_links.createMany({
          data: ids.map((tagId) => ({
            tenant_id: params.tenantId,
            lead_id: params.leadId,
            tag_id: tagId,
          })),
        });
      }

      return db.lead_tag_links.findMany({
        where: {
          tenant_id: params.tenantId,
          lead_id: params.leadId,
        },
        include: {
          tag: true,
        },
      });
    });
  }
}
