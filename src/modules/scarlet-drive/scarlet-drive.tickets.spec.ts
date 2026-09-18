import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ScarletDriveController } from './scarlet-drive.controller';
import { ScarletDriveRepository } from './scarlet-drive.repository';
import { ScarletDriveService } from './scarlet-drive.service';

describe('ScarletDrive tickets', () => {
  const id = 'abcd1234-1234-4567-89ab-123456789abc';
  const token = 'f2d9a3c1-77a1-4f0c-8f53-a3a2b745c88e';
  let guest: any;
  let delegate: { findUnique: jest.Mock; updateMany: jest.Mock };
  let controller: ScarletDriveController;

  beforeEach(() => {
    guest = { id, ticket_token: token, name: 'Maria', invited_by: 'Diogo', is_paid: false, is_confirmed: false, checked_in_at: null };
    delegate = {
      findUnique: jest.fn(async ({ where, select }) => {
        if (!guest || (where.id && where.id !== id) || (where.ticket_token && where.ticket_token !== token)) return null;
        return Object.fromEntries(Object.keys(select).map((key) => [key, guest[key]]));
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        if (!guest || guest.ticket_token !== where.ticket_token || guest.checked_in_at !== where.checked_in_at) return { count: 0 };
        Object.assign(guest, data);
        return { count: 1 };
      }),
    };
    const repository = new ScarletDriveRepository({ scarlet_drive_guests: delegate } as any);
    controller = new ScarletDriveController(new ScarletDriveService(repository));
  });

  it('returns the same separate ticket token on every share', async () => {
    expect(await controller.getGuestTicket(id)).toEqual({ token, path: `/ingresso/${token}` });
    expect(await controller.getGuestTicket(id)).toEqual(await controller.getGuestTicket(id));
    expect(delegate.updateMany).not.toHaveBeenCalled();
  });

  it('opening the ticket never checks in and only exposes ticket presentation fields', async () => {
    expect(await controller.getTicket(token)).toEqual({ name: 'Maria', invitedBy: 'Diogo', isPaid: false, isConfirmed: false, checkedInAt: null });
    expect(delegate.updateMany).not.toHaveBeenCalled();
  });

  it('admits an unpaid, unconfirmed guest and persists the entry timestamp', async () => {
    const result = await controller.checkIn({ token });
    expect(result.status).toBe('admitted');
    expect(result.guest.checkedInAt).toBeInstanceOf(Date);
    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: { ticket_token: token, checked_in_at: null },
      data: { checked_in_at: expect.any(Date), updated_at: expect.any(Date) },
    });
    expect(guest.is_paid).toBe(false);
    expect(guest.is_confirmed).toBe(false);
  });

  it('preserves the first entry on repeated scans, including a retry after a lost response', async () => {
    const first = await controller.checkIn({ token });
    const next = await controller.checkIn({ token });
    expect(next.status).toBe('already_used');
    expect(next.guest.checkedInAt).toEqual(first.guest.checkedInAt);
    expect(await controller.getGuestTicket(id)).toEqual({ token, path: `/ingresso/${token}` });
  });

  it('uses a conditional write so simultaneous requests have only one winner', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => controller.checkIn({ token })));
    expect(results.filter((result) => result.status === 'admitted')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'already_used')).toHaveLength(9);
    expect(new Set(results.map((result) => result.guest.checkedInAt))).toHaveProperty('size', 1);
  });

  it.each([undefined, null, '', 'not-a-ticket', { token }, '/ingresso/' + token])('rejects malformed input before touching the database: %p', async (value) => {
    await expect(controller.checkIn({ token: value })).rejects.toThrow(BadRequestException);
    expect(delegate.updateMany).not.toHaveBeenCalled();
  });

  it('normalizes UUID case and whitespace', async () => {
    expect((await controller.checkIn({ token: ` ${token.toUpperCase()} ` })).status).toBe('admitted');
  });

  it('rejects unknown or deleted guests', async () => {
    guest = null;
    await expect(controller.getGuestTicket(id)).rejects.toThrow(NotFoundException);
    await expect(controller.getTicket(token)).rejects.toThrow(NotFoundException);
    await expect(controller.checkIn({ token })).rejects.toThrow(NotFoundException);
  });

  it('never reports success when the database write fails', async () => {
    delegate.updateMany.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(controller.checkIn({ token })).rejects.toThrow('Database unavailable');
    expect(guest.checked_in_at).toBeNull();
  });
});
