import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, view_visibility_enum } from '@prisma/client';
import { CreateSavedViewDto, ViewVisibilityEnum } from './dto/create-saved-view.dto';
import { UpdateSavedViewDto } from './dto/update-saved-view.dto';
import { SavedViewsRepository } from './saved-views.repository';

@Injectable()
export class SavedViewsService {
  constructor(private readonly repository: SavedViewsRepository) {}

  private normalizeVisibility(value?: ViewVisibilityEnum): view_visibility_enum {
    const raw = (value ?? ViewVisibilityEnum.PRIVATE) as any;
    if (raw !== 'PRIVATE' && raw !== 'SHARED' && raw !== 'PUBLIC') return view_visibility_enum.PRIVATE;
    return raw as view_visibility_enum;
  }

  private asStringArray(value: unknown): string[] | null {
    if (!Array.isArray(value)) return null;
    const list = value.map(v => String(v)).filter(v => v.trim().length > 0);
    return list.length > 0 ? list : null;
  }

  private canRead(view: any, userId: string, userRole?: string): boolean {
    if (!view) return false;
    if (view.is_active === false) return false;

    if (view.is_system) return true;
    if (view.owner_user_id === userId) return true;

    if (view.visibility === 'PUBLIC') return true;

    if (view.visibility === 'SHARED') {
      const sharedUsers = this.asStringArray(view.shared_with_user_ids) ?? [];
      if (sharedUsers.includes(userId)) return true;

      const sharedRoles = this.asStringArray(view.shared_with_role_ids) ?? [];
      if (userRole && sharedRoles.includes(userRole)) return true;
    }

    return false;
  }

  private canWrite(view: any, userId: string): boolean {
    if (!view) return false;
    if (view.is_system) return false;
    return view.owner_user_id === userId;
  }

  async listByEntity(params: { tenantId: string; entityName: string; userId: string; userRole?: string; includeInactive?: boolean }) {
    const all = await this.repository.findManyByEntity({
      tenantId: params.tenantId,
      entityName: params.entityName,
      includeInactive: params.includeInactive,
    });

    // If includeInactive is true, we still only return inactive to the owner (safety).
    return all.filter(v => {
      if (v.is_active === false) return v.owner_user_id === params.userId;
      return this.canRead(v, params.userId, params.userRole);
    });
  }

  async getById(params: { tenantId: string; id: string; userId: string; userRole?: string }) {
    const view = await this.repository.findById({ tenantId: params.tenantId, id: params.id });
    if (!view) throw new NotFoundException('View not found.');
    if (!this.canRead(view, params.userId, params.userRole)) throw new ForbiddenException('You do not have access to this view.');
    return view;
  }

  async create(params: { tenantId: string; userId: string }, dto: CreateSavedViewDto) {
    const visibility = this.normalizeVisibility(dto.visibility);

    const sharedWithUserIds = visibility === view_visibility_enum.SHARED ? (dto.shared_with_user_ids ?? null) : null;
    const sharedWithRoleIds = visibility === view_visibility_enum.SHARED ? (dto.shared_with_role_ids ?? null) : null;

    const created = await this.repository.create({
      tenantId: params.tenantId,
      ownerUserId: params.userId,
      entityName: dto.entity_name,
      name: dto.name,
      description: dto.description,
      visibility,
      sharedWithUserIds,
      sharedWithRoleIds,
      definitionJson: dto.definition_json as Prisma.InputJsonValue,
    });

    if (dto.set_as_default === true) {
      await this.repository.upsertUserDefault({
        tenantId: params.tenantId,
        userId: params.userId,
        entityName: created.entity_name,
        savedViewId: created.id,
      });
    }

    return created;
  }

  async update(params: { tenantId: string; id: string; userId: string }, dto: UpdateSavedViewDto) {
    const existing = await this.repository.findById({ tenantId: params.tenantId, id: params.id });
    if (!existing) throw new NotFoundException('View not found.');
    if (!this.canWrite(existing, params.userId)) throw new ForbiddenException('You cannot edit this view.');

    const visibility = dto.visibility ? this.normalizeVisibility(dto.visibility) : undefined;

    const data: Prisma.saved_viewsUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.definition_json !== undefined ? { definition_json: dto.definition_json as Prisma.InputJsonValue } : {}),
      ...(visibility !== undefined ? { visibility } : {}),
      ...(visibility === view_visibility_enum.SHARED
        ? {
            shared_with_user_ids: (dto.shared_with_user_ids ?? null) as any,
            shared_with_role_ids: (dto.shared_with_role_ids ?? null) as any,
          }
        : visibility !== undefined
          ? { shared_with_user_ids: null as any, shared_with_role_ids: null as any }
          : {}),
      updated_at: new Date() as any,
    };

    const updated = await this.repository.update({ id: params.id, tenantId: params.tenantId, data });
    if (!updated) throw new NotFoundException('View not found.');

    if (dto.set_as_default === true) {
      await this.repository.upsertUserDefault({
        tenantId: params.tenantId,
        userId: params.userId,
        entityName: updated.entity_name,
        savedViewId: updated.id,
      });
    }

    return updated;
  }

  async remove(params: { tenantId: string; id: string; userId: string }) {
    const existing = await this.repository.findById({ tenantId: params.tenantId, id: params.id });
    if (!existing) throw new NotFoundException('View not found.');
    if (!this.canWrite(existing, params.userId)) throw new ForbiddenException('You cannot delete this view.');

    await this.repository.softDelete({ tenantId: params.tenantId, id: params.id });
    return { ok: true };
  }

  async setDefault(params: { tenantId: string; userId: string; entityName: string; savedViewId: string }) {
    const view = await this.repository.findById({ tenantId: params.tenantId, id: params.savedViewId });
    if (!view) throw new NotFoundException('View not found.');
    if (view.entity_name !== params.entityName) throw new BadRequestException('Entity name does not match view entity.');

    // The user must be able to read the view to set it as default.
    if (!this.canRead(view, params.userId, undefined)) throw new ForbiddenException('You do not have access to this view.');

    await this.repository.upsertUserDefault({
      tenantId: params.tenantId,
      userId: params.userId,
      entityName: params.entityName,
      savedViewId: params.savedViewId,
    });

    return { ok: true };
  }

  async clearDefault(params: { tenantId: string; userId: string; entityName: string }) {
    await this.repository.clearUserDefault({
      tenantId: params.tenantId,
      userId: params.userId,
      entityName: params.entityName,
    });
    return { ok: true };
  }

  async getDefault(params: { tenantId: string; userId: string; entityName: string }) {
    return this.repository.getUserDefault({
      tenantId: params.tenantId,
      userId: params.userId,
      entityName: params.entityName,
    });
  }
}
