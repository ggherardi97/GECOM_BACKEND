import { FlyCheckerRepository } from './fly-checker.repository';
describe('FlyChecker ownership and concurrency', () => {
  const scope = { tenantId: 'tenant-a', userId: 'user-a' };
  it('filters detail by both tenant and owner and returns 404 for someone else', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const repo = new FlyCheckerRepository({ raw: { fly_checker_searches: { findFirst } } } as any);
    await expect(repo.detail(scope, 'other-search', 1, 'production', 'amadeus')).rejects.toThrow(
      'Busca não encontrada'
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'other-search', tenant_id: 'tenant-a', user_id: 'user-a' },
    });
  });
  it('atomically claims only due, active, unlocked searches owned by the scope', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const repo = new FlyCheckerRepository({ raw: { fly_checker_searches: { updateMany } } } as any);
    expect(await repo.claim(scope, 'search-a', 30)).toBeNull();
    expect(updateMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({
        id: 'search-a',
        tenant_id: 'tenant-a',
        user_id: 'user-a',
        active: true,
        next_check_at: { lte: expect.any(Date) },
        OR: expect.any(Array),
      })
    );
  });
  it('an old worker cannot release a newer lease', async () => {
    const updateMany = jest.fn();
    const repo = new FlyCheckerRepository({ raw: { fly_checker_searches: { updateMany } } } as any);
    await repo.release({ id: 'search-a', tenant_id: 'tenant-a' } as any, 'old-token');
    expect(updateMany.mock.calls[0][0].where).toEqual({
      id: 'search-a',
      tenant_id: 'tenant-a',
      lock_token: 'old-token',
    });
  });
});
