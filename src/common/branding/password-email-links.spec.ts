import { UserService } from '../../modules/users/user.service';
import { AuthService } from '../../modules/auth/auth.service';
import { buildPortalLoginUrl } from './portal-brand.util';

describe('password email links', () => {
  const user = { id: 'user-test', tenant_id: 'tenant-test', email: 'test@example.invalid', full_name: 'Test', first_access: true };
  const mailer = { sendWelcomeEmail: jest.fn().mockResolvedValue(undefined) };
  const crypto = { hash: jest.fn().mockResolvedValue('hash'), verify: jest.fn().mockResolvedValue(true) };
  const resets = {
    deleteToken: jest.fn().mockResolvedValue(undefined),
    generateResetToken: jest.fn().mockResolvedValue(undefined),
    getToken: jest.fn(),
  };
  const users = {
    findByEmail: jest.fn().mockResolvedValue(user),
    findById: jest.fn().mockResolvedValue(user),
    activateFirstAccess: jest.fn().mockResolvedValue(user),
    updatePassword: jest.fn().mockResolvedValue(user),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resets.getToken.mockResolvedValue({ tenant_id: user.tenant_id, token: 'hash', expires_at: new Date(Date.now() + 60000) });
  });

  function emailedUrl() {
    const html = mailer.sendWelcomeEmail.mock.calls[0][2] as string;
    const match = html.match(/href="(https:\/\/[^"\s]+\/login[^"\s]*)"/);
    expect(match).not.toBeNull();
    return new URL(match![1].replace(/&amp;/g, '&'));
  }

  function authService() {
    return new AuthService({} as any, users as any, crypto as any, resets as any, mailer as any, {} as any, {} as any);
  }

  it.each(['portalgecom.log.br', 'convert-plus.com'])('first access uses /login on %s and keeps the issued token', async host => {
    const service = new UserService({} as any, {} as any, crypto as any, resets as any, mailer as any);
    await (service as any).sendFirstAccessEmail(user, user.tenant_id, { host });
    const url = emailedUrl();
    expect(url.origin).toBe(`https://${host}`);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('userId')).toBe(user.id);
    expect(url.searchParams.get('token')).toBe(crypto.hash.mock.calls[0][0]);
    expect(resets.generateResetToken).toHaveBeenCalledWith({ tenant_id: user.tenant_id, user_id: user.id, token: 'hash' });
  });

  it.each(['portalgecom.log.br', 'convert-plus.com'])('password recovery uses /login on %s', async host => {
    await authService().forgotPassword(user.email, { headers: { 'x-forwarded-host': host } } as any);
    const url = emailedUrl();
    expect(url.origin).toBe(`https://${host}`);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('token')).toBe(crypto.hash.mock.calls[0][0]);
    expect(url.searchParams.get('userId')).toBe(user.id);
  });

  it('activates first access and sends the success link to /login without a token', async () => {
    await authService().resetPassword(user.id, 'issued-token', 'Test-password-1', 'Test-password-1');
    expect(users.activateFirstAccess).toHaveBeenCalledWith(user.tenant_id, user.id, 'Test-password-1');
    expect(resets.deleteToken).toHaveBeenCalledWith(user.id);
    expect(emailedUrl().toString()).toBe('https://portalgecom.log.br/login');
  });

  it('rejects an expired link without activating the account or emailing', async () => {
    resets.getToken.mockResolvedValue({ tenant_id: user.tenant_id, token: 'hash', expires_at: new Date(0) });
    await expect(authService().resetPassword(user.id, 'expired', 'password', 'password')).rejects.toThrow('expirado');
    expect(users.activateFirstAccess).not.toHaveBeenCalled();
    expect(mailer.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it('encodes query parameters without changing their decoded values', () => {
    const url = new URL(buildPortalLoginUrl('https://portalgecom.log.br/', { token: 'a+b/c?= &', userId: user.id }));
    expect(url.searchParams.get('token')).toBe('a+b/c?= &');
    expect(url.searchParams.get('userId')).toBe(user.id);
  });
});
