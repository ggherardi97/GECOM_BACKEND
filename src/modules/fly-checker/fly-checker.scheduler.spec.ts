import { FlyCheckerScheduler } from './fly-checker.scheduler';
import { getTenantId, getUserId } from '../../common/tenant/tenant-context';
describe('FlyChecker scheduling', () => {
  it('runs due searches within their own tenant and user context', async () => {
    const repo = {
      due: jest.fn().mockResolvedValue([
        { id: 'a', tenant_id: 'tenant-a', user_id: 'user-a' },
        { id: 'b', tenant_id: 'tenant-b', user_id: 'user-b' },
      ]),
    };
    const observed: string[][] = [];
    const service = {
      enabled: true,
      status: () => ({ configured: true }),
      process: jest.fn(async () => {
        observed.push([getTenantId()!, getUserId()!]);
      }),
    };
    await new FlyCheckerScheduler(repo as any, service as any).tick();
    expect(observed).toEqual([
      ['tenant-a', 'user-a'],
      ['tenant-b', 'user-b'],
    ]);
    expect(getTenantId()).toBeUndefined();
  });
  it('does not start another batch while a batch is running', async () => {
    let release!: () => void;
    const repo = {
      due: jest.fn().mockReturnValue(
        new Promise((resolve) => {
          release = () => resolve([]);
        })
      ),
    };
    const service = { enabled: true, status: () => ({ configured: true }) };
    const scheduler = new FlyCheckerScheduler(repo as any, service as any);
    const first = scheduler.tick();
    await scheduler.tick();
    expect(repo.due).toHaveBeenCalledTimes(1);
    release();
    await first;
  });
  it('does not access the database when the provider is not configured', async () => {
    const repo = { due: jest.fn() };
    const service = { enabled: true, status: () => ({ configured: false }) };
    await new FlyCheckerScheduler(repo as any, service as any).tick();
    expect(repo.due).not.toHaveBeenCalled();
  });
});
