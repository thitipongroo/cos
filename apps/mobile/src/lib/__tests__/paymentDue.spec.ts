import { paymentDueState } from '../paymentDue';

describe('paymentDueState', () => {
  // 23:30 local on 17 September — late enough that the UTC date would already differ in Bangkok.
  const now = new Date(2026, 8, 17, 23, 30);

  it('reads a past date as overdue', () => {
    expect(paymentDueState('2026-09-16', now)).toBe('overdue');
  });

  it('reads the local calendar day as today, whatever the hour', () => {
    expect(paymentDueState('2026-09-17', now)).toBe('today');
  });

  it('reads the next local day as tomorrow, across a month end too', () => {
    expect(paymentDueState('2026-09-18', now)).toBe('tomorrow');
    expect(paymentDueState('2026-10-01', new Date(2026, 8, 30, 9, 0))).toBe('tomorrow');
  });

  it('reads anything after tomorrow as later, and ignores a time suffix', () => {
    expect(paymentDueState('2026-09-19', now)).toBe('later');
    expect(paymentDueState('2026-09-17T00:00:00.000Z', now)).toBe('today');
  });
});
