export const MODULE_AREA_KEYS = ['service', 'sales', 'finance', 'hr', 'po'] as const;
export type ModuleAreaKey = (typeof MODULE_AREA_KEYS)[number];

const MODULE_AREA_KEY_SET = new Set<string>(MODULE_AREA_KEYS);
const MODULE_AREA_LABEL_MAP: Record<ModuleAreaKey, string> = {
  service: 'Servicos',
  sales: 'Sales',
  finance: 'Financeiro',
  hr: 'RH',
  po: 'Project & Operations',
};

export function normalizeModuleAreaKey(value: unknown): ModuleAreaKey | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (!MODULE_AREA_KEY_SET.has(raw)) return null;
  return raw as ModuleAreaKey;
}

export function normalizeModuleAreaKeys(value: unknown, fallbackCode?: string): ModuleAreaKey[] {
  const rawItems = Array.isArray(value) ? value : [];
  const normalized = rawItems
    .map((item) => normalizeModuleAreaKey(item))
    .filter((item): item is ModuleAreaKey => !!item);

  const dedup = Array.from(new Set(normalized));
  if (dedup.length > 0) return dedup;

  return defaultAreaKeysForModuleCode(fallbackCode);
}

export function extractModuleAreaKeys(moduleRow: any): ModuleAreaKey[] {
  const raw = moduleRow?.area_keys_json;
  const code = moduleRow?.code;
  return normalizeModuleAreaKeys(raw, code);
}

export function defaultAreaKeysForModuleCode(moduleCode: unknown): ModuleAreaKey[] {
  const code = String(moduleCode ?? '').trim().toUpperCase();
  if (!code) return [];

  const result: ModuleAreaKey[] = [];
  const include = (key: ModuleAreaKey) => {
    if (!result.includes(key)) result.push(key);
  };

  if (code.includes('SERVICE') || code.includes('SUPPORT') || code.includes('HELPDESK') || code.includes('OPS')) {
    include('service');
  }
  if (code.includes('SALES') || code.includes('CRM') || code.includes('COMMERCIAL')) {
    include('sales');
  }
  if (code.includes('FINANCE') || code.includes('FINANCIAL')) {
    include('finance');
  }
  if (code.includes('RH') || code.includes('HR') || code.includes('HUMAN') || code.includes('PEOPLE')) {
    include('hr');
  }
  if (code.includes('PROJECT') || code.includes('OPERATIONS') || code.includes('PO_')) {
    include('po');
  }

  return result;
}

export function defaultModuleAreaLabel(areaKey: unknown): string {
  const normalized = normalizeModuleAreaKey(areaKey);
  if (!normalized) return String(areaKey ?? '').trim();
  return MODULE_AREA_LABEL_MAP[normalized];
}

const serviceEntityNames = new Set<string>([
  'incidents',
  'incident_comments',
  'incident_time_entries',
  'service_queues',
  'service_queue_members',
  'service_resources',
  'service_resource_schedules',
  'service_tasks',
  'service_task_types',
  'service_subjects',
  'customer_assets',
  'asset_relationships',
  'sla_policies',
  'sla_policy_kpis',
  'sla_instances',
  'sla_instance_kpis',
  'sla_events',
  'service_calendars',
  'service_calendar_rules',
  'service_calendar_exceptions',
]);

const salesEntityNames = new Set<string>([
  'invoices',
  'invoice_lines',
  'products',
  'leads',
  'lead_activities',
  'lead_stage_history',
  'whatsapp_integrations',
  'whatsapp_conversations',
  'whatsapp_messages',
  'opportunities',
  'contracts',
  'contract_lines',
  'price_tables',
  'price_table_items',
  'sales_approvals',
  'sales_goals',
  'sales_commissions',
  'trade_simulations',
  'trade_simulation_items',
  'trade_simulation_costs',
  'trade_simulation_taxes',
  'trade_simulation_rates',
]);

export function inferEntityModuleArea(entityName: unknown): ModuleAreaKey | null {
  const entity = String(entityName ?? '').trim().toLowerCase();
  if (!entity) return null;

  if (entity.startsWith('financial_')) return 'finance';
  if (entity.startsWith('hr_')) return 'hr';
  if (entity.startsWith('po_')) return 'po';
  if (entity.startsWith('service_') || entity.startsWith('sla_')) return 'service';
  if (entity.startsWith('sales_')) return 'sales';
  if (entity.startsWith('lead_')) return 'sales';
  if (entity.startsWith('whatsapp_')) return 'sales';
  if (entity.startsWith('opportunity_')) return 'sales';
  if (entity.startsWith('contract_')) return 'sales';
  if (entity.startsWith('price_table_')) return 'sales';
  if (entity.startsWith('trade_simulation_')) return 'sales';
  if (serviceEntityNames.has(entity)) return 'service';
  if (salesEntityNames.has(entity)) return 'sales';

  return null;
}

export function isEntityAllowedByModuleAreas(
  entityName: unknown,
  enabledAreas: Set<string>,
  explicitEntityAreaMap?: Map<string, ModuleAreaKey> | Record<string, string> | null,
): boolean {
  const requiredArea = resolveEntityModuleArea(entityName, explicitEntityAreaMap);
  if (!requiredArea) return true;
  return enabledAreas.has(requiredArea);
}

export function resolveEntityModuleArea(
  entityName: unknown,
  explicitEntityAreaMap?: Map<string, ModuleAreaKey> | Record<string, string> | null,
): ModuleAreaKey | null {
  const entity = String(entityName ?? '').trim().toLowerCase();
  if (!entity) return null;

  if (explicitEntityAreaMap instanceof Map) {
    const mapped = normalizeModuleAreaKey(explicitEntityAreaMap.get(entity));
    if (mapped) return mapped;
  } else if (explicitEntityAreaMap && typeof explicitEntityAreaMap === 'object') {
    const mapped = normalizeModuleAreaKey((explicitEntityAreaMap as Record<string, string>)[entity]);
    if (mapped) return mapped;
  }

  return inferEntityModuleArea(entity);
}
