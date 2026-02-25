import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantSubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertTenantModuleOverrideDto } from './dto/upsert-tenant-module-override.dto';

const ACTIVE_SUBSCRIPTION_STATUSES: TenantSubscriptionStatus[] = [
  TenantSubscriptionStatus.ACTIVE,
  TenantSubscriptionStatus.TRIAL,
];

type ResolvedTenantModule = {
  module_id: string;
  code: string;
  name_pt_br: string;
  is_active: boolean;
  plan_included: boolean;
  override_enabled: boolean | null;
  override_reason: string | null;
  final_enabled: boolean;
  source: 'PLANO' | 'OVERRIDE';
};

@Injectable()
export class TenantModulesResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async getEnabledModules(tenantId: string): Promise<string[]> {
    const resolved = await this.getResolvedModules(tenantId);
    return resolved.filter((row) => row.final_enabled).map((row) => row.code);
  }

  async getResolvedModules(tenantId: string): Promise<ResolvedTenantModule[]> {
    await this.assertTenantExists(tenantId);

    const [catalogModules, activeSubscription, overrides] = await Promise.all([
      this.prisma.modules.findMany({
        orderBy: [{ name_pt_br: 'asc' }, { code: 'asc' }],
      }),
      this.getActiveSubscription(tenantId),
      this.prisma.tenant_module_overrides.findMany({
        where: { tenant_id: tenantId },
        include: { module: true },
      }),
    ]);

    const planModulesMap = new Map<string, boolean>();
    for (const row of activeSubscription?.plan?.plan_modules ?? []) {
      planModulesMap.set(row.module_id, row.included);
    }

    const overrideMap = new Map<string, { enabled: boolean; reason: string | null }>();
    for (const row of overrides) {
      overrideMap.set(row.module_id, {
        enabled: row.enabled,
        reason: row.reason ?? null,
      });
    }

    return catalogModules.map((catalogModule) => {
      const planIncluded = planModulesMap.get(catalogModule.id) === true;
      const override = overrideMap.get(catalogModule.id);
      const source: 'PLANO' | 'OVERRIDE' = override ? 'OVERRIDE' : 'PLANO';
      const effectiveByPlan = planIncluded;
      const effectiveWithOverride = override ? override.enabled : effectiveByPlan;
      const finalEnabled = catalogModule.is_active ? effectiveWithOverride : false;

      return {
        module_id: catalogModule.id,
        code: catalogModule.code,
        name_pt_br: catalogModule.name_pt_br,
        is_active: catalogModule.is_active,
        plan_included: planIncluded,
        override_enabled: override ? override.enabled : null,
        override_reason: override?.reason ?? null,
        final_enabled: finalEnabled,
        source,
      };
    });
  }

  async getOverridesByTenant(tenantId: string) {
    await this.assertTenantExists(tenantId);
    const [subscription, resolvedModules] = await Promise.all([
      this.getActiveSubscription(tenantId),
      this.getResolvedModules(tenantId),
    ]);

    return {
      subscription,
      modules: resolvedModules,
    };
  }

  async upsertOverride(tenantId: string, moduleId: string, dto: UpsertTenantModuleOverrideDto) {
    await this.assertTenantExists(tenantId);
    await this.assertModuleExists(moduleId);

    const existing = await this.prisma.tenant_module_overrides.findUnique({
      where: {
        tenant_id_module_id: {
          tenant_id: tenantId,
          module_id: moduleId,
        },
      },
    });

    if (existing) {
      await this.prisma.tenant_module_overrides.update({
        where: { id: existing.id },
        data: {
          enabled: dto.enabled,
          reason: this.normalizeNullable(dto.reason),
          updated_at: new Date(),
        },
      });
    } else {
      await this.prisma.tenant_module_overrides.create({
        data: {
          tenant_id: tenantId,
          module_id: moduleId,
          enabled: dto.enabled,
          reason: this.normalizeNullable(dto.reason),
        },
      });
    }

    return this.getOverridesByTenant(tenantId);
  }

  private async getActiveSubscription(tenantId: string) {
    return this.prisma.tenant_subscriptions.findFirst({
      where: {
        tenant_id: tenantId,
        status: { in: ACTIVE_SUBSCRIPTION_STATUSES },
      },
      include: {
        plan: {
          include: {
            plan_modules: true,
          },
        },
      },
      orderBy: [{ starts_at: 'desc' }, { updated_at: 'desc' }],
    });
  }

  private normalizeNullable(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
  }

  private async assertTenantExists(tenantId: string) {
    const tenant = await this.prisma.tenants.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant nao encontrado.');
  }

  private async assertModuleExists(moduleId: string) {
    const row = await this.prisma.modules.findUnique({ where: { id: moduleId } });
    if (!row) throw new NotFoundException('Modulo nao encontrado.');
  }
}
