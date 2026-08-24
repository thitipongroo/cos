import { hoursRemaining, isUrgent, URGENT_WITHIN_HOURS } from '../approvalUrgency';

// Built with the LOCAL Date constructor, not an ISO string with a fixed offset — the same trap that
// made the shift-hours spec pass on a UTC+7 machine and fail on CI.
const NOW = new Date(2026, 7, 10, 12, 0, 0);
const inHours = (h: number): string => new Date(NOW.getTime() + h * 3_600_000).toISOString();

describe('hoursRemaining', () => {
  it('counts whole hours to the deadline', () => {
    expect(hoursRemaining(inHours(4), NOW)).toBe(4);
    expect(hoursRemaining(inHours(47.9), NOW)).toBe(47);
  });

  it('goes negative once the deadline has passed rather than clamping to zero', () => {
    // An approval nobody made is not suddenly on time.
    expect(hoursRemaining(inHours(-3), NOW)).toBe(-3);
  });

  it('has nothing to measure for an item with no deadline — every purchase order', () => {
    expect(hoursRemaining(null, NOW)).toBeNull();
    expect(hoursRemaining(undefined, NOW)).toBeNull();
    expect(hoursRemaining('', NOW)).toBeNull();
  });

  it('treats an unparseable value as no deadline instead of rendering NaN hours', () => {
    expect(hoursRemaining('not-a-date', NOW)).toBeNull();
  });
});

describe('isUrgent', () => {
  it('fires inside the window and on its boundary', () => {
    expect(isUrgent(inHours(1), NOW)).toBe(true);
    expect(isUrgent(inHours(URGENT_WITHIN_HOURS), NOW)).toBe(true);
  });

  it('does not fire outside the window', () => {
    expect(isUrgent(inHours(URGENT_WITHIN_HOURS + 1), NOW)).toBe(false);
  });

  it('counts an overdue item as urgent', () => {
    expect(isUrgent(inHours(-5), NOW)).toBe(true);
  });

  it('is false when there is no deadline — a PO never lights the chip', () => {
    expect(isUrgent(null, NOW)).toBe(false);
  });
});
