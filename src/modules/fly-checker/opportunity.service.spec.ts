import { OpportunityService } from './opportunity.service';
describe('FlyChecker opportunity rules', () => {
  const rules = new OpportunityService();
  it('does not invent a historical low on the first observation', () => {
    expect(rules.evaluate(4200, 3500, { average: null, low: null, samples: 0, days: 0 })).toEqual(
      []
    );
    expect(rules.evaluate(3150, 3500, { average: null, low: null, samples: 0, days: 0 })).toEqual([
      'Preço abaixo do limite configurado',
    ]);
  });
  it('reports all qualifying reasons with sufficient comparable history', () => {
    expect(
      rules.evaluate(3150, 3500, { average: 4500, low: 4200, samples: 4, days: 2 })
    ).toHaveLength(3);
  });
  it('requires multiple days for the average rule', () => {
    expect(rules.evaluate(3000, 2000, { average: 5000, low: 2900, samples: 15, days: 1 })).toEqual(
      []
    );
  });
  it('never repeats the same fare, even after the cooldown expires', () => {
    expect(rules.shouldNotify(3150, 3150, { price: 3150, sentAt: new Date(0) })).toBe(false);
    expect(rules.shouldNotify(3100, 3150, null)).toBe(false);
  });
  it('allows a relevant improvement but limits new itineraries during cooldown', () => {
    const last = { price: 4000, sentAt: new Date() };
    expect(rules.shouldNotify(3800, 4000, last)).toBe(true);
    expect(rules.shouldNotify(3990, null, last)).toBe(false);
    expect(rules.shouldNotify(3900, null, { ...last, sentAt: new Date(0) })).toBe(true);
  });
});
