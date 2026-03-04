export type EntityOptionField = {
  field: string;
  label: string;
};

export type EntityRegistryItem = {
  entity: string;
  label: string;
  route: string;
  icon: string;
  supportsCrud: boolean;
  allowOptionSetEditing: boolean;
  optionSetFields?: EntityOptionField[];
};

export const ENTITY_REGISTRY: EntityRegistryItem[] = [
  {
    entity: 'companies',
    label: 'Empresas',
    route: '/Clientes',
    icon: 'fa-building',
    supportsCrud: true,
    allowOptionSetEditing: true,
    optionSetFields: [
      { field: 'category', label: 'Categoria' },
      { field: 'sector', label: 'Setor' },
      { field: 'language', label: 'Idioma' },
    ],
  },
  {
    entity: 'processes',
    label: 'Processos',
    route: '/Processos',
    icon: 'fa-file',
    supportsCrud: true,
    allowOptionSetEditing: true,
    optionSetFields: [{ field: 'status', label: 'Status' }],
  },
  {
    entity: 'invoices',
    label: 'Faturas',
    route: '/Invoices',
    icon: 'fa-money',
    supportsCrud: true,
    allowOptionSetEditing: true,
    optionSetFields: [{ field: 'status', label: 'Status' }],
  },
  {
    entity: 'products',
    label: 'Produtos',
    route: '/Products',
    icon: 'fa-cube',
    supportsCrud: true,
    allowOptionSetEditing: true,
    optionSetFields: [{ field: 'unit', label: 'Unidade' }],
  },
  {
    entity: 'leads',
    label: 'Leads',
    route: '/leads/pipeline',
    icon: 'fa-filter',
    supportsCrud: true,
    allowOptionSetEditing: true,
    optionSetFields: [
      { field: 'status', label: 'Status' },
      { field: 'type', label: 'Tipo' },
    ],
  },
  {
    entity: 'opportunities',
    label: 'Oportunidades',
    route: '/Opportunities',
    icon: 'fa-bullseye',
    supportsCrud: true,
    allowOptionSetEditing: true,
    optionSetFields: [{ field: 'status', label: 'Status' }],
  },
  {
    entity: 'contracts',
    label: 'Contratos',
    route: '/Contracts',
    icon: 'fa-file-text-o',
    supportsCrud: true,
    allowOptionSetEditing: true,
    optionSetFields: [{ field: 'status', label: 'Status' }],
  },
  {
    entity: 'documents',
    label: 'Documentos',
    route: '/MyDocuments',
    icon: 'fa-folder-open',
    supportsCrud: true,
    allowOptionSetEditing: false,
  },
  {
    entity: 'service_calendar_activities',
    label: 'Calendario de Atividades',
    route: '/servico/agenda',
    icon: 'fa-calendar',
    supportsCrud: false,
    allowOptionSetEditing: false,
  },
  {
    entity: 'financial_receivables',
    label: 'Contas a Receber',
    route: '/FinanceReceivables',
    icon: 'fa-arrow-circle-o-down',
    supportsCrud: true,
    allowOptionSetEditing: true,
    optionSetFields: [{ field: 'status', label: 'Status' }],
  },
  {
    entity: 'financial_payables',
    label: 'Contas a Pagar',
    route: '/FinancePayables',
    icon: 'fa-arrow-circle-o-up',
    supportsCrud: true,
    allowOptionSetEditing: true,
    optionSetFields: [{ field: 'status', label: 'Status' }],
  },
  {
    entity: 'hr_employees',
    label: 'Colaboradores',
    route: '/HREmployees',
    icon: 'fa-users',
    supportsCrud: true,
    allowOptionSetEditing: true,
    optionSetFields: [
      { field: 'employment_status_id', label: 'Status empregaticio' },
      { field: 'marital_status_id', label: 'Estado civil' },
      { field: 'document_type_id', label: 'Tipo de documento' },
    ],
  },
  {
    entity: 'hr_skills',
    label: 'Skills',
    route: '/HRSkills',
    icon: 'fa-graduation-cap',
    supportsCrud: true,
    allowOptionSetEditing: true,
    optionSetFields: [{ field: 'category_id', label: 'Categoria' }],
  },
  {
    entity: 'hr_employee_lifecycles',
    label: 'Lifecycles colaborador',
    route: '/HREmployeeLifecycles',
    icon: 'fa-tasks',
    supportsCrud: true,
    allowOptionSetEditing: true,
    optionSetFields: [{ field: 'current_stage_id', label: 'Etapa' }],
  },
  {
    entity: 'po_work_orders',
    label: 'Ordens de Trabalho',
    route: '/POWorkOrders',
    icon: 'fa-wrench',
    supportsCrud: true,
    allowOptionSetEditing: true,
    optionSetFields: [
      { field: 'status_id', label: 'Status' },
      { field: 'priority', label: 'Prioridade' },
    ],
  },
  {
    entity: 'my_activities',
    label: 'Minhas Atividades',
    route: '/MyActivities',
    icon: 'fa-tasks',
    supportsCrud: false,
    allowOptionSetEditing: false,
  },
  {
    entity: 'ai_hub',
    label: 'IA',
    route: '/AI',
    icon: 'fa-magic',
    supportsCrud: false,
    allowOptionSetEditing: false,
  },
  {
    entity: 'my_documents',
    label: 'Meus Documentos',
    route: '/MyDocuments',
    icon: 'fa-folder',
    supportsCrud: false,
    allowOptionSetEditing: false,
  },
  {
    entity: 'customs_calculation',
    label: 'Calculo Aduaneiro',
    route: '/calculo-aduaneiro',
    icon: 'fa-balance-scale',
    supportsCrud: false,
    allowOptionSetEditing: false,
  },
  {
    entity: 'automations',
    label: 'Automações',
    route: '/automations',
    icon: 'fa-bolt',
    supportsCrud: false,
    allowOptionSetEditing: false,
  },
  {
    entity: 'notifications',
    label: 'Notificacoes',
    route: '/Notifications',
    icon: 'fa-bell',
    supportsCrud: false,
    allowOptionSetEditing: false,
  },
  {
    entity: 'status_configs',
    label: 'Status das Entidades',
    route: '/configuracoes/status',
    icon: 'fa-sliders',
    supportsCrud: false,
    allowOptionSetEditing: false,
  },
  {
    entity: 'settings_center',
    label: 'Configuracoes',
    route: '/configuracoes',
    icon: 'fa-cogs',
    supportsCrud: false,
    allowOptionSetEditing: false,
  },
  {
    entity: 'users',
    label: 'Usuarios',
    route: '/Profile',
    icon: 'fa-user',
    supportsCrud: true,
    allowOptionSetEditing: false,
  },
];

export const ENTITY_REGISTRY_BY_ENTITY = new Map(
  ENTITY_REGISTRY.map((item) => [item.entity, item]),
);

export function getEntityRegistryItem(entity: string | null | undefined): EntityRegistryItem | null {
  const key = String(entity || '').trim();
  if (!key) return null;
  return ENTITY_REGISTRY_BY_ENTITY.get(key) || null;
}
