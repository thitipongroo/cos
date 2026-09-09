// The RFQ decision countdown. QM-1: this module is measured at 100% lines and branches.
//
// The value of these cases is the ROUNDING, in both directions and for opposite reasons — see the
// two comments in the module. Getting either backwards makes a screen tell a buyer they have more
// time than they do.

import { deadlineCountdown, URGENT_MS } from '../approvalDeadline';

const NOW = new Date('2026-09-09T12:00:00.000Z');
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

describe('deadlineCountdown', () => {
  it('draws no chip where there is no deadline at all', () => {
    // A purchase order has no decision deadline. Three shapes of "none", one answer.
    expect(deadlineCountdown(null, NOW)).toBeNull();
    expect(deadlineCountdown(undefined, NOW)).toBeNull();
    expect(deadlineCountdown('', NOW)).toBeNull();
  });

  it('draws no chip for a value it cannot parse, rather than a wrong one', () => {
    expect(deadlineCountdown('not a date', NOW)).toBeNull();
  });

  it('calls a passed deadline overdue, and urgent', () => {
    expect(deadlineCountdown(at(-1), NOW)).toEqual({ state: 'OVERDUE', urgent: true });
  });

  it('treats the exact moment of the deadline as passed', () => {
    // The boundary belongs to OVERDUE: at t=0 there is no time left to decide in.
    expect(deadlineCountdown(at(0), NOW)).toEqual({ state: 'OVERDUE', urgent: true });
  });

  it('rounds hours UP, so half an hour left is never zero', () => {
    expect(deadlineCountdown(at(30 * 60 * 1000), NOW)).toEqual({
      state: 'HOURS',
      hours: 1,
      urgent: true,
    });
    expect(deadlineCountdown(at(4 * 60 * 60 * 1000), NOW)).toEqual({
      state: 'HOURS',
      hours: 4,
      urgent: true,
    });
  });

  it('is still HOURS one millisecond under the urgent threshold', () => {
    expect(deadlineCountdown(at(URGENT_MS - 1), NOW)).toEqual({
      state: 'HOURS',
      hours: 24,
      urgent: true,
    });
  });

  it('stops being urgent exactly at 24 hours', () => {
    expect(deadlineCountdown(at(URGENT_MS), NOW)).toEqual({
      state: 'DAYS',
      days: 1,
      urgent: false,
    });
  });

  it('rounds days DOWN, so 47 hours is one day and not two', () => {
    expect(deadlineCountdown(at(47 * 60 * 60 * 1000), NOW)).toEqual({
      state: 'DAYS',
      days: 1,
      urgent: false,
    });
    expect(deadlineCountdown(at(2 * URGENT_MS), NOW)).toEqual({
      state: 'DAYS',
      days: 2,
      urgent: false,
    });
  });
});
