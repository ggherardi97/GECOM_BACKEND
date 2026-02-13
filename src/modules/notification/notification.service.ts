import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, notification_severity_enum, user_role_enum } from '@prisma/client';
import { NotificationRepository } from './notification.repository';
import { CreateNotificationDTO, NotificationSeverityEnum } from './dto/create.dto';
import { UpdateNotificationDTO } from './dto/update.dto';

type AuthUser = {
  id?: string;
  user_id?: string;
  tenant_id: string;
  company_id?: string | null;
  role?: user_role_enum | string | null;
};

function getAuthUserId(user: AuthUser): string {
  const id = (user.id ?? user.user_id ?? '').trim();
  if (!id) throw new BadRequestException('Authenticated user id is missing');
  return id;
}

function assertAdmin(user: AuthUser) {
  const role = String(user?.role || '').toUpperCase();
  if (role !== 'ADMIN' && role !== 'MANAGER') {
    throw new ForbiddenException('You do not have permission to perform this action');
  }
}

function isAdmin(user: AuthUser): boolean {
  const role = String(user?.role || '').toUpperCase();
  return role === 'ADMIN' || role === 'MANAGER';
}

function parseDateOrNull(value?: string | null): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

@Injectable()
export class NotificationService {
  constructor(private readonly repository: NotificationRepository) {}

  async findById(user: AuthUser, id: string) {
    const notification = await this.repository.findById(id, user.tenant_id);
    if (!notification) throw new NotFoundException('Notification not found');

    if (isAdmin(user)) return notification;

    const companyId = String(user.company_id ?? '').trim();
    if (!companyId) throw new BadRequestException('User does not have a company_id');
    if (notification.company_id !== companyId) {
      throw new ForbiddenException('You do not have access to this notification');
    }

    return notification;
  }

  async findMy(user: AuthUser, query?: { unread_only?: string }) {
    const userId = getAuthUserId(user);
    const companyId = user.company_id ? String(user.company_id) : '';
    if (!companyId) throw new BadRequestException('User does not have a company_id');

    const unreadOnly =
      query?.unread_only !== undefined && String(query.unread_only).trim().length > 0
        ? String(query.unread_only).toLowerCase() === 'true'
        : false;

    return this.repository.findMyActive({
      companyId,
      userId,
      unreadOnly,
    });
  }

  async adminList(user: AuthUser, query?: { company_id?: string; is_active?: string; q?: string; include_expired?: string }) {
    assertAdmin(user);

    const is_active =
      query?.is_active !== undefined && String(query.is_active).trim().length > 0
        ? String(query.is_active).toLowerCase() === 'true'
        : undefined;

    const includeExpired =
      query?.include_expired !== undefined && String(query.include_expired).trim().length > 0
        ? String(query.include_expired).toLowerCase() === 'true'
        : false;

    return this.repository.findAdminList(user.tenant_id, {
      company_id: query?.company_id,
      is_active,
      q: query?.q,
      includeExpired,
    });
  }

  async create(user: AuthUser, dto: CreateNotificationDTO) {
    assertAdmin(user);
    const userId = getAuthUserId(user);

    if (dto.expires_at && dto.starts_at) {
      const startsAt = new Date(dto.starts_at);
      const expiresAt = new Date(dto.expires_at);
      if (!Number.isNaN(startsAt.getTime()) && !Number.isNaN(expiresAt.getTime()) && expiresAt <= startsAt) {
        throw new BadRequestException('expires_at must be greater than starts_at');
      }
    }

const created = await this.repository.create({
  tenant_id: user.tenant_id,
  company: { connect: { id: dto.company_id } },
  title: dto.title?.trim() || null,
  message: dto.message,
  severity: (dto.severity as any) ?? 'INFO',
  starts_at: dto.starts_at ? new Date(dto.starts_at) : null,
  expires_at: dto.expires_at ? new Date(dto.expires_at) : null,
  is_active: dto.is_active ?? true,
  createdBy: { connect: { id: userId } },
});


    if (!created) throw new BadRequestException('Failed to create notification');
    return created;
  }

  async update(user: AuthUser, id: string, dto: UpdateNotificationDTO) {
    assertAdmin(user);

    const existing = await this.repository.findById(id, user.tenant_id);
    if (!existing) throw new NotFoundException('Notification not found');

    const updated = await this.repository.update(id, user.tenant_id, {
      company_id: dto.company_id !== undefined ? dto.company_id : undefined,

      title: dto.title !== undefined ? (dto.title === null ? null : dto.title.trim()) : undefined,
      message: dto.message !== undefined ? dto.message : undefined,
      severity: dto.severity !== undefined ? (dto.severity as any) : undefined,

      starts_at: dto.starts_at !== undefined ? parseDateOrNull(dto.starts_at) : undefined,
      expires_at: dto.expires_at !== undefined ? parseDateOrNull(dto.expires_at) : undefined,

      is_active: dto.is_active !== undefined ? dto.is_active : undefined,
      updated_at: new Date(),
    });

    if (!updated) throw new NotFoundException('Notification not found');
    return updated;
  }

  async deactivate(user: AuthUser, id: string) {
    assertAdmin(user);

    const existing = await this.repository.findById(id, user.tenant_id);
    if (!existing) throw new NotFoundException('Notification not found');

    const deactivated = await this.repository.deactivate(id, user.tenant_id);
    if (!deactivated) throw new NotFoundException('Notification not found');

    return deactivated;
  }

  async markRead(user: AuthUser, id: string) {
    const userId = getAuthUserId(user);
    const existing = await this.repository.findById(id, user.tenant_id);
    if (!existing) throw new NotFoundException('Notification not found');

    return this.repository.markRead({
      notificationId: id,
      tenantId: user.tenant_id,
      userId,
    });
  }
}
