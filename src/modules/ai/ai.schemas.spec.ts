import { dashboardSpecSchema, gridDefinitionSchema } from './ai.schemas';

describe('ai.schemas', () => {
  it('validates a grid definition payload', () => {
    const parsed = gridDefinitionSchema.safeParse({
      entityName: 'invoices',
      columns: ['invoice_number', 'total'],
      filters: [{ field: 'total', operator: 'gte', value: 1000 }],
      sort: [{ field: 'created_at', direction: 'desc' }],
      pageSize: 50,
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects invalid operator in grid definition', () => {
    const parsed = gridDefinitionSchema.safeParse({
      entityName: 'invoices',
      columns: ['invoice_number'],
      filters: [{ field: 'total', operator: 'greaterThan', value: 1000 }],
      sort: [],
      pageSize: 50,
    });

    expect(parsed.success).toBe(false);
  });

  it('validates dashboard spec', () => {
    const parsed = dashboardSpecSchema.safeParse({
      title: 'Dashboard Financeiro',
      widgets: [
        {
          id: 'kpi_total',
          type: 'kpi',
          title: 'Total Faturado',
          entityName: 'invoices',
          metric: 'sum',
          field: 'total',
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });
});

