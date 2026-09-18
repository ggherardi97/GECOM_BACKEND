import type { documents } from '@prisma/client';
import { DocumentsRepository } from './documents.repository';
import { PrismaService } from '../../prisma/prisma.service';

describe('DocumentsRepository list relationship details', () => {
  const tenantId = 'tenant-1';
  const document = (id: string, values: Partial<documents> = {}) => ({
    id, parent_id: null, related_table: null, related_id: null,
    account_id: 'owner-account', ...values,
  } as documents);
  let prisma: {
    documents: { findMany: jest.Mock };
    processes: { findMany: jest.Mock };
    companies: { findMany: jest.Mock };
  };
  let repository: DocumentsRepository;

  beforeEach(() => {
    prisma = {
      documents: { findMany: jest.fn().mockResolvedValue([]) },
      processes: { findMany: jest.fn().mockResolvedValue([]) },
      companies: { findMany: jest.fn().mockResolvedValue([]) },
    };
    repository = new DocumentsRepository(prisma as unknown as PrismaService);
  });

  it('resolves both process aliases in batches using the process client and invoice', async () => {
    const rows = ['process', 'processes'].map((table, index) => document(`doc-${index}`, {
      related_table: table, related_id: 'process-1',
    }));
    prisma.documents.findMany.mockResolvedValueOnce(rows);
    prisma.processes.findMany.mockResolvedValueOnce([
      { id: 'process-1', company_id: 'client-1', invoice: 'COMM-001' },
    ]);
    prisma.companies.findMany.mockResolvedValueOnce([{ id: 'client-1', company_name: 'Cliente atual' }]);

    const result = await repository.findAll({ parent_id: null, take: 20, skip: 5 }, tenantId);

    expect(result).toEqual(rows.map((row) => ({ ...row, client_name: 'Cliente atual', invoice_number: 'COMM-001' })));
    expect(prisma.documents.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenant_id: tenantId, parent_id: null, deleted_at: null }, take: 20, skip: 5,
    }));
    expect(prisma.processes.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.processes.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['process-1'] }, tenant_id: tenantId, deleted_at: null },
    }));
    expect(prisma.companies.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['client-1'] }, tenant_id: tenantId, deleted_at: null },
    }));
  });

  it('inherits through nested folders but preserves an explicit document relation', async () => {
    prisma.documents.findMany
      .mockResolvedValueOnce([
        document('file-1', { parent_id: 'nested' }),
        document('file-2', { parent_id: 'nested' }),
        document('direct', { parent_id: 'nested', related_table: 'company', related_id: 'client-2' }),
      ])
      .mockResolvedValueOnce([document('nested', { parent_id: 'root' })])
      .mockResolvedValueOnce([document('root', { related_table: 'process', related_id: 'process-1' })]);
    prisma.processes.findMany.mockResolvedValueOnce([{ id: 'process-1', company_id: 'client-1', invoice: 'INV-A' }]);
    prisma.companies.findMany.mockResolvedValueOnce([
      { id: 'client-1', company_name: 'Cliente A' }, { id: 'client-2', company_name: 'Cliente B' },
    ]);

    const result = await repository.findAll({}, tenantId);

    expect(result.map(({ client_name, invoice_number }) => ({ client_name, invoice_number }))).toEqual([
      { client_name: 'Cliente A', invoice_number: 'INV-A' },
      { client_name: 'Cliente A', invoice_number: 'INV-A' },
      { client_name: 'Cliente B', invoice_number: null },
    ]);
    expect(prisma.documents.findMany).toHaveBeenCalledTimes(3);
    for (const id of ['nested', 'root']) {
      expect(prisma.documents.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: { in: [id] }, tenant_id: tenantId, deleted_at: null },
      }));
    }
  });

  it('leaves absent, deleted or inaccessible relationships empty without using the owner account', async () => {
    prisma.documents.findMany.mockResolvedValueOnce([
      document('unrelated'),
      document('missing-process', { related_table: 'process', related_id: 'missing' }),
      document('missing-client', { related_table: 'company', related_id: 'missing', related_name: 'Stale name' }),
      document('missing-parent', { parent_id: 'deleted-folder' }),
    ]);

    const result = await repository.findAll({}, tenantId);

    expect(result.every((row) => row.client_name === null && row.invoice_number === null)).toBe(true);
    expect(prisma.companies.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['missing'] }, tenant_id: tenantId, deleted_at: null },
    }));
  });

  it('handles cycles in legacy folder data without looping', async () => {
    prisma.documents.findMany
      .mockResolvedValueOnce([document('file', { parent_id: 'a' })])
      .mockResolvedValueOnce([document('a', { parent_id: 'b' })])
      .mockResolvedValueOnce([document('b', { parent_id: 'a' })]);

    expect(await repository.findAll({}, tenantId)).toEqual([
      expect.objectContaining({ id: 'file', client_name: null, invoice_number: null }),
    ]);
    expect(prisma.documents.findMany).toHaveBeenCalledTimes(3);
  });

  it('shows the client even when the process has no invoice', async () => {
    prisma.documents.findMany.mockResolvedValueOnce([document('file', { related_table: 'process', related_id: 'p' })]);
    prisma.processes.findMany.mockResolvedValueOnce([{ id: 'p', company_id: 'c', invoice: null }]);
    prisma.companies.findMany.mockResolvedValueOnce([{ id: 'c', company_name: 'Cliente' }]);
    expect(await repository.findAll({}, tenantId)).toEqual([
      expect.objectContaining({ client_name: 'Cliente', invoice_number: null }),
    ]);
  });

  it('skips relationship queries for an empty page', async () => {
    expect(await repository.findAll({}, tenantId)).toEqual([]);
    expect(prisma.processes.findMany).not.toHaveBeenCalled();
    expect(prisma.companies.findMany).not.toHaveBeenCalled();
    expect(prisma.documents.findMany).toHaveBeenCalledTimes(1);
  });
});
