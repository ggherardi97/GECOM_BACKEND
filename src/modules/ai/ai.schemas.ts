import { z } from 'zod';
import { AI_SUPPORTED_ENTITIES, ALLOWED_FILTER_OPERATORS } from './ai.types';

const entityNameSchema = z.enum(AI_SUPPORTED_ENTITIES);
const filterOperatorSchema = z.enum(ALLOWED_FILTER_OPERATORS);

export const gridFilterItemSchema = z
  .object({
    field: z.string().min(1),
    operator: filterOperatorSchema,
    value: z.unknown().optional(),
    values: z.array(z.unknown()).optional(),
    from: z.unknown().optional(),
    to: z.unknown().optional(),
  })
  .strict();

export const gridSortItemSchema = z
  .object({
    field: z.string().min(1),
    direction: z.enum(['asc', 'desc']),
  })
  .strict();

export const gridAggregationSchema = z
  .object({
    metric: z.enum(['count', 'sum', 'avg']),
    field: z.string().min(1).optional(),
    alias: z.string().min(1).max(100).optional(),
  })
  .strict();

export const gridDefinitionSchema = z
  .object({
    entityName: entityNameSchema,
    columns: z.array(z.string().min(1)).default([]),
    filters: z.array(gridFilterItemSchema).default([]),
    sort: z.array(gridSortItemSchema).default([]),
    pageSize: z.number().int().min(1).max(200).default(50),
    aggregations: z.array(gridAggregationSchema).max(10).optional(),
  })
  .strict();

export const dashboardWidgetSchema = z
  .object({
    id: z.string().min(1).max(100),
    type: z.enum(['kpi', 'timeSeries', 'bar', 'pie', 'topN']),
    title: z.string().min(1).max(120),
    entityName: entityNameSchema,
    metric: z.enum(['count', 'sum', 'avg']),
    field: z.string().min(1).optional(),
    dateField: z.string().min(1).optional(),
    groupByField: z.string().min(1).optional(),
    topN: z.number().int().min(1).max(50).optional(),
    filters: z.array(gridFilterItemSchema).max(30).optional(),
  })
  .strict();

export const dashboardSpecSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    widgets: z.array(dashboardWidgetSchema).min(1).max(12),
  })
  .strict();

export const gridFilterAiResponseSchema = z
  .object({
    definition_json: gridDefinitionSchema,
    explanation_ptbr: z.string().min(1).max(1500),
  })
  .strict();

export const dashboardAiResponseSchema = z
  .object({
    dashboardSpec: dashboardSpecSchema,
    insights_ptbr: z.string().min(1).max(2000).optional(),
  })
  .strict();

export const homeSearchAiResponseSchema = z
  .object({
    entities: z.array(entityNameSchema).min(1).max(5),
    filters: z.array(gridFilterItemSchema).max(20).optional(),
  })
  .strict();

export type GridDefinitionSchemaType = z.infer<typeof gridDefinitionSchema>;
export type DashboardSpecSchemaType = z.infer<typeof dashboardSpecSchema>;

