import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma, fly_checker_searches } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { Scope, FlightOffer } from './fly-checker.types';

@Injectable()
export class FlyCheckerRepository {
  constructor(private readonly prisma: PrismaService) {}
  private get db() {
    return this.prisma.raw;
  }
  where(scope: Scope) {
    return { tenant_id: scope.tenantId, user_id: scope.userId };
  }
  async own(scope: Scope, id: string) {
    const row = await this.db.fly_checker_searches.findFirst({
      where: { ...this.where(scope), id },
    });
    if (!row) throw new NotFoundException('Busca não encontrada.');
    return row;
  }
  async create(
    scope: Scope,
    data: Omit<Prisma.fly_checker_searchesUncheckedCreateInput, 'tenant_id' | 'user_id'>
  ) {
    return this.db.fly_checker_searches.create({ data: { ...data, ...this.where(scope) } });
  }
  count(scope: Scope) {
    return this.db.fly_checker_searches.count({ where: { ...this.where(scope), active: true } });
  }
  list(scope: Scope, page: number) {
    return this.db.fly_checker_searches.findMany({
      where: this.where(scope),
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * 50,
      take: 50,
      include: { checks: { orderBy: { started_at: 'desc' }, take: 1 } },
    });
  }
  async update(scope: Scope, id: string, data: Prisma.fly_checker_searchesUpdateManyMutationInput) {
    await this.own(scope, id);
    const result = await this.db.fly_checker_searches.updateMany({
      where: {
        ...this.where(scope),
        id,
        OR: [{ locked_until: null }, { locked_until: { lt: new Date() } }],
      },
      data,
    });
    if (!result.count)
      throw new ConflictException('Aguarde a consulta em andamento para alterar esta busca.');
    return this.own(scope, id);
  }
  async pause(scope: Scope, id: string, data: Prisma.fly_checker_searchesUpdateManyMutationInput) {
    return this.prisma.transaction(async (db) => {
      const result = await db.fly_checker_searches.updateMany({
        where: { ...this.where(scope), id },
        data: { ...data, active: false },
      });
      if (!result.count) throw new NotFoundException('Busca não encontrada.');
      await db.fly_checker_checks.updateMany({
        where: { tenant_id: scope.tenantId, search_id: id, status: 'running' },
        data: {
          status: 'cancelled',
          finished_at: new Date(),
          error_message: 'Busca pausada pelo usuário.',
        },
      });
      return db.fly_checker_searches.findFirst({ where: { ...this.where(scope), id } });
    });
  }
  async remove(scope: Scope, id: string) {
    // Database foreign keys remove this search's checks, prices and alerts atomically.
    const result = await this.db.fly_checker_searches.deleteMany({
      where: { ...this.where(scope), id },
    });
    if (!result.count) throw new NotFoundException('Busca não encontrada.');
    return { deleted: true };
  }
  cancelRunning(search: fly_checker_searches, token: string) {
    return this.db.fly_checker_checks.updateMany({
      where: {
        tenant_id: search.tenant_id,
        search_id: search.id,
        status: 'running',
        search: { lock_token: token },
      },
      data: {
        status: 'cancelled',
        finished_at: new Date(),
        error_message: 'Acompanhamento interrompido.',
      },
    });
  }
  async detail(scope: Scope, id: string, page: number, environment: string, provider: string) {
    const search = await this.own(scope, id);
    const where = { tenant_id: scope.tenantId, search_id: id };
    const [checks, total, alerts, stats] = await Promise.all([
      this.db.fly_checker_checks.findMany({
        where,
        orderBy: { started_at: 'desc' },
        skip: (page - 1) * 20,
        take: 20,
        include: { prices: { orderBy: { price: 'asc' }, take: 10 } },
      }),
      this.db.fly_checker_checks.count({ where }),
      this.db.fly_checker_alerts.findMany({ where, orderBy: { created_at: 'desc' }, take: 30 }),
      this.stats(scope.tenantId, id, environment, new Date(), provider),
    ]);
    return { search, checks, total, page, alerts, stats };
  }
  async stats(tenantId: string, id: string, environment: string, before: Date, provider: string) {
    const where = {
      tenant_id: tenantId,
      search_id: id,
      environment,
      provider,
      status: 'success',
      min_price: { not: null },
      started_at: { lt: before },
    };
    const [recent, low] = await Promise.all([
      this.db.fly_checker_checks.findMany({
        where: {
          ...where,
          started_at: { lt: before, gte: new Date(before.getTime() - 7 * 86400000) },
        },
        select: { min_price: true, started_at: true },
      }),
      this.db.fly_checker_checks.aggregate({ where, _min: { min_price: true } }),
    ]);
    return {
      average: recent.length
        ? recent.reduce((sum, x) => sum + Number(x.min_price), 0) / recent.length
        : null,
      low: low._min.min_price === null ? null : Number(low._min.min_price),
      samples: recent.length,
      days: new Set(recent.map((x) => x.started_at.toISOString().slice(0, 10))).size,
    };
  }
  // The only cross-tenant read: trusted worker enumerates due IDs; all processing is tenant-scoped.
  due() {
    const now = new Date();
    return this.prisma.unscoped.fly_checker_searches.findMany({
      where: {
        active: true,
        next_check_at: { lte: now },
        OR: [{ locked_until: null }, { locked_until: { lt: now } }],
      },
      orderBy: { next_check_at: 'asc' },
      take: 10,
      select: { id: true, tenant_id: true, user_id: true },
    });
  }
  async claim(scope: Scope, id: string, intervalMinutes: number) {
    const now = new Date();
    const token = randomUUID();
    const result = await this.db.fly_checker_searches.updateMany({
      where: {
        ...this.where(scope),
        id,
        active: true,
        next_check_at: { lte: now },
        OR: [{ locked_until: null }, { locked_until: { lt: now } }],
      },
      data: {
        lock_token: token,
        locked_until: new Date(now.getTime() + 12 * 60000),
        last_check_at: now,
        next_check_at: new Date(now.getTime() + intervalMinutes * 60000),
      },
    });
    if (!result.count) return null;
    await this.db.fly_checker_checks.updateMany({
      where: { tenant_id: scope.tenantId, search_id: id, status: 'running' },
      data: {
        status: 'error',
        finished_at: now,
        error_message: 'Execução interrompida; retomada em uma nova consulta.',
      },
    });
    // A crash after SMTP acceptance is ambiguous. Never blindly resend such an alert.
    await this.db.fly_checker_alerts.updateMany({
      where: { tenant_id: scope.tenantId, search_id: id, status: 'sending' },
      data: {
        status: 'uncertain',
        error_message: 'Envio interrompido; entrega não confirmada. Reenvio automático bloqueado.',
      },
    });
    const search = await this.db.fly_checker_searches.findFirst({
      where: { ...this.where(scope), id },
    });
    return search ? { search, token } : null;
  }
  async ownsLease(search: fly_checker_searches, token: string) {
    return Boolean(
      await this.db.fly_checker_searches.count({
        where: {
          id: search.id,
          tenant_id: search.tenant_id,
          lock_token: token,
          locked_until: { gt: new Date() },
          active: true,
        },
      })
    );
  }
  release(search: fly_checker_searches, token: string) {
    return this.db.fly_checker_searches.updateMany({
      where: { id: search.id, tenant_id: search.tenant_id, lock_token: token },
      data: { lock_token: null, locked_until: null },
    });
  }
  start(search: fly_checker_searches, provider: string, environment: string, combinations: number) {
    return this.db.fly_checker_checks.create({
      data: {
        tenant_id: search.tenant_id,
        search_id: search.id,
        provider,
        environment,
        combinations,
        status: 'running',
      },
    });
  }
  async finish(
    tenantId: string,
    id: string,
    status: string,
    offers: FlightOffer[],
    completed: number,
    error?: string
  ) {
    await this.prisma.transaction(async (db) => {
      if (offers.length)
        await db.fly_checker_prices.createMany({
          data: offers.map((o) => ({
            ...o,
            id: randomUUID(),
            tenant_id: tenantId,
            check_id: id,
            price: o.price,
            itinerary: o.itinerary as unknown as Prisma.InputJsonValue,
            fare_details: o.fare_details as Prisma.InputJsonValue,
          })),
          skipDuplicates: true,
        });
      await db.fly_checker_checks.updateMany({
        where: { id, tenant_id: tenantId, status: 'running' },
        data: {
          status,
          finished_at: new Date(),
          offer_count: offers.length,
          completed_combinations: completed,
          min_price: offers.length ? offers[0].price : null,
          error_message: error?.slice(0, 500) || null,
        },
      });
    });
  }
  async alertHistory(
    search: fly_checker_searches,
    environment: string,
    fingerprint: string,
    provider: string
  ) {
    const where = {
      tenant_id: search.tenant_id,
      search_id: search.id,
      environment,
      provider,
      status: { in: ['sent', 'uncertain'] },
    };
    const [last, same] = await Promise.all([
      this.db.fly_checker_alerts.findFirst({ where, orderBy: { created_at: 'desc' } }),
      this.db.fly_checker_alerts.aggregate({
        where: { ...where, fingerprint },
        _min: { price: true },
      }),
    ]);
    return {
      last: last ? { price: Number(last.price), sentAt: last.sent_at || last.created_at } : null,
      sameFareLow: same._min.price === null ? null : Number(same._min.price),
    };
  }
  async reserveAlert(data: Prisma.fly_checker_alertsUncheckedCreateInput, suppressed: boolean) {
    const key = {
      search_id: data.search_id,
      provider: data.provider,
      environment: data.environment,
      fingerprint: data.fingerprint,
      price: data.price,
    };
    const row = await this.db.fly_checker_alerts.upsert({
      where: { search_id_provider_environment_fingerprint_price: key },
      create: { ...data, status: suppressed ? 'suppressed' : 'pending' },
      update: {},
    });
    if (suppressed) return null;
    const result = await this.db.fly_checker_alerts.updateMany({
      where: {
        id: row.id,
        tenant_id: data.tenant_id,
        status: { in: ['pending', 'failed'] },
        attempts: { lt: 3 },
      },
      data: {
        status: 'sending',
        attempts: { increment: 1 },
        email: data.email,
        reasons: data.reasons,
        average_price: data.average_price,
        previous_low: data.previous_low,
        check_id: data.check_id,
      },
    });
    return result.count ? row.id : null;
  }
  markAlert(tenantId: string, id: string, status: string, error?: string) {
    return this.db.fly_checker_alerts.updateMany({
      where: { tenant_id: tenantId, id, status: 'sending' },
      data: {
        status,
        error_message: error || null,
        ...(status === 'sent' ? { sent_at: new Date() } : {}),
      },
    });
  }
}
