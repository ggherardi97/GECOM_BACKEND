import { PrismaClient, QueueAssignmentMode, SlaKpiType } from '@prisma/client';

const prisma = new PrismaClient();

async function seedBillingCatalog() {
  const moduleCatalog = [
    { code: 'SERVICES', name_pt_br: 'Servicos', description_pt_br: 'Modulo de servicos', monthly_price: 450 },
    { code: 'SALES', name_pt_br: 'Vendas', description_pt_br: 'Modulo comercial e CRM', monthly_price: 500 },
    {
      code: 'FINANCE_OPERATION',
      name_pt_br: 'Financeiro e Operacional',
      description_pt_br: 'Faturamento e operacoes financeiras',
      monthly_price: 600,
    },
    { code: 'RH', name_pt_br: 'Recursos Humanos', description_pt_br: 'Gestao de pessoas e equipe', monthly_price: 350 },
    {
      code: 'PROJECT_OPERATION',
      name_pt_br: 'Projetos e Operacao',
      description_pt_br: 'Planejamento de projetos e execucao operacional',
      monthly_price: 400,
    },
    { code: 'MARKETING', name_pt_br: 'Marketing', description_pt_br: 'Campanhas e captacao de leads', monthly_price: 300 },
  ];

  for (const row of moduleCatalog) {
    await prisma.modules.upsert({
      where: { code: row.code },
      update: {
        name_pt_br: row.name_pt_br,
        description_pt_br: row.description_pt_br,
        is_active: true,
        monthly_price: row.monthly_price,
        updated_at: new Date(),
      },
      create: {
        code: row.code,
        name_pt_br: row.name_pt_br,
        description_pt_br: row.description_pt_br,
        is_active: true,
        monthly_price: row.monthly_price,
      },
    });
  }

  const plans = [
    {
      code: 'BASIC',
      name: 'Plano Basico',
      description: 'Plano de entrada para operacoes essenciais.',
      monthly_price: 950,
      modules: ['SERVICES', 'SALES'],
    },
    {
      code: 'PRO',
      name: 'Plano Pro',
      description: 'Plano completo para operacao integrada.',
      monthly_price: 3100,
      modules: ['SERVICES', 'SALES', 'FINANCE_OPERATION', 'RH', 'PROJECT_OPERATION', 'MARKETING'],
    },
  ];

  const modulesByCode = new Map(
    (await prisma.modules.findMany({
      where: { code: { in: moduleCatalog.map((row) => row.code) } },
      select: { id: true, code: true },
    })).map((row) => [row.code, row.id]),
  );

  for (const row of plans) {
    const plan = await prisma.plans.upsert({
      where: { code: row.code },
      update: {
        name: row.name,
        description: row.description,
        is_active: true,
        is_custom: false,
        is_public: true,
        monthly_price: row.monthly_price,
        updated_at: new Date(),
      },
      create: {
        code: row.code,
        name: row.name,
        description: row.description,
        is_active: true,
        is_custom: false,
        is_public: true,
        monthly_price: row.monthly_price,
      },
    });

    for (let i = 0; i < row.modules.length; i += 1) {
      const moduleCode = row.modules[i];
      const moduleId = modulesByCode.get(moduleCode);
      if (!moduleId) continue;

      await prisma.plan_modules.upsert({
        where: {
          plan_id_module_id: {
            plan_id: plan.id,
            module_id: moduleId,
          },
        },
        update: {
          sort_order: i,
          included: true,
          updated_at: new Date(),
        },
        create: {
          plan_id: plan.id,
          module_id: moduleId,
          sort_order: i,
          included: true,
        },
      });
    }
  }
}

async function run() {
  await seedBillingCatalog();

  const tenantId = process.env.TENANT_ID;
  if (!tenantId) {
    console.log('Catalogo de billing seedado. Defina TENANT_ID para seed do modulo de servico.');
    return;
  }

  const calendar = await prisma.service_calendars.upsert({
    where: { tenant_id_name: { tenant_id: tenantId, name: 'Calendario Padrao' } },
    update: { is_default: true, is_active: true },
    create: {
      tenant_id: tenantId,
      name: 'Calendario Padrao',
      timezone: 'America/Sao_Paulo',
      is_default: true,
      is_active: true,
    },
  });

  const policy = await prisma.sla_policies.upsert({
    where: { tenant_id_name: { tenant_id: tenantId, name: 'SLA Padrao' } },
    update: { is_active: true, business_calendar_id: calendar.id },
    create: {
      tenant_id: tenantId,
      name: 'SLA Padrao',
      description: 'SLA inicial do tenant',
      is_active: true,
      business_calendar_id: calendar.id,
    },
  });

  await prisma.sla_kpis.createMany({
    data: [
      {
        tenant_id: tenantId,
        sla_policy_id: policy.id,
        name: 'Primeira resposta',
        kpi_type: SlaKpiType.FIRST_RESPONSE,
        start_condition: 'INCIDENT_OPENED',
        stop_condition: 'FIRST_PUBLIC_REPLY',
        warning_after_minutes: 30,
        fail_after_minutes: 60,
        sort_order: 1,
      },
      {
        tenant_id: tenantId,
        sla_policy_id: policy.id,
        name: 'Resolucao',
        kpi_type: SlaKpiType.RESOLUTION,
        start_condition: 'INCIDENT_OPENED',
        stop_condition: 'INCIDENT_RESOLVED',
        warning_after_minutes: 240,
        fail_after_minutes: 480,
        sort_order: 2,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.service_queues.upsert({
    where: { tenant_id_name: { tenant_id: tenantId, name: 'Geral' } },
    update: { is_active: true, assignment_mode: QueueAssignmentMode.MANUAL, default_sla_policy_id: policy.id },
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
    await prisma.service_subjects.upsert({
      where: { tenant_id_name_parent_id: { tenant_id: tenantId, name: subject.name, parent_id: null } },
      update: { path: subject.path, is_active: true },
      create: {
        tenant_id: tenantId,
        name: subject.name,
        path: subject.path,
        is_active: true,
      },
    });
  }

  await prisma.service_task_types.createMany({
    data: [
      { tenant_id: tenantId, name: 'Ligacao', channel: 'CALL', default_duration_minutes: 20, is_active: true },
      { tenant_id: tenantId, name: 'Email', channel: 'EMAIL', default_duration_minutes: 15, is_active: true },
      { tenant_id: tenantId, name: 'Atendimento', channel: 'SERVICE', default_duration_minutes: 60, is_active: true },
    ],
    skipDuplicates: true,
  });

  console.log('Seed de servico executado para tenant', tenantId);
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
