import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantSubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertTenantSubscriptionDto } from './dto/upsert-tenant-subscription.dto';

const ACTIVE_SUBSCRIPTION_STATUSES: TenantSubscriptionStatus[] = [
  TenantSubscriptionStatus.ACTIVE,
  TenantSubscriptionStatus.TRIAL,
];

@Injectable()
export class TenantSubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  async searchTenants(params?: { q?: string; limit?: number }) {
    const q = String(params?.q ?? '').trim();
    const take = Math.max(1, Math.min(50, Number(params?.limit ?? 20)));

    if (!q) return [];

    return this.prisma.tenants.findMany({
      where: {
        deleted_at: null,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { slug: { contains: q, mode: 'insensitive' } },
          {
            company: {
              company_name: {
                contains: q,
                mode: 'insensitive',
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        company_id: true,
        company: {
          select: {
            id: true,
            company_name: true,
          },
        },
      },
      orderBy: [{ name: 'asc' }],
      take,
    });
  }

  async getCurrentByTenant(tenantId: string) {
    await this.assertTenantExists(tenantId);

    const active = await this.prisma.tenant_subscriptions.findFirst({
      where: {
        tenant_id: tenantId,
        status: { in: ACTIVE_SUBSCRIPTION_STATUSES },
      },
      include: {
        plan: true,
      },
      orderBy: [{ starts_at: 'desc' }, { updated_at: 'desc' }],
    });

    if (active) return active;

    return this.prisma.tenant_subscriptions.findFirst({
      where: {
        tenant_id: tenantId,
      },
      include: {
        plan: true,
      },
      orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
    });
  }

  async upsertByTenant(tenantId: string, dto: UpsertTenantSubscriptionDto) {
    await this.assertTenantExists(tenantId);
    await this.assertPlanExists(dto.plan_id);

    const status = dto.status ?? TenantSubscriptionStatus.ACTIVE;
    const startsAt = this.parseDateOrUndefined(dto.starts_at, 'starts_at');
    const endsAt = this.parseDateOrUndefinedOrNull(dto.ends_at, 'ends_at');
    const renewsAt = this.parseDateOrUndefinedOrNull(dto.renews_at, 'renews_at');

    const now = new Date();

    const saved = await this.prisma.transaction(async (tx) => {
      const activeRows = await tx.tenant_subscriptions.findMany({
        where: {
          tenant_id: tenantId,
          status: {
            in: ACTIVE_SUBSCRIPTION_STATUSES,
          },
        },
        orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
      });

      if (activeRows.length > 1) {
        const duplicatedIds = activeRows.slice(1).map((row) => row.id);
        await tx.tenant_subscriptions.updateMany({
          where: {
            id: { in: duplicatedIds },
          },
          data: {
            status: TenantSubscriptionStatus.CANCELED,
            ends_at: now,
            updated_at: now,
          },
        });
      }

      const primaryActive = activeRows.length > 0 ? activeRows[0] : null;
      let target = primaryActive;

      if (!target) {
        target = await tx.tenant_subscriptions.findFirst({
          where: {
            tenant_id: tenantId,
          },
          orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
        });
      }

      if (target) {
        const updated = await tx.tenant_subscriptions.update({
          where: { id: target.id },
          data: {
            plan_id: dto.plan_id,
            status,
            ...(startsAt !== undefined ? { starts_at: startsAt } : {}),
            ...(endsAt !== undefined ? { ends_at: endsAt } : {}),
            ...(renewsAt !== undefined ? { renews_at: renewsAt } : {}),
            updated_at: now,
          },
        });

        if (ACTIVE_SUBSCRIPTION_STATUSES.includes(status)) {
          await tx.tenant_subscriptions.updateMany({
            where: {
              tenant_id: tenantId,
              id: { not: updated.id },
              status: { in: ACTIVE_SUBSCRIPTION_STATUSES },
            },
            data: {
              status: TenantSubscriptionStatus.CANCELED,
              ends_at: now,
              updated_at: now,
            },
          });
        }

        return updated;
      }

      return tx.tenant_subscriptions.create({
        data: {
          tenant_id: tenantId,
          plan_id: dto.plan_id,
          status,
          starts_at: startsAt ?? now,
          ends_at: endsAt === undefined ? null : endsAt,
          renews_at: renewsAt === undefined ? null : renewsAt,
        },
      });
    });

    return this.prisma.tenant_subscriptions.findUnique({
      where: { id: saved.id },
      include: {
        plan: true,
      },
    });
  }

  private async assertTenantExists(tenantId: string) {
    const tenant = await this.prisma.tenants.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant nao encontrado.');
  }

  private async assertPlanExists(planId: string) {
    const plan = await this.prisma.plans.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plano nao encontrado.');
  }

  private parseDateOrUndefined(value: string | undefined, field: string): Date | undefined {
    if (value === undefined) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Data invalida para ${field}.`);
    }
    return date;
  }

  private parseDateOrUndefinedOrNull(
    value: string | null | undefined,
    field: string,
  ): Date | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Data invalida para ${field}.`);
    }
    return date;
  }
}
