import { resolveRelativeDateRange } from './date-range.util';

describe('date-range.util', () => {
  const fixedNow = new Date('2026-02-13T12:00:00.000Z');

  it('resolves hoje', () => {
    const range = resolveRelativeDateRange('hoje', fixedNow, 'America/Sao_Paulo');

    expect(range).not.toBeNull();
    expect(range!.from.toISOString()).toBe('2026-02-13T03:00:00.000Z');
    expect(range!.to.toISOString()).toBe('2026-02-14T02:59:59.999Z');
  });

  it('resolves ultimos 30 dias', () => {
    const range = resolveRelativeDateRange('ultimos 30 dias', fixedNow, 'America/Sao_Paulo');

    expect(range).not.toBeNull();
    const days = Math.round((range!.to.getTime() - range!.from.getTime()) / (24 * 60 * 60 * 1000));
    expect(days).toBeGreaterThanOrEqual(29);
  });

  it('resolves ultimo trimestre', () => {
    const range = resolveRelativeDateRange('ultimo trimestre', fixedNow, 'America/Sao_Paulo');

    expect(range).not.toBeNull();
    expect(range!.from.toISOString()).toBe('2025-10-01T03:00:00.000Z');
    expect(range!.to.toISOString()).toBe('2026-01-01T02:59:59.999Z');
  });
});

