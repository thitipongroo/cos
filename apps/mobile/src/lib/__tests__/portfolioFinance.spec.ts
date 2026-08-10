import { toDecimal } from '@cos/financial';
import {
  portfolioTotals,
  portfolioVariance,
  shareOfBudget,
  varianceExceedsThreshold,
  VARIANCE_ALERT_THRESHOLD,
  type ProjectFinance,
} from '../portfolioFinance';

const row = (over: Partial<ProjectFinance>): ProjectFinance => ({
  projectId: 'p1',
  projectName: 'Skyline Tower',
  projectCode: 'PRJ-4092',
  currency: 'THB',
  totalBudget: '0.0000',
  allocated: '0.0000',
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
    // One decimal — the drawing's format for this slot, and a whole percent of ฿1.24B is ฿12M.
    expect(shareOfBudget('842000000', '1240000000')).toBe(67.9);
    expect(shareOfBudget(toDecimal('610000000'), toDecimal('1240000000'))).toBe(49.2);
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

describe('portfolioVariance', () => {
  it('is the server’s own formula: (actual + committed − allocated) / allocated', () => {
    // 55 + 50 − 100 = 5 over an allocation of 100 → +5%. Matches FinanceService.getBudgetSummary,
    // so the tile and the per-project figure can never disagree about what "variance" means.
    const totals = portfolioTotals([row({ allocated: '100', committed: '50', actual: '55' })]);
    expect(portfolioVariance(totals)).toBe(5);
  });

  it('is negative when the portfolio is running under its allocation', () => {
    const totals = portfolioTotals([row({ allocated: '100', committed: '20', actual: '30' })]);
    expect(portfolioVariance(totals)).toBe(-50);
  });

  it('is null when nothing has been allocated — there is no denominator', () => {
    expect(portfolioVariance(portfolioTotals([]))).toBeNull();
    expect(portfolioVariance(portfolioTotals([row({ allocated: '0', actual: '10' })]))).toBeNull();
  });

  it('sums allocations across the portfolio before dividing, not per project', () => {
    const totals = portfolioTotals([
      row({ projectId: 'a', allocated: '100', actual: '110' }),
      row({ projectId: 'b', allocated: '300', actual: '290' }),
    ]);
    // 400 spent against 400 allocated is level overall, even though one project is 10% over.
    expect(portfolioVariance(totals)).toBe(0);
  });
});

describe('varianceExceedsThreshold', () => {
  it('uses the platform’s own default alert threshold', () => {
    // DEFAULT_VARIANCE_THRESHOLD in finance.service.ts — the value stored on every budget row and
    // reported as `threshold_exceeded` on finance.variance.alert.v1.
    expect(VARIANCE_ALERT_THRESHOLD).toBe(10);
    expect(varianceExceedsThreshold(10)).toBe(false); // the server alerts ABOVE it, not at it
    expect(varianceExceedsThreshold(10.1)).toBe(true);
  });

  it('never alerts on an underspend, however large', () => {
    expect(varianceExceedsThreshold(-40)).toBe(false);
  });

  it('does not alert on a figure that could not be computed', () => {
    expect(varianceExceedsThreshold(null)).toBe(false);
  });
});
