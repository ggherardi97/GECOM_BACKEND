const SYSTEM_ENTITY_EXCLUSIONS = new Set<string>([
  'automations',
  'automation_executions',
  'migrations',
  'sessions',
  'password_resets',
  'notification_reads',
  'user_default_views',
  'tenant_module_overrides',
  'plan_modules',
]);

const CONFIG_ENTITY_EXCLUSIONS = new Set<string>([
  'tenants',
  'modules',
  'plans',
  'saved_views',
  'tracking_configs',
  'tracking_links',
  'currencies',
  'process_types',
  'transport_types',
  'transport_statuses',
  'status_configs',
  'option_sets',
  'email_integrations',
  'tenant_subscriptions',
  'service_queues',
  'service_queue_members',
  'service_subjects',
  'service_calendars',
  'service_calendar_rules',
  'service_calendar_exceptions',
  'service_resources',
  'service_task_types',
  'sla_policies',
  'sla_kpis',
  'sla_instances',
  'sla_instance_kpis',
  'sla_events',
  'financial_categories',
  'financial_cost_centers',
  'financial_bank_accounts',
  'hr_employment_statuses',
  'hr_document_types',
  'hr_marital_statuses',
  'hr_positions',
  'hr_work_locations',
  'hr_departments',
  'hr_work_schedules',
  'hr_leave_types',
  'hr_skill_categories',
  'hr_skills',
  'hr_certifications',
  'hr_lifecycle_templates',
  'hr_lifecycle_stages',
  'hr_lifecycle_tasks',
  'po_project_statuses',
  'po_deliverable_statuses',
  'po_work_order_statuses',
  'po_resource_roles',
  'access_roles',
  'access_role_permissions',
  'access_user_roles',
  'tenant_menu_config',
  'tenant_theme_settings',
  'tenant_landing_page_settings',
  'admin_audit_log',
]);

const CONFIG_PREFIX_EXCLUSIONS = [
  'billing_stripe_',
  'public_signup_',
];

const GENERIC_AUTOMATION_SKIP_OPERATIONS = new Map<string, Set<'CREATE' | 'UPDATE'>>([
  ['incidents', new Set(['CREATE', 'UPDATE'])],
  ['board_cards', new Set(['CREATE', 'UPDATE'])],
  ['invoices', new Set(['UPDATE'])],
  ['leads', new Set(['CREATE'])],
]);

function normalizeEntityName(entityName: unknown): string {
  return String(entityName ?? '').trim().toLowerCase();
}

export function isAutomationConfigurationEntity(entityName: unknown): boolean {
  const normalized = normalizeEntityName(entityName);
  if (!normalized) return true;
  if (SYSTEM_ENTITY_EXCLUSIONS.has(normalized)) return true;
  if (CONFIG_ENTITY_EXCLUSIONS.has(normalized)) return true;
  return CONFIG_PREFIX_EXCLUSIONS.some((prefix) => normalized.startsWith(prefix));
}

export function shouldExposeEntityInAutomationCatalog(entityName: unknown): boolean {
  return !isAutomationConfigurationEntity(entityName);
}

export function shouldDispatchAutomationForEntity(entityName: unknown): boolean {
  return !isAutomationConfigurationEntity(entityName);
}

export function shouldSkipGenericAutomationOperation(
  entityName: unknown,
  eventType: 'CREATE' | 'UPDATE',
): boolean {
  const normalized = normalizeEntityName(entityName);
  return GENERIC_AUTOMATION_SKIP_OPERATIONS.get(normalized)?.has(eventType) ?? false;
}
