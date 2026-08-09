import { committedSpend, openRfqCount, urgentRfqCount } from '../procurementKpi';

const NOW = new Date(2026, 7, 10, 12, 0, 0);
const inHours = (h: number): string => new Date(NOW.getTime() + h * 3_600_000).toISOString();

describe('committedSpend', () => {
  it('excludes the two statuses that are not a commitment yet', () => {
    const total = committedSpend([
      { status: 'DRAFT', total_amount: '1000.0000' },
      { status: 'PENDING_APPROVAL', total_amount: '2000.0000' },
      { status: 'APPROVED', total_amount: '3000.0000' },
    ]);
    expect(total.toString()).toBe('3000');
  });

  it('counts PAID and DISPUTED — both are still commitments', () => {
    const total = committedSpend([
      { status: 'PAID', total_amount: '500.0000' },
      { status: 'DISPUTED', total_amount: '250.0000' },
    ]);
    expect(total.toString()).toBe('750');
  });

  it('sums exactly, where a float sum would not', () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point. This is why the platform mandates decimal.js for
    // money, and why this function returns a Decimal rather than a number.
    const total = committedSpend([
      { status: 'APPROVED', total_amount: '0.1000' },
      { status: 'APPROVED', total_amount: '0.2000' },
    ]);
    expect(total.toString()).toBe('0.3');
  });

  it('is zero for an empty list, not null', () => {
    // "Nothing committed" is a real answer; a dash would read as "we could not find out".
    expect(committedSpend([]).toString()).toBe('0');
  });
});

describe('openRfqCount', () => {
  it('counts only RFQs still out to vendors', () => {
    expect(
      openRfqCount([
        { status: 'PUBLISHED' },
        { status: 'PUBLISHED' },
        { status: 'DRAFT' },
        { status: 'EVALUATED' },
        { status: 'AWARDED' },
        { status: 'CANCELLED' },
      ]),
    ).toBe(2);
  });
});

describe('urgentRfqCount', () => {
  it('counts published RFQs closing inside the window, including overdue', () => {
    expect(
      urgentRfqCount(
        [
          { status: 'PUBLISHED', deadline: inHours(3) },
          { status: 'PUBLISHED', deadline: inHours(-2) },
          { status: 'PUBLISHED', deadline: inHours(72) },
        ],
        NOW,
      ),
    ).toBe(2);
  });

  it('ignores an RFQ that is no longer open, however close its deadline', () => {
    // An awarded RFQ has no deadline left to miss; counting it would keep the figure high after the
    // work was already done.
    expect(
      urgentRfqCount(
        [
          { status: 'AWARDED', deadline: inHours(1) },
          { status: 'CANCELLED', deadline: inHours(-1) },
        ],
        NOW,
      ),
    ).toBe(0);
  });
});
