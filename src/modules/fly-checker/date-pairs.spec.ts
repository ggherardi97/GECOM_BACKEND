import { datePairs } from './date-pairs';
describe('FlyChecker date windows', () => {
  const now = new Date('2026-09-28T12:00:00Z');
  const input = {
    departure_start: '2026-10-01',
    departure_end: '2026-10-02',
    return_start: '2026-10-05',
    return_end: '2026-10-06',
  };
  it('covers every valid combination, including both boundaries', () => {
    expect(datePairs(input, 25, now)).toEqual([
      { departure: '2026-10-01', returning: '2026-10-05' },
      { departure: '2026-10-01', returning: '2026-10-06' },
      { departure: '2026-10-02', returning: '2026-10-05' },
      { departure: '2026-10-02', returning: '2026-10-06' },
    ]);
  });
  it('rejects invalid calendar dates and reversed intervals', () => {
    expect(() => datePairs({ ...input, departure_start: '2026-02-30' }, 25, now)).toThrow(
      'Data inválida'
    );
    expect(() => datePairs({ ...input, departure_end: '2026-09-01' }, 25, now)).toThrow(
      'Intervalos inválidos'
    );
  });
  it('rejects excessive combinations instead of silently sampling', () => {
    expect(() => datePairs(input, 3, now)).toThrow('máximo de 3');
  });
  it('skips expired outbound dates and returns no dates after expiration', () => {
    expect(datePairs(input, 25, new Date('2026-10-01'))).toHaveLength(2);
    expect(datePairs(input, 25, new Date('2026-10-02'))).toEqual([]);
  });
  it('never accepts a return at or before departure', () => {
    expect(
      datePairs({ ...input, return_start: '2026-10-01', return_end: '2026-10-02' }, 25, now)
    ).toEqual([{ departure: '2026-10-01', returning: '2026-10-02' }]);
  });
});
