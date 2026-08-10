import { toDecimal } from '@cos/financial';
import { portfolioTotals, shareOfBudget, type ProjectFinance } from '../portfolioFinance';

const row = (over: Partial<ProjectFinance>): ProjectFinance => ({
  projectId: 'p1',
  projectName: 'Skyline Tower',
  projectCode: 'PRJ-4092',
  currency: 'THB',
  totalBudget: '0.0000',
  committed: '0.0000',
  actual: '0.0000',
  ...over,
});

describe('portfolioTotals', () => {
  it('sums the three figures across the manager’s projects', () => {
    const totals = portfolioTotals([
      row({
        projectId: 'a',
        totalBudget: '450000000.0000',
        committed: '12000000.0000',
        actual: '8000000.0000',
      }),
      row({
        projectId: 'b',
        totalBudget: '320000000.0000',
        committed: '5000000.0000',
        actual: '3000000.0000',
      }),
    ]);
    expect(totals.totalBudget.toFixed(0)).toBe('770000000');
    expect(totals.committed.toFixed(0)).toBe('17000000');
    expect(totals.actual.toFixed(0)).toBe('11000000');
    expect(totals.currency).toBe('THB');
    expect(totals.included).toBe(2);
    expect(totals.excluded).toBe(0);
  });

  it('adds without float error, which at hundreds of millions is no longer invisible', () => {
    const totals = portfolioTotals([
      row({ projectId: 'a', totalBudget: '0.1' }),
      row({ projectId: 'b', totalBudget: '0.2' }),
    ]);
    expect(totals.totalBudget.toFixed(1)).toBe('0.3'); // 0.1 + 0.2 !== 0.30000000000000004
  });

  it('totals one currency and reports what it left out, rather than adding ฿ to $', () => {
    // A mixed total is true in no currency, and no client-side rate exists to convert with.
    const totals = portfolioTotals([
      row({ projectId: 'a', totalBudget: '100', currency: 'THB' }),
      row({ projectId: 'b', totalBudget: '200', currency: 'THB' }),
      row({ projectId: 'c', totalBudget: '999', currency: 'USD' }),
    ]);
    expect(totals.currency).toBe('THB');
    expect(totals.totalBudget.toFixed(0)).toBe('300');
    expect(totals.included).toBe(2);
    expect(totals.excluded).toBe(1);
  });

  it('breaks a currency tie in favour of the one seen first', () => {
    const totals = portfolioTotals([
      row({ projectId: 'a', totalBudget: '10', currency: 'usd' }),
      row({ projectId: 'b', totalBudget: '20', currency: 'THB' }),
    ]);
    expect(totals.currency).toBe('USD'); // matched case-insensitively, reported normalised
    expect(totals.totalBudget.toFixed(0)).toBe('10');
    expect(totals.excluded).toBe(1);
  });

  it('reports an empty portfolio as zero, not as an error', () => {
    const totals = portfolioTotals([]);
    expect(totals.currency).toBeNull();
    expect(totals.totalBudget.toFixed(0)).toBe('0');
    expect(totals.committed.toFixed(0)).toBe('0');
    expect(totals.actual.toFixed(0)).toBe('0');
    expect(totals.included).toBe(0);
    expect(totals.excluded).toBe(0);
  });
});

describe('shareOfBudget', () => {
  it('is a whole percentage of the budget', () => {
    expect(shareOfBudget('842000000', '1240000000')).toBe(68);
    expect(shareOfBudget(toDecimal('610000000'), toDecimal('1240000000'))).toBe(49);
  });

  it('is null when there is no budget to divide by', () => {
    // Nothing to be a share OF — the tile prints a placeholder instead of a confident 0%.
    expect(shareOfBudget('10', '0')).toBeNull();
    expect(shareOfBudget('10', '-5')).toBeNull();
  });

  it('is null rather than NaN when a figure is not finite', () => {
    expect(shareOfBudget(Infinity, '100')).toBeNull();
    expect(shareOfBudget('100', Infinity)).toBeNull();
  });

  it('can exceed 100 — an overrun is a real answer, not a clamped one', () => {
    expect(shareOfBudget('150', '100')).toBe(150);
  });
});
