import { ConfigService } from '@nestjs/config';
import { FlyCheckerService } from './fly-checker.service';
import { OpportunityService } from './opportunity.service';
describe('FlyChecker processing', () => {
  const scope = { tenantId: 'tenant-a', userId: 'owner-a' };
  function setup(environment = 'production') {
    const now = new Date();
    const future = new Date(now.getTime() + 10 * 86400000).toISOString().slice(0, 10);
    const returning = new Date(now.getTime() + 15 * 86400000).toISOString().slice(0, 10);
    const search = {
      id: 'search-a',
      tenant_id: scope.tenantId,
      user_id: scope.userId,
      origin: 'GRU',
      destination: 'NYC',
      departure_start: future,
      departure_end: future,
      return_start: returning,
      return_end: returning,
      max_price: '3500',
      email: 'owner@example.test',
      non_stop: true,
      active: true,
    };
    const repo = {
      claim: jest.fn().mockResolvedValue({ search, token: 'lock-a' }),
      release: jest.fn(),
      start: jest.fn().mockResolvedValue({ id: 'check-a', started_at: now }),
      stats: jest.fn().mockResolvedValue({ average: 4500, low: 4000, samples: 3, days: 2 }),
      ownsLease: jest.fn().mockResolvedValue(true),
      finish: jest.fn(),
      alertHistory: jest.fn().mockResolvedValue({ last: null, sameFareLow: null }),
      reserveAlert: jest.fn().mockResolvedValue('alert-a'),
      markAlert: jest.fn(),
      cancelRunning: jest.fn(),
    };
    const offer = {
      fingerprint: 'fingerprint',
      price: '3150.00',
      currency: 'BRL',
      departure_date: future,
      return_date: returning,
      airline: 'Example',
      itinerary: [],
      fare_details: [],
    };
    const provider = {
      name: 'amadeus',
      environment,
      configured: () => true,
      search: jest.fn().mockResolvedValue([offer]),
    };
    const mailer = { sendFlyCheckerEmail: jest.fn().mockResolvedValue(undefined) };
    const service = new FlyCheckerService(
      repo as any,
      new ConfigService(),
      provider,
      new OpportunityService(),
      mailer as any
    );
    return { service, repo, provider, mailer, search, offer };
  }
  it('persists prices before sending and records delivery success', async () => {
    const { service, repo, mailer } = setup();
    await service.process(scope, 'search-a');
    expect(repo.finish).toHaveBeenCalledWith(
      scope.tenantId,
      'check-a',
      'success',
      expect.any(Array),
      1,
      ''
    );
    expect(repo.finish.mock.invocationCallOrder[0]).toBeLessThan(
      mailer.sendFlyCheckerEmail.mock.invocationCallOrder[0]
    );
    expect(mailer.sendFlyCheckerEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@example.test',
        subject: expect.stringContaining('FlyChecker'),
        text: expect.stringContaining('Novo menor preço'),
      })
    );
    expect(repo.markAlert).toHaveBeenCalledWith(scope.tenantId, 'alert-a', 'sent');
    expect(repo.release).toHaveBeenCalled();
  });
  it('preserves a failed API execution without sending a false bargain', async () => {
    const { service, repo, provider, mailer } = setup();
    provider.search.mockRejectedValue(new Error('Amadeus: consulta indisponível (HTTP 429).'));
    await service.process(scope, 'search-a');
    expect(repo.finish).toHaveBeenCalledWith(
      scope.tenantId,
      'check-a',
      'error',
      [],
      0,
      expect.stringContaining('429')
    );
    expect(mailer.sendFlyCheckerEmail).not.toHaveBeenCalled();
  });
  it('records empty results without turning them into a zero price', async () => {
    const { service, repo, provider } = setup();
    provider.search.mockResolvedValue([]);
    await service.process(scope, 'search-a');
    expect(repo.finish).toHaveBeenCalledWith(scope.tenantId, 'check-a', 'empty', [], 1, '');
    expect(repo.reserveAlert).not.toHaveBeenCalled();
  });
  it('does not process a search already claimed by another worker', async () => {
    const { service, repo, provider } = setup();
    repo.claim.mockResolvedValue(null);
    await service.process(scope, 'search-a');
    expect(provider.search).not.toHaveBeenCalled();
  });
  it('suppresses test email by default', async () => {
    const { service, repo, mailer } = setup('test');
    repo.reserveAlert.mockResolvedValue(null);
    await service.process(scope, 'search-a');
    expect(repo.reserveAlert).toHaveBeenCalledWith(expect.any(Object), true);
    expect(mailer.sendFlyCheckerEmail).not.toHaveBeenCalled();
  });
  it('stops before contacting the provider when paused or deleted after claim', async () => {
    const { service, repo, provider, mailer } = setup();
    repo.ownsLease.mockResolvedValue(false);
    await service.process(scope, 'search-a');
    expect(provider.search).not.toHaveBeenCalled();
    expect(mailer.sendFlyCheckerEmail).not.toHaveBeenCalled();
    expect(repo.cancelRunning).toHaveBeenCalled();
    expect(repo.release).toHaveBeenCalled();
  });
  it('does not query further date pairs or email when paused during a request', async () => {
    const { service, repo, provider, mailer, search, offer } = setup();
    search.departure_end = new Date(new Date(search.departure_start).getTime() + 86400000)
      .toISOString()
      .slice(0, 10);
    provider.search.mockImplementation(async () => {
      repo.ownsLease.mockResolvedValue(false);
      return [offer];
    });
    await service.process(scope, 'search-a');
    expect(provider.search).toHaveBeenCalledTimes(1);
    expect(repo.reserveAlert).not.toHaveBeenCalled();
    expect(mailer.sendFlyCheckerEmail).not.toHaveBeenCalled();
  });
  it('does not resend an already alerted fare', async () => {
    const { service, repo, mailer } = setup();
    repo.alertHistory.mockResolvedValue({ last: null, sameFareLow: 3150 });
    await service.process(scope, 'search-a');
    expect(mailer.sendFlyCheckerEmail).not.toHaveBeenCalled();
  });
  it('records SMTP failure without losing prices', async () => {
    const { service, repo, mailer } = setup();
    mailer.sendFlyCheckerEmail.mockRejectedValue(new Error('SMTP error'));
    await service.process(scope, 'search-a');
    expect(repo.markAlert).toHaveBeenCalledWith(
      scope.tenantId,
      'alert-a',
      'failed',
      expect.any(String)
    );
    expect(repo.finish).toHaveBeenCalledTimes(1);
  });
  it('keeps partial history and does not send alerts for incomplete date coverage', async () => {
    const { service, repo, provider, search, offer, mailer } = setup();
    search.departure_end = new Date(new Date(search.departure_start).getTime() + 86400000)
      .toISOString()
      .slice(0, 10);
    provider.search
      .mockResolvedValueOnce([offer])
      .mockRejectedValueOnce(new Error('upstream offline'));
    await service.process(scope, 'search-a');
    expect(repo.finish).toHaveBeenCalledWith(
      scope.tenantId,
      'check-a',
      'partial',
      [offer],
      1,
      expect.any(String)
    );
    expect(mailer.sendFlyCheckerEmail).not.toHaveBeenCalled();
  });
});
