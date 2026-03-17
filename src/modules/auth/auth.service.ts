import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { UserService } from '../users/user.service';
import { JwtService } from '@nestjs/jwt';
import { CryptoService } from '../crypto/crypto.service';
import { PasswordResetService } from '../password-reset/password-reset.service';
import { MailerService } from '../mailer/mailer.service';
import type { Request } from 'express';
import { UAParser } from 'ua-parser-js';
import { addDays } from 'date-fns';
import { generateToken } from '../utils/generate-token';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import {
  HrLifecycleResponsibleRole,
  HrLifecycleTemplateType,
  Prisma,
  QueueAssignmentMode,
  SlaKpiType,
  TaskTypeChannel,
  TenantSubscriptionStatus,
  user_role_enum,
  user_status_enum,
  view_source_enum,
  view_visibility_enum,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { runWithTenant } from '../../common/tenant/tenant-context';
import {
  applyEmailTemplateBranding,
  getPortalEmailFrom,
  getPortalBrandIdentity,
  resolvePortalBaseUrlFromRequest,
  resolvePortalBrandFromRequest,
} from '../../common/branding/portal-brand.util';
import { SignUpDTO, SignUpResponseDTO } from './dtos/signup.dto';
import { SignUpPaymentCompleteDTO, SignUpPaymentPrepareDTO } from './dtos/signup-payment.dto';
import { ENTITY_REGISTRY } from '../admin-config/entity-registry';
import { isEntityAllowedByModuleAreas, normalizeModuleAreaKeys } from '../billing-plans/module-areas';
import { BillingStripeService } from '../billing-plans/billing-stripe.service';

type SignupExecutionOptions = {
  initialSubscriptionStatus?: TenantSubscriptionStatus;
  initialSubscriptionRenewsAt?: Date | null;
};

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private userService: UserService,
    private readonly cryptoService: CryptoService,
    private readonly passwordResetService: PasswordResetService,
    private readonly mailerService: MailerService,
    private readonly prisma: PrismaService,
    private readonly billingStripeService: BillingStripeService,
  ) {}

  private normalizeSlug(value: string): string {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-');
  }

  private uniqueStringArray(values: string[] | undefined): string[] {
    if (!Array.isArray(values)) return [];
    return Array.from(
      new Set(
        values
          .map((value) => String(value || '').trim())
          .filter((value) => value.length > 0),
      ),
    );
  }

  private normalizeCpfOrThrow(value: unknown): string | null {
    const raw = String(value ?? '').trim();
    if (!raw) return null;

    const digits = raw.replace(/\D/g, '');
    if (digits.length !== 11) {
      throw new BadRequestException('company_cpf must contain 11 digits.');
    }

    return digits;
  }

  private async resolveSignupPlanId(
    tx: Prisma.TransactionClient,
    dto: SignUpDTO,
    tenantName: string,
    tenantSlug: string,
  ): Promise<string | null> {
    const customModuleIds = this.uniqueStringArray(dto.custom_module_ids);

    if (customModuleIds.length > 0) {
      const modules = await tx.modules.findMany({
        where: {
          id: { in: customModuleIds },
          is_active: true,
        },
        select: {
          id: true,
          name_pt_br: true,
          monthly_price: true,
        },
      });

      if (modules.length === 0) {
        throw new BadRequestException('Nenhum modulo valido foi selecionado para o plano custom.');
      }
      if (modules.length !== customModuleIds.length) {
        throw new BadRequestException('Um ou mais modulos selecionados para o plano custom sao invalidos.');
      }

      const orderByInput = new Map(customModuleIds.map((id, index) => [id, index]));
      const orderedModules = modules.sort((a, b) => {
        const orderA = orderByInput.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const orderB = orderByInput.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      });

      const customTotal = orderedModules.reduce((total, item) => {
        return total + Number(item.monthly_price ?? 0);
      }, 0);

      const codeSuffix = randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
      const planCode = `CUSTOM_${codeSuffix}`;
      const planName = `Plano Custom - ${tenantName}`;

      const customPlan = await tx.plans.create({
        data: {
          code: planCode,
          name: planName.slice(0, 255),
          description: `Plano custom criado no cadastro publico (${tenantSlug}).`,
          monthly_price: customTotal,
          is_active: true,
          is_custom: true,
          is_public: false,
        },
        select: { id: true },
      });

      await tx.plan_modules.createMany({
        data: orderedModules.map((item, index) => ({
          plan_id: customPlan.id,
          module_id: item.id,
          sort_order: index,
          included: true,
        })),
      });

      return customPlan.id;
    }

    const selectedPlanId = String(dto.selected_plan_id || '').trim();
    if (selectedPlanId) {
      const selectedPlan = await tx.plans.findFirst({
        where: {
          id: selectedPlanId,
          is_active: true,
          is_public: true,
          is_custom: false,
        },
        select: { id: true },
      });

      if (!selectedPlan) {
        throw new BadRequestException('Plano selecionado e invalido ou indisponivel.');
      }

      return selectedPlan.id;
    }

    const fallback = await tx.plans.findFirst({
      where: {
        is_active: true,
        is_public: true,
        is_custom: false,
      },
      orderBy: [{ monthly_price: 'asc' }, { created_at: 'asc' }],
      select: { id: true },
    });

    return fallback?.id ?? null;
  }

  private async resolveEnabledAreaSetForPlan(
    tx: Prisma.TransactionClient,
    planId: string | null,
  ): Promise<Set<string>> {
    if (!planId) return new Set<string>();

    const planModules = await tx.plan_modules.findMany({
      where: {
        plan_id: planId,
        included: true,
      },
      include: {
        module: {
          select: {
            code: true,
            area_keys_json: true,
          },
        },
      },
    });

    const enabledAreas = new Set<string>();
    for (const row of planModules || []) {
      const areaKeys = normalizeModuleAreaKeys((row as any)?.module?.area_keys_json, (row as any)?.module?.code);
      areaKeys.forEach((area) => enabledAreas.add(String(area || '').toLowerCase()));
    }

    return enabledAreas;
  }

  private resolveAccessEntitiesForPlan(enabledAreaSet: Set<string>): string[] {
    // If no module areas are available yet, keep signup resilient with full catalog access.
    if (!enabledAreaSet || enabledAreaSet.size === 0) {
      return ENTITY_REGISTRY.map((item) => item.entity);
    }

    return ENTITY_REGISTRY.filter((item) => isEntityAllowedByModuleAreas(item.entity, enabledAreaSet)).map(
      (item) => item.entity,
    );
  }

  private async ensureSignupAdminAccess(
    tx: Prisma.TransactionClient,
    tenantId: string,
    adminUserId: string,
    enabledAreaSet: Set<string>,
  ): Promise<void> {
    const entities = this.resolveAccessEntitiesForPlan(enabledAreaSet);

    const roleCode = 'ADMIN';
    const roleName = 'Administrador';
    const roleDescription =
      'Acesso total ao tenant (CRUD completo nas entidades habilitadas pelo plano).';

    const adminRole = await (tx as any).access_roles.upsert({
      where: {
        tenant_id_code: {
          tenant_id: tenantId,
          code: roleCode,
        },
      },
      update: {
        name: roleName,
        description: roleDescription,
        is_system: true,
        is_active: true,
        deleted_at: null,
        updated_at: new Date(),
      },
      create: {
        tenant_id: tenantId,
        code: roleCode,
        name: roleName,
        description: roleDescription,
        is_system: true,
        is_active: true,
      },
    });

    await (tx as any).access_user_roles.upsert({
      where: {
        tenant_id_user_id_role_id: {
          tenant_id: tenantId,
          user_id: adminUserId,
          role_id: adminRole.id,
        },
      },
      update: {
        updated_at: new Date(),
      },
      create: {
        tenant_id: tenantId,
        user_id: adminUserId,
        role_id: adminRole.id,
      },
    });

    for (const entity of entities) {
      await (tx as any).access_role_permissions.upsert({
        where: {
          tenant_id_role_id_entity: {
            tenant_id: tenantId,
            role_id: adminRole.id,
            entity,
          },
        },
        update: {
          can_read: true,
          can_create: true,
          can_update: true,
          can_delete: true,
          updated_at: new Date(),
        },
        create: {
          tenant_id: tenantId,
          role_id: adminRole.id,
          entity,
          can_read: true,
          can_create: true,
          can_update: true,
          can_delete: true,
        },
      });
    }
  }

  private async ensureSignupServiceDefaults(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
    const calendar = await (tx as any).service_calendars.upsert({
      where: {
        tenant_id_name: {
          tenant_id: tenantId,
          name: 'Calendario Padrao',
        },
      },
      update: {
        timezone: 'America/Sao_Paulo',
        is_default: true,
        is_active: true,
        updated_at: new Date(),
      },
      create: {
        tenant_id: tenantId,
        name: 'Calendario Padrao',
        timezone: 'America/Sao_Paulo',
        is_default: true,
        is_active: true,
      },
      select: { id: true },
    });

    const policy = await (tx as any).sla_policies.upsert({
      where: {
        tenant_id_name: {
          tenant_id: tenantId,
          name: 'SLA Padrao',
        },
      },
      update: {
        description: 'SLA inicial do tenant',
        is_active: true,
        business_calendar_id: calendar.id,
        updated_at: new Date(),
      },
      create: {
        tenant_id: tenantId,
        name: 'SLA Padrao',
        description: 'SLA inicial do tenant',
        is_active: true,
        business_calendar_id: calendar.id,
      },
      select: { id: true },
    });

    const kpiDefaults = [
      {
        name: 'Primeira resposta',
        kpi_type: SlaKpiType.FIRST_RESPONSE,
        start_condition: 'INCIDENT_OPENED',
        stop_condition: 'FIRST_PUBLIC_REPLY',
        warning_after_minutes: 30,
        fail_after_minutes: 60,
        sort_order: 1,
      },
      {
        name: 'Resolucao',
        kpi_type: SlaKpiType.RESOLUTION,
        start_condition: 'INCIDENT_OPENED',
        stop_condition: 'INCIDENT_RESOLVED',
        warning_after_minutes: 240,
        fail_after_minutes: 480,
        sort_order: 2,
      },
    ];

    const existingKpis = await (tx as any).sla_kpis.findMany({
      where: {
        tenant_id: tenantId,
        sla_policy_id: policy.id,
      },
      select: {
        id: true,
        name: true,
        sort_order: true,
      },
    });

    const existingByName = new Map<string, { id: string; sort_order: number }>();
    const usedSortOrders = new Set<number>();
    for (const row of existingKpis || []) {
      const key = String(row?.name || '').trim().toLowerCase();
      if (key) existingByName.set(key, { id: row.id, sort_order: Number(row.sort_order || 0) });
      usedSortOrders.add(Number(row?.sort_order || 0));
    }

    const reserveSortOrder = (preferred: number): number => {
      let next = Number(preferred || 0);
      while (usedSortOrders.has(next)) next += 1;
      usedSortOrders.add(next);
      return next;
    };

    for (const kpi of kpiDefaults) {
      const key = String(kpi.name || '').trim().toLowerCase();
      const existing = existingByName.get(key);

      if (existing?.id) {
        await (tx as any).sla_kpis.update({
          where: { id: existing.id },
          data: {
            kpi_type: kpi.kpi_type,
            start_condition: kpi.start_condition,
            stop_condition: kpi.stop_condition,
            warning_after_minutes: kpi.warning_after_minutes,
            fail_after_minutes: kpi.fail_after_minutes,
            is_active: true,
            updated_at: new Date(),
          },
        });
        continue;
      }

      await (tx as any).sla_kpis.create({
        data: {
          tenant_id: tenantId,
          sla_policy_id: policy.id,
          name: kpi.name,
          kpi_type: kpi.kpi_type,
          start_condition: kpi.start_condition,
          stop_condition: kpi.stop_condition,
          warning_after_minutes: kpi.warning_after_minutes,
          fail_after_minutes: kpi.fail_after_minutes,
          sort_order: reserveSortOrder(kpi.sort_order),
          is_active: true,
        },
      });
    }

    await (tx as any).service_queues.upsert({
      where: {
        tenant_id_name: {
          tenant_id: tenantId,
          name: 'Geral',
        },
      },
      update: {
        is_active: true,
        assignment_mode: QueueAssignmentMode.MANUAL,
        default_sla_policy_id: policy.id,
        updated_at: new Date(),
      },
      create: {
        tenant_id: tenantId,
        name: 'Geral',
        is_active: true,
        assignment_mode: QueueAssignmentMode.MANUAL,
        default_sla_policy_id: policy.id,
      },
    });

    const subjects = [
      { name: 'TI', path: 'TI' },
      { name: 'Infra', path: 'TI > Infra' },
      { name: 'Sistemas', path: 'TI > Sistemas' },
      { name: 'Financeiro', path: 'Financeiro' },
    ];

    for (const subject of subjects) {
      const existingRootSubject = await (tx as any).service_subjects.findFirst({
        where: {
          tenant_id: tenantId,
          name: subject.name,
          parent_id: null,
        },
        select: { id: true },
      });

      if (existingRootSubject?.id) {
        await (tx as any).service_subjects.update({
          where: { id: existingRootSubject.id },
          data: {
            path: subject.path,
            is_active: true,
            default_sla_policy_id: policy.id,
            updated_at: new Date(),
          },
        });
        continue;
      }

      await (tx as any).service_subjects.create({
        data: {
          tenant_id: tenantId,
          name: subject.name,
          path: subject.path,
          is_active: true,
          default_sla_policy_id: policy.id,
        },
      });
    }

    const taskTypeDefaults = [
      {
        name: 'Ligacao',
        channel: TaskTypeChannel.CALL,
        default_duration_minutes: 20,
      },
      {
        name: 'Email',
        channel: TaskTypeChannel.EMAIL,
        default_duration_minutes: 15,
      },
      {
        name: 'Atendimento',
        channel: TaskTypeChannel.SERVICE,
        default_duration_minutes: 60,
      },
    ];

    for (const taskType of taskTypeDefaults) {
      await (tx as any).service_task_types.upsert({
        where: {
          tenant_id_name: {
            tenant_id: tenantId,
            name: taskType.name,
          },
        },
        update: {
          channel: taskType.channel,
          default_duration_minutes: taskType.default_duration_minutes,
          is_active: true,
          updated_at: new Date(),
        },
        create: {
          tenant_id: tenantId,
          name: taskType.name,
          channel: taskType.channel,
          default_duration_minutes: taskType.default_duration_minutes,
          is_active: true,
        },
      });
    }
  }

  private async ensureSignupHrDefaults(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
    const employmentStatusDefaults = [
      { code: 'ACTIVE', name: 'Ativo', color: '#1ab394', sort_order: 10, is_default: true },
      { code: 'ON_LEAVE', name: 'Afastado', color: '#f8ac59', sort_order: 20, is_default: false },
      { code: 'TERMINATED', name: 'Desligado', color: '#ed5565', sort_order: 30, is_default: false },
    ];

    for (const row of employmentStatusDefaults) {
      const found = await (tx as any).hr_employment_statuses.findFirst({
        where: {
          tenant_id: tenantId,
          code: row.code,
          deleted_at: null,
        },
        select: { id: true },
      });

      if (found?.id) continue;

      await (tx as any).hr_employment_statuses.create({
        data: {
          tenant_id: tenantId,
          code: row.code,
          name: row.name,
          color: row.color,
          sort_order: row.sort_order,
          is_default: row.is_default,
          is_active: true,
        },
      });
    }

    const leaveTypeDefaults = [
      {
        code: 'VACATION',
        name: 'Ferias',
        requires_approval: true,
        is_paid: true,
        counts_as_vacation: true,
        allow_hourly: false,
        sort_order: 10,
      },
      {
        code: 'MEDICAL',
        name: 'Atestado',
        requires_approval: true,
        is_paid: true,
        counts_as_vacation: false,
        allow_hourly: true,
        sort_order: 20,
      },
      {
        code: 'ABSENCE',
        name: 'Falta',
        requires_approval: true,
        is_paid: false,
        counts_as_vacation: false,
        allow_hourly: true,
        sort_order: 30,
      },
    ];

    for (const row of leaveTypeDefaults) {
      const found = await (tx as any).hr_leave_types.findFirst({
        where: {
          tenant_id: tenantId,
          code: row.code,
          deleted_at: null,
        },
        select: { id: true },
      });

      if (found?.id) continue;

      await (tx as any).hr_leave_types.create({
        data: {
          tenant_id: tenantId,
          code: row.code,
          name: row.name,
          requires_approval: row.requires_approval,
          is_paid: row.is_paid,
          counts_as_vacation: row.counts_as_vacation,
          allow_hourly: row.allow_hourly,
          sort_order: row.sort_order,
          is_active: true,
        },
      });
    }

    const defaultSchedule = await (tx as any).hr_work_schedules.findFirst({
      where: {
        tenant_id: tenantId,
        name: 'Comercial 44h',
        deleted_at: null,
      },
      select: { id: true },
    });

    if (!defaultSchedule?.id) {
      await (tx as any).hr_work_schedules.create({
        data: {
          tenant_id: tenantId,
          name: 'Comercial 44h',
          weekly_minutes: 2640,
          schedule_json: {
            timezone: 'America/Sao_Paulo',
            slots: [
              { day: 1, start: '08:00', end: '12:00' },
              { day: 1, start: '13:00', end: '17:48' },
              { day: 2, start: '08:00', end: '12:00' },
              { day: 2, start: '13:00', end: '17:48' },
              { day: 3, start: '08:00', end: '12:00' },
              { day: 3, start: '13:00', end: '17:48' },
              { day: 4, start: '08:00', end: '12:00' },
              { day: 4, start: '13:00', end: '17:48' },
              { day: 5, start: '08:00', end: '12:00' },
              { day: 5, start: '13:00', end: '17:48' },
            ],
          } as Prisma.InputJsonValue,
          is_default: true,
          is_active: true,
        },
      });
    }

    const defaultDepartment = await (tx as any).hr_departments.findFirst({
      where: {
        tenant_id: tenantId,
        name: 'Geral',
        deleted_at: null,
      },
      select: { id: true },
    });

    if (!defaultDepartment?.id) {
      await (tx as any).hr_departments.create({
        data: {
          tenant_id: tenantId,
          name: 'Geral',
          code: 'GERAL',
          description: 'Departamento inicial do tenant',
          is_active: true,
        },
      });
    }

    const defaultPosition = await (tx as any).hr_positions.findFirst({
      where: {
        tenant_id: tenantId,
        name: 'Analista',
        deleted_at: null,
      },
      select: { id: true },
    });

    if (!defaultPosition?.id) {
      await (tx as any).hr_positions.create({
        data: {
          tenant_id: tenantId,
          name: 'Analista',
          code: 'ANALISTA',
          level: 1,
          is_leadership: false,
          is_active: true,
        },
      });
    }

    let onboardingTemplate = await (tx as any).hr_lifecycle_templates.findFirst({
      where: {
        tenant_id: tenantId,
        name: 'Onboarding Basico',
        type: HrLifecycleTemplateType.ONBOARDING,
        deleted_at: null,
      },
      select: { id: true },
    });

    if (!onboardingTemplate?.id) {
      onboardingTemplate = await (tx as any).hr_lifecycle_templates.create({
        data: {
          tenant_id: tenantId,
          name: 'Onboarding Basico',
          type: HrLifecycleTemplateType.ONBOARDING,
          description: 'Template inicial para admissao de novos colaboradores.',
          is_active: true,
        },
        select: { id: true },
      });
    }

    const stageDefinitions = [
      { name: 'A Fazer', sort_order: 10, color: '#f8ac59' },
      { name: 'Em Andamento', sort_order: 20, color: '#1c84c6' },
      { name: 'Concluido', sort_order: 30, color: '#1ab394' },
    ];

    const stageIdByName = new Map<string, string>();

    for (const stage of stageDefinitions) {
      let found = await (tx as any).hr_lifecycle_stages.findFirst({
        where: {
          tenant_id: tenantId,
          template_id: onboardingTemplate.id,
          name: stage.name,
          deleted_at: null,
        },
        select: { id: true },
      });

      if (!found?.id) {
        found = await (tx as any).hr_lifecycle_stages.create({
          data: {
            tenant_id: tenantId,
            template_id: onboardingTemplate.id,
            name: stage.name,
            sort_order: stage.sort_order,
            color: stage.color,
            is_active: true,
          },
          select: { id: true },
        });
      }

      stageIdByName.set(stage.name, found.id);
    }

    const backlogStageId = stageIdByName.get('A Fazer') || null;
    const onboardingTasks = [
      {
        title: 'Enviar documentos admissionais',
        responsible_role: HrLifecycleResponsibleRole.HR,
        due_days_after_start: 0,
        sort_order: 10,
      },
      {
        title: 'Provisionar acessos de sistemas',
        responsible_role: HrLifecycleResponsibleRole.IT,
        due_days_after_start: 1,
        sort_order: 20,
      },
      {
        title: 'Alinhar objetivos com gestor',
        responsible_role: HrLifecycleResponsibleRole.MANAGER,
        due_days_after_start: 2,
        sort_order: 30,
      },
    ];

    for (const task of onboardingTasks) {
      const found = await (tx as any).hr_lifecycle_tasks.findFirst({
        where: {
          tenant_id: tenantId,
          template_id: onboardingTemplate.id,
          title: task.title,
          deleted_at: null,
        },
        select: { id: true },
      });

      if (found?.id) continue;

      await (tx as any).hr_lifecycle_tasks.create({
        data: {
          tenant_id: tenantId,
          template_id: onboardingTemplate.id,
          stage_id: backlogStageId,
          title: task.title,
          responsible_role: task.responsible_role,
          due_days_after_start: task.due_days_after_start,
          sort_order: task.sort_order,
          is_active: true,
          is_mandatory: true,
        },
      });
    }
  }

  private async resolveSignupCheckoutSnapshot(
    tx: Prisma.TransactionClient,
    dto: SignUpDTO,
  ): Promise<{
    selectedPlanId: string | null;
    customModuleIds: string[];
    planName: string;
    monthlyAmount: number;
  }> {
    const customModuleIds = this.uniqueStringArray(dto.custom_module_ids);

    if (customModuleIds.length > 0) {
      const modules = await tx.modules.findMany({
        where: {
          id: { in: customModuleIds },
          is_active: true,
        },
        select: {
          id: true,
          monthly_price: true,
        },
      });

      if (modules.length === 0) {
        throw new BadRequestException('Nenhum modulo valido foi selecionado para o plano custom.');
      }
      if (modules.length !== customModuleIds.length) {
        throw new BadRequestException('Um ou mais modulos selecionados para o plano custom sao invalidos.');
      }

      const orderByInput = new Map(customModuleIds.map((id, index) => [id, index]));
      const orderedModules = modules.sort((a, b) => {
        const orderA = orderByInput.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const orderB = orderByInput.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      });

      const monthlyAmount = orderedModules.reduce((acc, row) => acc + Number(row.monthly_price || 0), 0);
      return {
        selectedPlanId: null,
        customModuleIds,
        planName: 'Plano custom',
        monthlyAmount,
      };
    }

    const selectedPlanId = String(dto.selected_plan_id || '').trim();
    if (selectedPlanId) {
      const selectedPlan = await tx.plans.findFirst({
        where: {
          id: selectedPlanId,
          is_active: true,
          is_public: true,
          is_custom: false,
        },
        select: {
          id: true,
          name: true,
          monthly_price: true,
        },
      });

      if (!selectedPlan) {
        throw new BadRequestException('Plano selecionado e invalido ou indisponivel.');
      }

      return {
        selectedPlanId: selectedPlan.id,
        customModuleIds: [],
        planName: selectedPlan.name,
        monthlyAmount: Number(selectedPlan.monthly_price || 0),
      };
    }

    const fallback = await tx.plans.findFirst({
      where: {
        is_active: true,
        is_public: true,
        is_custom: false,
      },
      orderBy: [{ monthly_price: 'asc' }, { created_at: 'asc' }],
      select: {
        id: true,
        name: true,
        monthly_price: true,
      },
    });

    if (!fallback?.id) {
      throw new BadRequestException('Nenhum plano publico ativo disponivel para o cadastro.');
    }

    return {
      selectedPlanId: fallback.id,
      customModuleIds: [],
      planName: fallback.name,
      monthlyAmount: Number(fallback.monthly_price || 0),
    };
  }

  async prepareSignupPayment(dto: SignUpPaymentPrepareDTO) {
    const tenantName = String(dto.tenant_name ?? '').trim();
    const tenantSlug = this.normalizeSlug(dto.tenant_slug);
    const adminEmail = String(dto.admin_email ?? '').trim().toLowerCase();
    const couponCode = String(dto.coupon_code || '').trim();

    if (!tenantName || !tenantSlug) {
      throw new BadRequestException('tenant_name and tenant_slug are required.');
    }
    if (!adminEmail) {
      throw new BadRequestException('admin_email is required.');
    }

    const snapshot = await this.prisma.raw.$transaction((tx) => this.resolveSignupCheckoutSnapshot(tx, dto));

    const session = await this.billingStripeService.createPublicSignupPaymentSession({
      signupPayload: {
        ...dto,
        tenant_name: tenantName,
        tenant_slug: tenantSlug,
        admin_email: adminEmail,
      } as any,
      selectedPlanId: snapshot.selectedPlanId,
      customModuleIds: snapshot.customModuleIds,
      planName: snapshot.planName,
      monthlyAmount: snapshot.monthlyAmount,
      adminEmail,
      adminFullName: dto.admin_full_name,
      companyName: dto.company_name,
      couponCode,
    });

    return session;
  }

  async completeSignupPayment(dto: SignUpPaymentCompleteDTO, req: Request): Promise<SignUpResponseDTO> {
    const session = await this.billingStripeService.getPublicSignupPaymentSession(dto.session_id);
    const portalBrand = resolvePortalBrandFromRequest(req);
    const hostRaw = (req?.headers?.['x-forwarded-host'] || req?.headers?.host || '') as string | string[];
    const host = Array.isArray(hostRaw) ? String(hostRaw[0] || '') : String(hostRaw || '');
    const normalizedHost = host.split(',')[0]?.trim().toLowerCase() || '';
    if (session.completed_at) {
      throw new BadRequestException('Esta sessao de pagamento ja foi concluida.');
    }

    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
      throw new BadRequestException('Sessao de pagamento expirada. Inicie novamente o cadastro.');
    }

    const signupPayload = { ...(session.signup_payload_json as any) } as SignUpDTO;
    if (session.selected_plan_id) {
      signupPayload.selected_plan_id = String(session.selected_plan_id);
      signupPayload.custom_module_ids = undefined;
    } else {
      const customIds = Array.isArray(session.custom_module_ids_json)
        ? (session.custom_module_ids_json as any[]).map((id) => String(id || '').trim()).filter(Boolean)
        : [];
      signupPayload.custom_module_ids = customIds;
      signupPayload.selected_plan_id = undefined;
    }

    const setupStatus = String(session.setup_status || '')
      .trim()
      .toLowerCase();
    const isNeverPayBypass = setupStatus === 'bypass_coupon';

    if (isNeverPayBypass) {
      const signupResult = await this.signup(signupPayload, req, {
        initialSubscriptionStatus: TenantSubscriptionStatus.ACTIVE,
        initialSubscriptionRenewsAt: null,
      });

      try {
        await this.billingStripeService.markPublicSignupPaymentSessionCompleted(String(session.id), {
          tenant_id: signupResult.tenant_id,
          setup_status: 'bypass_coupon',
          payment_method_id: null,
          stripe_subscription_id: null,
        });
      } catch (error) {
        console.error('Failed to finalize NEVERPAY signup payment session:', error);
      }

      return signupResult;
    }

    const validated = await this.billingStripeService.validateSetupIntentForSession(session, {
      paymentMethodId: dto.payment_method_id,
      setupIntentId: dto.setup_intent_id,
    });

    const trialDays = Math.max(1, Math.min(30, Number(session.trial_days || this.billingStripeService.getTrialDays())));
    const signupSubscription = await this.billingStripeService.createSignupStripeSubscription({
      customerId: String(session.stripe_customer_id || '').trim(),
      paymentMethodId: validated.paymentMethodId,
      planId: session.selected_plan_id ? String(session.selected_plan_id) : null,
      planName: String(session.plan_name || 'Plano').trim(),
      monthlyAmount: Number(session.monthly_amount || 0),
      currency: String(session.currency || 'BRL'),
      trialDays,
      metadata: {
        signup_session_id: String(session.id),
        portal_brand: portalBrand,
        ...(normalizedHost ? { portal_host: normalizedHost.slice(0, 120) } : {}),
      },
    });

    const trialEndDate = signupSubscription.subscription.trial_end
      ? new Date(Number(signupSubscription.subscription.trial_end) * 1000)
      : null;

    let signupResult: SignUpResponseDTO;
    try {
      signupResult = await this.signup(signupPayload, req, {
        initialSubscriptionStatus: TenantSubscriptionStatus.TRIAL,
        initialSubscriptionRenewsAt: trialEndDate,
      });
    } catch (error) {
      await this.billingStripeService.cancelStripeSubscriptionSafe(signupSubscription.subscription.id);
      throw error;
    }

    try {
      const tenantSubscription = await this.prisma.raw.tenant_subscriptions.findFirst({
        where: {
          tenant_id: signupResult.tenant_id,
          status: { in: [TenantSubscriptionStatus.TRIAL, TenantSubscriptionStatus.ACTIVE] },
        },
        orderBy: [{ starts_at: 'desc' }, { created_at: 'desc' }],
      });

      await this.billingStripeService.attachStripeDataToTenant({
        tenantId: signupResult.tenant_id,
        tenantSubscriptionId: tenantSubscription?.id || null,
        planId: tenantSubscription?.plan_id || null,
        stripeCustomerId: String(session.stripe_customer_id || '').trim(),
        stripeSubscription: signupSubscription.subscription,
        stripePlanPriceId: signupSubscription.stripePlanPriceId,
        companyName: String(session.company_name || '').trim() || null,
        adminEmail: String(session.admin_email || '').trim() || null,
      });

      await this.billingStripeService.markPublicSignupPaymentSessionCompleted(String(session.id), {
        tenant_id: signupResult.tenant_id,
        stripe_subscription_id: signupSubscription.subscription.id,
        payment_method_id: validated.paymentMethodId,
        setup_status: 'succeeded',
      });
    } catch (error) {
      // Non-blocking after successful signup; user should not lose access due to sync issue.
      console.error('Failed to persist Stripe binding after signup:', error);
    }

    if (portalBrand === 'convert') {
      try {
        await this.billingStripeService.sendConvertTrialStartedEmail({
          to: String(session.admin_email || signupPayload.admin_email || '').trim().toLowerCase(),
          name: String(session.admin_full_name || signupPayload.admin_full_name || '').trim() || null,
          trialDays,
          trialEndAt: trialEndDate,
          monthlyAmount: Number(session.monthly_amount || 0),
          currency: String(session.currency || 'BRL'),
        });
      } catch (error) {
        console.error('Failed to send Convert trial welcome email:', error);
      }
    }

    return signupResult;
  }

  async signup(dto: SignUpDTO, req: Request, options?: SignupExecutionOptions): Promise<SignUpResponseDTO> {
    const tenantId = randomUUID();
    const tenantName = String(dto.tenant_name ?? '').trim();
    const tenantSlug = this.normalizeSlug(dto.tenant_slug);
    const adminEmail = String(dto.admin_email ?? '').trim().toLowerCase();
    const normalizedCompanyCpf = this.normalizeCpfOrThrow(dto.company_cpf);

    if (!tenantName || !tenantSlug) {
      throw new BadRequestException('tenant_name and tenant_slug are required.');
    }
    if (!adminEmail) {
      throw new BadRequestException('admin_email is required.');
    }

    const adminPasswordHash = await this.cryptoService.hash(dto.admin_password);

    try {
      const created = await runWithTenant(tenantId, () =>
        this.prisma.raw.$transaction(async (tx) => {
          const tenant = await tx.tenants.create({
            data: {
              id: tenantId,
              name: tenantName,
              slug: tenantSlug,
              status: 1,
            },
          });

          const company = await tx.companies.create({
            data: {
              company_name: dto.company_name,
              phone: dto.company_phone ?? null,
              company_number: dto.company_number ?? null,
              sector: dto.company_sector ?? null,
              category: dto.company_category ?? null,
              address_street: dto.company_address_street ?? null,
              address_number: dto.company_address_number ?? null,
              address_city: dto.company_address_city ?? null,
              address_country: dto.company_address_country ?? null,
              address_state: dto.company_address_state ?? null,
              address_postalcode: dto.company_address_postalcode ?? null,
              language: dto.company_language ?? null,
            } as any,
          });

          if (normalizedCompanyCpf) {
            await tx.$executeRawUnsafe(
              'UPDATE companies SET cpf = $1 WHERE id = CAST($2 AS uuid)',
              normalizedCompanyCpf,
              company.id,
            );
          }

          const user = await tx.users.create({
            data: {
              tenant_id: tenant.id,
              full_name: dto.admin_full_name,
              email: adminEmail,
              password: adminPasswordHash,
              role: user_role_enum.ADMIN,
              status: user_status_enum.ACTIVE,
              company_id: company.id,
              phonenumber: dto.admin_phone ?? null,
              first_access: false,
              acept_terms: dto.acept_terms ?? true,
            } as any,
          });

          await tx.companies.update({
            where: { id: company.id },
            data: { user_id: user.id } as any,
          });

          await tx.tenants.update({
            where: { id: tenant.id },
            data: { company_id: company.id },
          });

          const systemSavedViews: Prisma.saved_viewsCreateManyInput[] = [
            {
              tenant_id: tenant.id,
              owner_user_id: user.id,
              entity_name: 'invoices',
              name: 'Todos os invoices',
              visibility: view_visibility_enum.PUBLIC,
              definition_json: {
                entityName: 'invoices',
                columns: [],
                filters: [],
                sort: [],
              } as Prisma.InputJsonValue,
              is_system: true,
              is_active: true,
              source: view_source_enum.MANUAL,
            },
            {
              tenant_id: tenant.id,
              owner_user_id: user.id,
              entity_name: 'products',
              name: 'Todos os produtos',
              visibility: view_visibility_enum.PUBLIC,
              definition_json: {
                entityName: 'products',
                columns: [],
                filters: [],
                sort: [],
              } as Prisma.InputJsonValue,
              is_system: true,
              is_active: true,
              source: view_source_enum.MANUAL,
            },
            {
              tenant_id: tenant.id,
              owner_user_id: user.id,
              entity_name: 'companies',
              name: 'Todos os clientes',
              visibility: view_visibility_enum.PUBLIC,
              definition_json: {
                entityName: 'companies',
                columns: [],
                filters: [],
                sort: [],
              } as Prisma.InputJsonValue,
              is_system: true,
              is_active: true,
              source: view_source_enum.MANUAL,
            },
            {
              tenant_id: tenant.id,
              owner_user_id: user.id,
              entity_name: 'leads',
              name: 'Todos os leads',
              visibility: view_visibility_enum.PUBLIC,
              definition_json: {
                entityName: 'leads',
                columns: [],
                filters: [],
                sort: [],
              } as Prisma.InputJsonValue,
              is_system: true,
              is_active: true,
              source: view_source_enum.MANUAL,
            },
            {
              tenant_id: tenant.id,
              owner_user_id: user.id,
              entity_name: 'notifications',
              name: 'Todas as notificacoes',
              visibility: view_visibility_enum.PUBLIC,
              definition_json: {
                entityName: 'notifications',
                columns: [],
                filters: [],
                sort: [],
              } as Prisma.InputJsonValue,
              is_system: true,
              is_active: true,
              source: view_source_enum.MANUAL,
            },
            {
              tenant_id: tenant.id,
              owner_user_id: user.id,
              entity_name: 'processes',
              name: 'Todos os processos',
              visibility: view_visibility_enum.PUBLIC,
              definition_json: {
                entityName: 'processes',
                columns: [],
                filters: [],
                sort: [],
              } as Prisma.InputJsonValue,
              is_system: true,
              is_active: true,
              source: view_source_enum.MANUAL,
            },
          ];

          await tx.saved_views.createMany({
            data: systemSavedViews,
          });

          const resolvedPlanId = await this.resolveSignupPlanId(tx, dto, tenantName, tenantSlug);
          if (resolvedPlanId) {
            await tx.tenant_subscriptions.create({
              data: {
                tenant_id: tenant.id,
                plan_id: resolvedPlanId,
                status: options?.initialSubscriptionStatus ?? TenantSubscriptionStatus.ACTIVE,
                starts_at: new Date(),
                ...(options?.initialSubscriptionRenewsAt !== undefined
                  ? { renews_at: options.initialSubscriptionRenewsAt }
                  : {}),
              },
            });
          }

          const enabledAreaSet = await this.resolveEnabledAreaSetForPlan(tx, resolvedPlanId);
          await this.ensureSignupAdminAccess(tx, tenant.id, user.id, enabledAreaSet);

          if (enabledAreaSet.has('service')) {
            await this.ensureSignupServiceDefaults(tx, tenant.id);
          }

          if (enabledAreaSet.has('hr')) {
            await this.ensureSignupHrDefaults(tx, tenant.id);
          }

          return { tenant, company, user };
        })
      );

      const payload = {
        sub: created.user.id,
        email: created.user.email,
        role: created.user.role,
        tenant_id: created.tenant.id,
        company_id: created.company.id,
      };

      const access_token = this.jwtService.sign(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn: '1h',
      });

      const refresh_token = this.jwtService.sign(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d',
      });

      const refresh_token_hash = await this.cryptoService.hash(refresh_token);
      await this.createOrUpdateSession(created.tenant.id, created.user.id, refresh_token_hash, req);

      return {
        tenant_id: created.tenant.id,
        company_id: created.company.id,
        user_id: created.user.id,
        access_token,
        refresh_token,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('Duplicate value (email, tenant slug or unique field).');
        }
      }
      throw error;
    }
  }

  private isAdminRole(role: unknown): boolean {
    // Keep it simple and safe (avoid enum import changes in this file).
    return String(role ?? '').toUpperCase() === 'ADMIN';
  }

  private assertTenantAndCompany(user: any): void {
    const tenantId = user?.tenant_id as string | undefined;
    if (!tenantId || String(tenantId).trim().length === 0) {
      throw new BadRequestException('User is missing tenant_id. Please contact support.');
    }

    // For non-admin users, company_id must be present
    const isAdmin = this.isAdminRole(user?.role);
    if (!isAdmin) {
      const companyId = user?.company_id as string | undefined;
      if (!companyId || String(companyId).trim().length === 0) {
        throw new BadRequestException('User is missing company_id. Please contact support.');
      }
    }
  }

  async login(email: string, password: string, req: Request) {
    const user = await this.userService.validateUser(email, password);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    // ✅ Ensure tenant_id / company_id rules before issuing tokens
    this.assertTenantAndCompany(user);

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenant_id: user.tenant_id,
      // ✅ include company_id so req.user has it everywhere
      company_id: user.company_id ?? null,
    };

    const access_token = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: '1h',
    });

    const refresh_token = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
    });

    const refresh_token_hash = await this.cryptoService.hash(refresh_token);

    await this.createOrUpdateSession(user.tenant_id, user.id, refresh_token_hash, req);

    return { access_token, refresh_token };
  }

  async refreshToken(refresh_token: string, req: Request) {
    try {
      const decoded = await this.jwtService.verify(refresh_token, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      const sub = decoded?.sub as string | undefined;
      if (!sub) throw new UnauthorizedException('Invalid refresh token');

      const tenantId = decoded?.tenant_id as string | undefined;
      if (!tenantId) throw new UnauthorizedException('Invalid refresh token');

      // include sessions because we need to validate the stored refresh token hash
      const user = await this.userService.findById(tenantId, sub, true);

      const session = user.sessions;
      if (!session) throw new UnauthorizedException('Session not found');

      const isValid = await this.cryptoService.verify(refresh_token, session.refresh_token);
      if (!isValid) throw new UnauthorizedException('Invalid refresh token');

      // ✅ enforce multi-tenant/company rules also on refresh
      this.assertTenantAndCompany(user);

      const payload_for_new_tokens = {
        sub: user.id,
        email: user.email,
        role: user.role,
        tenant_id: user.tenant_id,
        // ✅ keep company_id in refreshed tokens too
        company_id: user.company_id ?? null,
      };

      const new_access_token = this.jwtService.sign(payload_for_new_tokens, {
        secret: process.env.JWT_SECRET,
        expiresIn: '1h',
      });

      const new_refresh_token = this.jwtService.sign(payload_for_new_tokens, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d',
      });

      const refresh_token_hash = await this.cryptoService.hash(new_refresh_token);

      await this.createOrUpdateSession(user.tenant_id, user.id, refresh_token_hash, req);

      return { access_token: new_access_token, refresh_token: new_refresh_token };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async createOrUpdateSession(
    tenant_id: string,
    user_id: string,
    refresh_token: string,
    req: Request
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress;

    const parser = new UAParser(req.headers['user-agent'] || '');
    const os = parser.getOS()?.name || 'Unknown OS';
    const browser = parser.getBrowser()?.name || 'Unknown Browser';

    const device_info = `${os} - ${browser}`;

    await this.userService.createOrUpdateSession({
      tenant_id,
      user_id,
      refresh_token,
      ip_address: ip || 'Unknown IP',
      device_info,
      expires_at: addDays(new Date(), 7),
    });
  }

  async logout(refresh_token: string) {
    // We store refresh_token as a hash in DB. Decode token to get tenant_id and hash the token for lookup.
    const decoded = await this.jwtService.verify(refresh_token, {
      secret: process.env.JWT_REFRESH_SECRET,
    });

    const tenantId = decoded?.tenant_id as string | undefined;
    if (!tenantId) throw new UnauthorizedException('Invalid refresh token');

    const refresh_token_hash = await this.cryptoService.hash(refresh_token);
    await this.userService.logoutAll(tenantId, refresh_token_hash);

    return { message: 'All sessions terminated' };
  }

  async forgotPassword(email: string, req?: Request) {
    try {
      const user = await this.userService.findByEmail(email);
      const portalBrand = resolvePortalBrandFromRequest(req);
      const brandIdentity = getPortalBrandIdentity(portalBrand);

      // Always return the same message (avoid user enumeration)
      if (!user) {
        return {
          message:
            'Se o email existir em nossa base, você receberá as instruções para redefinir sua senha.',
        };
      }

      const resetToken = generateToken(32);
      const tokenHash = await this.cryptoService.hash(resetToken);

      await this.passwordResetService.generateResetToken({
        tenant_id: user.tenant_id,
        token: tokenHash,
        user_id: user.id,
      } as any);

      const forgotTemplateFileName =
        portalBrand === 'convert' ? 'forgot-password-convert.html' : 'forgot-password.html';
      const template = readFileSync(
        join(__dirname, '..', 'mailer', 'templates', forgotTemplateFileName),
        'utf8'
      );

      const frontendBaseUrl = resolvePortalBaseUrlFromRequest(req);
      const resetLink = `${frontendBaseUrl}?token=${resetToken}&userId=${user.id}`;
      const currentYear = new Date().getFullYear();

      const html = applyEmailTemplateBranding(template, portalBrand)
        .replace(/{{name}}/g, user.full_name)
        .replace(/{{resetLink}}/g, resetLink)
        .replace(/{{year}}/g, currentYear.toString());

      await this.mailerService.sendWelcomeEmail(
        user.email,
        `Redefinicao de Senha - ${brandIdentity.subjectBrandName}`,
        html,
        getPortalEmailFrom(portalBrand),
      );

      return {
        message:
          'Se o email existir em nossa base, você receberá as instruções para redefinir sua senha.',
      };
    } catch {
      return {
        message:
          'Se o email existir em nossa base, você receberá as instruções para redefinir sua senha.',
      };
    }
  }

  async resetPassword(
    user_id: string,
    token: string,
    new_password: string,
    confirm_password: string,
    req?: Request
  ) {
    if (new_password !== confirm_password) {
      throw new BadRequestException('As senhas não coincidem');
    }

    const reset_record = await this.passwordResetService.getToken(user_id);
    if (!reset_record) {
      throw new BadRequestException('Token de reset inválido ou expirado');
    }

    const tenantId = (reset_record as any)?.tenant_id as string | undefined;
    if (!tenantId) throw new BadRequestException('Token de reset inválido ou expirado');

    const user = await this.userService.findById(tenantId, user_id, true);

    const isValidToken = await this.cryptoService.verify(token, reset_record.token);
    if (!isValidToken) {
      throw new BadRequestException('Token de reset inválido');
    }

    if (reset_record.expires_at < new Date()) {
      await this.passwordResetService.deleteToken(user_id);
      throw new BadRequestException('Token de reset expirado. Solicite um novo reset de senha.');
    }

    if (user.first_access) {
      await this.userService.activateFirstAccess(tenantId, user_id, new_password);
    } else {
      await this.userService.updatePassword(tenantId, user_id, new_password);
    }

    await this.passwordResetService.deleteToken(user_id);

    if (user.sessions) {
      // sessions.refresh_token is already stored as a hash
      await this.userService.logoutAll(tenantId, user.sessions.refresh_token);
    }

    try {
      const template = readFileSync(
        join(__dirname, '..', 'mailer', 'templates', 'reset-password.html'),
        'utf8'
      );
      const portalBrand = resolvePortalBrandFromRequest(req);
      const brandIdentity = getPortalBrandIdentity(portalBrand);
      const currentYear = new Date().getFullYear();
      const loginLink = resolvePortalBaseUrlFromRequest(req);

      const html = applyEmailTemplateBranding(template, portalBrand)
        .replace(/{{name}}/g, user.full_name)
        .replace(/{{resetLink}}/g, loginLink)
        .replace(/{{year}}/g, currentYear.toString());

      await this.mailerService.sendWelcomeEmail(
        user.email,
        `Senha redefinida com sucesso - ${brandIdentity.subjectBrandName}`,
        html,
        getPortalEmailFrom(portalBrand),
      );
    } catch (error) {
      console.error('Failed to send reset success email:', error);
    }

    return {
      message: 'Senha redefinida com sucesso. Faça login com sua nova senha.',
    };
  }
}
