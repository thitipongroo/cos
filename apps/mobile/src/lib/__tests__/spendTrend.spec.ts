import { spendTrend, TREND_WINDOW_DAYS, type CostTransaction } from '../spendTrend';

const NOW = new Date('2026-08-10T00:00:00Z');

/** `daysAgo` days before NOW, as the DATE string the API returns. */
const on = (daysAgo: number): string =>
  new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10);

const tx = (daysAgo: number, amount: string, source_type = 'INVOICE'): CostTransaction => ({
  source_type,
  amount,
  transaction_date: on(daysAgo),
});

describe('spendTrend', () => {
  it('compares month against month by default — how construction money is claimed', () => {
    expect(TREND_WINDOW_DAYS).toBe(30);
  });

  it('compares this window with the one before it', () => {
    // 120 last month, 126 this month → +5%.
    expect(spendTrend([tx(10, '126'), tx(40, '120')], ['INVOICE'], NOW)).toEqual({
      percent: 5,
      direction: 'up',
    });
  });

  it('points down when spend fell', () => {
    expect(spendTrend([tx(5, '90'), tx(45, '100')], ['INVOICE'], NOW)).toEqual({
      percent: -10,
      direction: 'down',
    });
  });

  it('is flat when the two windows match', () => {
    expect(spendTrend([tx(5, '100'), tx(45, '100')], ['INVOICE'], NOW)).toEqual({
      percent: 0,
      direction: 'flat',
    });
  });

  it('separates commitments from spend by source_type', () => {
    // Purchase orders are commitments; invoices are money actually gone. One tile each.
    const rows = [
      tx(5, '200', 'PURCHASE_ORDER'),
      tx(45, '100', 'PURCHASE_ORDER'),
      tx(5, '50', 'INVOICE'),
      tx(45, '100', 'INVOICE'),
    ];
    expect(spendTrend(rows, ['PURCHASE_ORDER'], NOW)?.percent).toBe(100);
    expect(spendTrend(rows, ['INVOICE'], NOW)?.percent).toBe(-50);
  });

  it('is null when there is no baseline to compare against', () => {
    // A change against nothing is undefined. "+100%" for every first month would be a number about
    // the arithmetic, not about the project.
    expect(spendTrend([tx(5, '100')], ['INVOICE'], NOW)).toBeNull();
    expect(spendTrend([], ['INVOICE'], NOW)).toBeNull();
  });

  it('ignores anything older than the two windows', () => {
    expect(spendTrend([tx(5, '110'), tx(45, '100'), tx(400, '9999')], ['INVOICE'], NOW)).toEqual({
      percent: 10,
      direction: 'up',
    });
  });

  it('splits the two windows on whole days, with no day in both and none skipped', () => {
    // Today and the 29 days before it are the current window; the 30 days before THAT are the
    // baseline. Day 29 is the last current day, day 30 the first baseline day.
    expect(spendTrend([tx(0, '60'), tx(29, '60'), tx(30, '100')], ['INVOICE'], NOW)).toEqual({
      percent: 20,
      direction: 'up',
    });
    // Day 59 is the last baseline day; day 60 is outside both.
    expect(spendTrend([tx(0, '100'), tx(59, '50'), tx(60, '9999')], ['INVOICE'], NOW)).toEqual({
      percent: 100,
      direction: 'up',
    });
  });

  it('does not depend on the time of day the screen was opened', () => {
    // `transaction_date` is a DATE. Comparing it against a live instant made a transaction dated
    // today count or not depending on whether the clock had passed midnight.
    const rows = [tx(0, '110'), tx(40, '100')];
    const midnight = spendTrend(rows, ['INVOICE'], new Date('2026-08-10T00:00:00Z'));
    const evening = spendTrend(rows, ['INVOICE'], new Date('2026-08-10T23:59:59Z'));
    expect(midnight).toEqual(evening);
    expect(midnight).toEqual({ percent: 10, direction: 'up' });
  });

  it('honours a different window length', () => {
    // A 7-day window: only the last fortnight is in play.
    expect(spendTrend([tx(2, '60'), tx(9, '50'), tx(20, '999')], ['INVOICE'], NOW, 7)).toEqual({
      percent: 20,
      direction: 'up',
    });
  });

  it('skips a row whose date the API could not have produced', () => {
    const rows = [
      { source_type: 'INVOICE', amount: '10', transaction_date: 'not-a-date' },
      tx(5, '110'),
      tx(45, '100'),
    ];
    expect(spendTrend(rows, ['INVOICE'], NOW)?.percent).toBe(10);
  });

  it('adds through decimal.js — these are the largest figures in the product', () => {
    const rows = [tx(5, '0.1'), tx(5, '0.2'), tx(45, '0.3')];
    expect(spendTrend(rows, ['INVOICE'], NOW)).toEqual({ percent: 0, direction: 'flat' });
  });
});
