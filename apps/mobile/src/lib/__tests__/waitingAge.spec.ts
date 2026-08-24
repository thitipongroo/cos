import { waitingAge } from '../waitingAge';

// Local Date constructor, not a fixed-offset ISO string — the trap that made the shift-hours spec
// pass on a UTC+7 machine and fail on CI.
const NOW = new Date(2026, 7, 10, 12, 0, 0);
const hoursBefore = (h: number): string => new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe('waitingAge', () => {
  it('reads under an hour as "just now" rather than counting minutes', () => {
    expect(waitingAge(hoursBefore(0.9), NOW)).toEqual({ unit: 'now' });
  });

  it('counts whole hours up to a day', () => {
    expect(waitingAge(hoursBefore(2), NOW)).toEqual({ unit: 'hours', value: 2 });
    expect(waitingAge(hoursBefore(23.9), NOW)).toEqual({ unit: 'hours', value: 23 });
  });

  it('switches to whole days at 24 hours', () => {
    expect(waitingAge(hoursBefore(24), NOW)).toEqual({ unit: 'days', value: 1 });
    expect(waitingAge(hoursBefore(75), NOW)).toEqual({ unit: 'days', value: 3 });
  });

  it('treats a future timestamp as "just now" instead of a negative age', () => {
    // Clock skew between device and server — never render "-3h".
    expect(waitingAge(hoursBefore(-3), NOW)).toEqual({ unit: 'now' });
  });

  it('has nothing to measure without a timestamp', () => {
    expect(waitingAge(null, NOW)).toBeNull();
    expect(waitingAge(undefined, NOW)).toBeNull();
    expect(waitingAge('', NOW)).toBeNull();
    expect(waitingAge('not-a-date', NOW)).toBeNull();
  });
});
