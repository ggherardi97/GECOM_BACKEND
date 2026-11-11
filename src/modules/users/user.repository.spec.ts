import { NotFoundException } from '@nestjs/common';
import { user_status_enum } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';
import { UserStatusEnum } from './enums';

describe('contact status updates', () => {
  let row: any;
  let repository: UserRepository;
  let service: UserService;

  beforeEach(() => {
    row = { id: 'contact-a', tenant_id: 'tenant-a', status: user_status_enum.DELETED, full_name: 'Contato' };
    const matches = (where: any) => where.id === row.id && where.tenant_id === row.tenant_id
      && (!where.status?.not || row.status !== where.status.not);
    const prisma = {
      users: {
        updateMany: jest.fn(async ({ where, data }) => {
          if (!matches(where)) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        }),
        findFirst: jest.fn(async ({ where }) => matches(where) ? { ...row } : null),
      },
    } as unknown as PrismaService;
    repository = new UserRepository(prisma);
    service = new UserService(repository, prisma, {} as any, {} as any, {} as any);
  });

  it('reactivates a deleted contact through the administrative update', async () => {
    const result = await service.update('tenant-a', 'contact-a', { status: UserStatusEnum.ACTIVE });
    expect(result.status).toBe(user_status_enum.ACTIVE);
    expect(row.status).toBe(user_status_enum.ACTIVE);
  });

  it('edits a deleted contact without implicitly reactivating it', async () => {
    const result = await service.update('tenant-a', 'contact-a', { full_name: 'Novo nome' });
    expect(result.full_name).toBe('Novo nome');
    expect(result.status).toBe(user_status_enum.DELETED);
  });

  it('does not update or restore a contact from another tenant', async () => {
    await expect(service.update('tenant-b', 'contact-a', { status: UserStatusEnum.ACTIVE }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(row.status).toBe(user_status_enum.DELETED);
  });

  it('keeps deleted contacts excluded from ordinary updates and reads', async () => {
    await expect(repository.updatePassword('tenant-a', 'contact-a', 'hash'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(await repository.findById('tenant-a', 'contact-a')).toBeNull();
  });

  it('returns the deleted contact successfully after soft deletion', async () => {
    row.status = user_status_enum.ACTIVE;
    const result = await repository.remove('tenant-a', 'contact-a');
    expect(result.status).toBe(user_status_enum.DELETED);
  });
});
