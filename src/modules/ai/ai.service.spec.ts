import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';

describe('AiService QueryBuilder', () => {
  const service = new AiService({} as any, new ConfigService({ OPENAI_API_KEY: 'test-key' }), {} as any);

  it('always injects tenant_id into where', () => {
    const where = service.buildPrismaWhere(
      'companies',
      [{ field: 'company_name', operator: 'contains', value: 'ACME' }],
      'tenant-123',
    ) as any;

    expect(where.AND).toBeDefined();
    expect(where.AND[0]).toEqual({ tenant_id: 'tenant-123' });
  });

  it('keeps only allowed sortable fields in orderBy', () => {
    const orderBy = service.buildPrismaOrderBy('companies', [
      { field: 'company_name', direction: 'asc' },
      { field: 'password', direction: 'desc' } as any,
    ]) as any[];

    expect(orderBy).toEqual([{ company_name: 'asc' }]);
  });
});

