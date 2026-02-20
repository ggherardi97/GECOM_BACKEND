import { PrismaClient, QueueAssignmentMode, SlaKpiType } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const tenantId = process.env.TENANT_ID;
  if (!tenantId) {
    throw new Error('Defina TENANT_ID para executar o seed do módulo de serviço.');
  }

  const calendar = await prisma.service_calendars.upsert({
    where: { tenant_id_name: { tenant_id: tenantId, name: 'Calendário Padrão' } },
    update: { is_default: true, is_active: true },
    create: {
      tenant_id: tenantId,
      name: 'Calendário Padrão',
      timezone: 'America/Sao_Paulo',
      is_default: true,
      is_active: true,
    },
  });

  const policy = await prisma.sla_policies.upsert({
    where: { tenant_id_name: { tenant_id: tenantId, name: 'SLA Padrão' } },
    update: { is_active: true, business_calendar_id: calendar.id },
    create: {
      tenant_id: tenantId,
      name: 'SLA Padrão',
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
        name: 'Resolução',
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
      { tenant_id: tenantId, name: 'Ligação', channel: 'CALL', default_duration_minutes: 20, is_active: true },
      { tenant_id: tenantId, name: 'Email', channel: 'EMAIL', default_duration_minutes: 15, is_active: true },
      { tenant_id: tenantId, name: 'Atendimento', channel: 'SERVICE', default_duration_minutes: 60, is_active: true },
    ],
    skipDuplicates: true,
  });

  console.log('Seed de serviço executado para tenant', tenantId);
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
