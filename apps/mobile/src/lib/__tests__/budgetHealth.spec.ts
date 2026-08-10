import { budgetHealth, budgetFraction, WARNING_AT } from '../budgetHealth';

describe('budgetHealth', () => {
  it('warns at the platform-wide 80% edge', () => {
    // Same edge as the AI token quota (§31.3) and the photo queue (§17.7) — "we are warning you"
    // means one thing across the product.
    expect(WARNING_AT).toBe(0.8);
    expect(budgetHealth('79', '100')).toBe('HEALTHY');
    expect(budgetHealth('80', '100')).toBe('WARNING');
    expect(budgetHealth('99.99', '100')).toBe('WARNING');
  });

  it('calls an overrun at the allocation, not past it', () => {
    expect(budgetHealth('100', '100')).toBe('OVERRUN');
    expect(budgetHealth('140', '100')).toBe('OVERRUN');
  });

  it('reads DECIMAL strings, which is how the API returns money', () => {
    expect(budgetHealth('45000000.0000', '120000000.0000')).toBe('HEALTHY');
  });

  it('reports UNKNOWN for a project with no budget rather than an instant overrun', () => {
    // No allocation recorded is not overspending — and dividing by it would raise the loudest
    // possible alarm from missing data.
    expect(budgetHealth('10', '0')).toBe('UNKNOWN');
    expect(budgetHealth('10', null)).toBe('UNKNOWN');
    expect(budgetHealth(null, '100')).toBe('UNKNOWN');
    expect(budgetHealth('abc', '100')).toBe('UNKNOWN');
  });
});

describe('budgetFraction', () => {
  it('is the spend ratio inside the track', () => {
    expect(budgetFraction('25', '100')).toBeCloseTo(0.25);
  });

  it('clamps an overrun at full instead of running off the card', () => {
    expect(budgetFraction('250', '100')).toBe(1);
  });

  it('is zero when there is nothing to divide by', () => {
    expect(budgetFraction('10', '0')).toBe(0);
    expect(budgetFraction(null, null)).toBe(0);
  });

  it('never goes negative on a credited row', () => {
    expect(budgetFraction('-5', '100')).toBe(0);
  });
});
