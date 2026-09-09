import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { ScarletDriveController } from './scarlet-drive.controller';
import { ScarletDriveRepository } from './scarlet-drive.repository';
import { ScarletDriveService } from './scarlet-drive.service';

describe('ScarletDriveController guest updates', () => {
  const req = { headers: {}, socket: {} } as Request;
  const tx = {};
  let controller: ScarletDriveController;
  let repository: {
    transaction: jest.Mock;
    findGuestById: jest.Mock;
    listGuests: jest.Mock;
    listRepertoireSongs: jest.Mock;
    listVoteSessions: jest.Mock;
    updateGuest: jest.Mock;
  };
  let current: { id: string; name: string; invited_by: string; is_paid: boolean; is_confirmed: boolean };

  beforeEach(() => {
    current = { id: 'guest-1', name: 'Maria', invited_by: 'Diogo', is_paid: true, is_confirmed: true };
    repository = {
      transaction: jest.fn(async (callback) => callback(tx)),
      findGuestById: jest.fn(async () => current),
      listGuests: jest.fn(async () => [current]),
      listRepertoireSongs: jest.fn(async () => []),
      listVoteSessions: jest.fn(async () => []),
      updateGuest: jest.fn(async (_id, data) => Object.assign(current, data)),
    };
    controller = new ScarletDriveController(new ScarletDriveService(repository as unknown as ScarletDriveRepository));
  });

  it.each([
    ['isPaid', 'is_paid'],
    ['isConfirmed', 'is_confirmed'],
    ['pago', 'is_paid'],
    ['confirmed', 'is_confirmed'],
  ])('updates only %s and preserves omitted fields', async (field, storedField) => {
    for (const value of [false, true, 'false', 'true']) {
      const expected = { ...current, [storedField]: value === true || value === 'true' };
      const result = await controller.updateGuest(req, current.id, { [field]: value });

      expect(repository.updateGuest).toHaveBeenLastCalledWith(current.id, {
        name: expected.name,
        invited_by: expected.invited_by,
        is_paid: expected.is_paid,
        is_confirmed: expected.is_confirmed,
      }, tx);
      expect(result.guests[0]).toMatchObject({
        name: expected.name,
        invitedBy: expected.invited_by,
        isPaid: expected.is_paid,
        isConfirmed: expected.is_confirmed,
      });
    }
  });

  it('updates payment and confirmation together without a name', async () => {
    current.is_paid = false;
    current.is_confirmed = false;
    const result = await controller.updateGuest(req, current.id, { isPaid: true, isConfirmed: true });
    expect(result.guests[0]).toMatchObject({ name: 'Maria', invitedBy: 'Diogo', isPaid: true, isConfirmed: true });
  });

  it('preserves payment and confirmation when editing only the name', async () => {
    const result = await controller.updateGuest(req, current.id, { name: 'Maria Silva' });
    expect(result.guests[0]).toMatchObject({ name: 'Maria Silva', invitedBy: 'Diogo', isPaid: true, isConfirmed: true });
  });

  it('keeps explicit false values when aliases are also present', async () => {
    const result = await controller.updateGuest(req, current.id, {
      name: 'Maria', invitedBy: 'Diogo', isPaid: false, pago: true, isConfirmed: false, confirmed: true,
    });
    expect(result.guests[0]).toMatchObject({ isPaid: false, isConfirmed: false });
  });

  it.each(['', '   ', null])('rejects an explicitly empty name (%p)', async (name) => {
    await expect(controller.updateGuest(req, current.id, { name })).rejects.toThrow('Nome do convidado e obrigatorio.');
    expect(repository.updateGuest).not.toHaveBeenCalled();
  });

  it('still requires a name when creating a guest', async () => {
    await expect(controller.createGuest(req, { invitedBy: 'Diogo', isPaid: true })).rejects.toThrow(BadRequestException);
  });
});
