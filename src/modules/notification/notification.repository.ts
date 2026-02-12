import { Injectable, Logger } from '@nestjs/common';
import { Prisma, notification_severity_enum } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '../../prisma/prisma.service';
import { handlePrismaError } from '../utils/errors';

@Injectable()
export class NotificationRepository {
  private readonly logger = new Logger(NotificationRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findMyActive(params: { companyId: string; userId: string; unreadOnly?: boolean }) {
    try {
      const now = new Date();

      const where: Prisma.notificationsWhereInput = {
        company_id: params.companyId,
        is_active: true,
        AND: [
          { OR: [{ starts_at: null }, { starts_at: { lte: now } }] },
          { OR: [{ expires_at: null }, { expires_at: { gt: now } }] },
        ],
        ...(params.unreadOnly
          ? {
              reads: {
                none: {
                  user_id: params.userId,
                  read_at: { not: null },
                },
              },
            }
          : {}),
      };

      // tenant_id is injected by Prisma middleware for findMany (per your architecture)
      return await this.prisma.notifications.findMany({
        where,
        orderBy: [{ created_at: 'desc' }],
        include: {
          company: true,
          createdBy: { select: { id: true, full_name: true, email: true } },
          reads: {
            where: { user_id: params.userId },
            select: { id: true, read_at: true },
            take: 1,
          },
        },
      });
    } catch (error) {
      handlePrismaError(error, 'fetching notifications');
    }
  }

  async findAdminList(tenantId: string, params?: { company_id?: string; is_active?: boolean; q?: string; includeExpired?: boolean }) {
    try {
      const now = new Date();
      const q = params?.q?.trim();

      const where: Prisma.notificationsWhereInput = {
        ...(params?.company_id ? { company_id: params.company_id } : {}),
        ...(params?.is_active !== undefined ? { is_active: params.is_active } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { message: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(!params?.includeExpired
          ? {
              AND: [
                { OR: [{ starts_at: null }, { starts_at: { lte: now } }] },
                { OR: [{ expires_at: null }, { expires_at: { gt: now } }] },
              ],
            }
          : {}),
      };

      return await this.prisma.notifications.findMany({
        where: { ...(where as any), tenant_id: tenantId } as any,
        orderBy: [{ created_at: 'desc' }],
        include: {
          company: true,
          createdBy: { select: { id: true, full_name: true, email: true } },
          _count: { select: { reads: true } },
        },
      });
    } catch (error) {
      handlePrismaError(error, 'fetching notifications (admin)');
    }
  }

  async findById(id: string, tenantId: string) {
    try {
      // IMPORTANT: do not use findUnique here; we must enforce tenant_id
      return await this.prisma.notifications.findFirst({
        where: { id, tenant_id: tenantId } as any,
        include: {
          company: true,
          createdBy: { select: { id: true, full_name: true, email: true } },
        },
      });
    } catch (error) {
      handlePrismaError(error, 'fetching notification by id');
    }
  }

  async create(data: Prisma.notificationsCreateInput) {
    try {
      // tenant_id is injected by Prisma middleware in create (per your architecture)
      return await this.prisma.notifications.create({
        data,
        include: {
          company: true,
          createdBy: { select: { id: true, full_name: true, email: true } },
        },
      });
    } catch (e) {
      this.logger.error(e);
      return null;
    }
  }

  async update(id: string, tenantId: string, data: Prisma.notificationsUncheckedUpdateInput) {
    try {
      const result = await this.prisma.notifications.updateMany({
        where: { id, tenant_id: tenantId } as any,
        data,
      });

      if (!result || result.count === 0) return null;

      return await this.findById(id, tenantId);
    } catch (error) {
      handlePrismaError(error, 'updating notification');
    }
  }

  async deactivate(id: string, tenantId: string) {
    return this.update(id, tenantId, { is_active: false, updated_at: new Date() });
  }

  async markRead(params: { notificationId: string; tenantId: string; userId: string }) {
    try {
      const now = new Date();
      const where = {
        tenant_id: params.tenantId,
        notification_id: params.notificationId,
        user_id: params.userId,
      } as Prisma.notification_readsWhereInput;

      const updated = await this.prisma.notification_reads.updateMany({
        where,
        data: { read_at: now },
      });

      if (updated.count > 0) {
        return await this.prisma.notification_reads.findFirst({ where });
      }

      try {
        return await this.prisma.notification_reads.create({
          data: {
            tenant_id: params.tenantId,
            notification_id: params.notificationId,
            user_id: params.userId,
            read_at: now,
          },
        });
      } catch (error) {
        // Concurrent request can create the same unique row first.
        if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
          await this.prisma.notification_reads.updateMany({
            where,
            data: { read_at: now },
          });
          return await this.prisma.notification_reads.findFirst({ where });
        }
        throw error;
      }
    } catch (error) {
      handlePrismaError(error, 'marking notification as read');
    }
  }
}
