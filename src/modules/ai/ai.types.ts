export const AI_SUPPORTED_ENTITIES = ['companies', 'processes', 'invoices', 'products', 'documents'] as const;

export type AiEntityName = (typeof AI_SUPPORTED_ENTITIES)[number];

export const ALLOWED_FILTER_OPERATORS = [
  'eq',
  'neq',
  'contains',
  'startsWith',
  'endsWith',
  'in',
  'notIn',
  'gte',
  'lte',
  'between',
  'isNull',
  'isNotNull',
] as const;

export type FilterOperator = (typeof ALLOWED_FILTER_OPERATORS)[number];

export type FieldType = 'string' | 'number' | 'date' | 'boolean' | 'uuid' | 'enum';

export interface EntityFieldConfig {
  type: FieldType;
  filterable: boolean;
  sortable: boolean;
  selectable: boolean;
}

export interface EntityDictionaryEntry {
  entityName: AiEntityName;
  prismaDelegate: AiEntityName;
  labelPtBr: string;
  defaultColumns: string[];
  fields: Record<string, EntityFieldConfig>;
  restrictedRoles?: string[];
}

export interface GridFilterItem {
  field: string;
  operator: FilterOperator;
  value?: unknown;
  values?: unknown[];
  from?: unknown;
  to?: unknown;
}

export interface GridSortItem {
  field: string;
  direction: 'asc' | 'desc';
}

export interface GridAggregation {
  metric: 'count' | 'sum' | 'avg';
  field?: string;
  alias?: string;
}

export interface GridDefinitionJson {
  entityName: AiEntityName;
  columns: string[];
  filters: GridFilterItem[];
  sort: GridSortItem[];
  pageSize: number;
  aggregations?: GridAggregation[];
}

export interface DashboardWidgetSpec {
  id: string;
  type: 'kpi' | 'timeSeries' | 'bar' | 'pie' | 'topN';
  title: string;
  entityName: AiEntityName;
  metric: 'count' | 'sum' | 'avg';
  field?: string;
  dateField?: string;
  groupByField?: string;
  topN?: number;
  filters?: GridFilterItem[];
}

export interface DashboardSpec {
  title?: string;
  widgets: DashboardWidgetSpec[];
}

export interface HomeSearchResultCard {
  entityName: AiEntityName;
  id: string;
  title: string;
  subtitle?: string;
  metadata?: Record<string, unknown>;
}

export interface AuthUser {
  id: string;
  tenant_id: string;
  role?: string;
}

