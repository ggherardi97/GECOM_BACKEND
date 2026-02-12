import { Injectable } from '@nestjs/common';
import { Prisma, view_visibility_enum, view_source_enum } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SavedViewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(params: { id: string; tenantId: string }) {
    return this.prisma.saved_views.findFirst({
      where: {
        id: params.id,
        tenant_id: params.tenantId,
      },
    });
  }

  async findManyByEntity(params: { tenantId: string; entityName: string; includeInactive?: boolean }) {
    return this.prisma.saved_views.findMany({
      where: {
        tenant_id: params.tenantId,
        entity_name: params.entityName,
        ...(params.includeInactive ? {} : { is_active: true }),
      },
      orderBy: [{ is_system: 'desc' }, { name: 'asc' }],
    });
  }

  async create(params: {
    tenantId: string;
    ownerUserId: string;
    entityName: string;
    name: string;
    description?: string;
    visibility: view_visibility_enum;
    sharedWithUserIds?: string[] | null;
    sharedWithRoleIds?: string[] | null;
    definitionJson: Prisma.InputJsonValue;
    source?: view_source_enum;
    aiPrompt?: string | null;
  }) {
    return this.prisma.saved_views.create({
      data: {
        tenant_id: params.tenantId,
        owner_user_id: params.ownerUserId,
        entity_name: params.entityName,
        name: params.name,
        description: params.description ?? null,
        visibility: params.visibility,
        shared_with_user_ids: (params.sharedWithUserIds ?? null) as any,
        shared_with_role_ids: (params.sharedWithRoleIds ?? null) as any,
        definition_json: params.definitionJson,
        source: params.source ?? view_source_enum.MANUAL,
        ai_prompt: params.aiPrompt ?? null,
        is_system: false,
        is_active: true,
      } as any,
    });
  }

  async update(params: { id: string; tenantId: string; data: Prisma.saved_viewsUpdateInput }) {
    const result = await this.prisma.saved_views.updateMany({
      where: {
        id: params.id,
        tenant_id: params.tenantId,
      },
      data: params.data as any,
    });

    if (!result || result.count === 0) return null;
    return this.findById({ id: params.id, tenantId: params.tenantId });
  }

  async softDelete(params: { id: string; tenantId: string }) {
    return this.prisma.saved_views.updateMany({
      where: {
        id: params.id,
        tenant_id: params.tenantId,
      },
      data: { is_active: false, updated_at: new Date() } as any,
    });
  }

  async getUserDefault(params: { tenantId: string; userId: string; entityName: string }) {
    return this.prisma.user_default_views.findFirst({
      where: {
        tenant_id: params.tenantId,
        user_id: params.userId,
        entity_name: params.entityName,
      },
    });
  }

  async upsertUserDefault(params: { tenantId: string; userId: string; entityName: string; savedViewId: string }) {
    // We avoid Prisma named-unique input issues by doing a transactional replace.
    return this.prisma.transaction(async (tx) => {
      await tx.user_default_views.deleteMany({
        where: {
          tenant_id: params.tenantId,
          user_id: params.userId,
          entity_name: params.entityName,
        },
      });

      return tx.user_default_views.create({
        data: {
          tenant_id: params.tenantId,
          user_id: params.userId,
          entity_name: params.entityName,
          saved_view_id: params.savedViewId,
        },
      });
    });
  }


  async clearUserDefault(params: { tenantId: string; userId: string; entityName: string }) {
    return this.prisma.user_default_views.deleteMany({
      where: {
        tenant_id: params.tenantId,
        user_id: params.userId,
        entity_name: params.entityName,
      },
    });
  }
}
