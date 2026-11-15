// Bangkok (UTC+7), where the UTC day and the local day differ before 07:00. Set before any Date is
// made; Node re-reads TZ when it changes.
process.env['TZ'] = 'Asia/Bangkok';

/**
 * Locale-aware formatting — QM-3 (never raw string concatenation for money or dates).
 *
 * §35.13 ESC-25: apps/web had no unit tests. Every figure a user reads passes through here, and
 * Thai display uses the Buddhist calendar, so the assertions below pin the BCP-47 tag rather than
 * a rendered string wherever the exact Intl output is runtime-dependent.
 */
import {
  defaultDateRange,
  localDatetimeInput,
  localIsoDate,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPercent,
  formatTime,
  localeTag,
} from '../format';

describe('localeTag', () => {
  it('uses the Buddhist calendar for Thai (QM-3)', () => {
    expect(localeTag('th')).toBe('th-TH-u-ca-buddhist');
  });

  it('uses en-US for English', () => {
    expect(localeTag('en')).toBe('en-US');
  });
});

describe('defaultDateRange', () => {
  it('returns two ISO dates separated by a comma', () => {
    expect(defaultDateRange()).toMatch(/^\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2}$/);
  });

  it('spans the last 90 days', () => {
    const [start, end] = defaultDateRange().split(',') as [string, string];
    const days = (Date.parse(end) - Date.parse(start)) / 86_400_000;
    // 90 exactly, allowing one day of slack for a DST boundary inside the window
    expect(days).toBeGreaterThanOrEqual(89);
    expect(days).toBeLessThanOrEqual(91);
  });

  it('ends on the LOCAL today, also before 07:00 in Bangkok', () => {
    // 03:00 on 11 Aug in Bangkok is 20:00 on the 10th in UTC; the window used to end on the 10th.
    const early = new Date('2026-08-10T20:00:00Z');
    expect(defaultDateRange(early)).toBe('2026-05-13,2026-08-11');
  });
});

describe('formatMoney', () => {
  it('renders an em dash for a null amount', () => {
    // A missing budget must read as "not set", never as 0.
    expect(formatMoney('th', null, 'THB')).toBe('—');
    expect(formatMoney('en', null, null)).toBe('—');
  });

  it('returns the raw string when the amount is not a number', () => {
    expect(formatMoney('en', 'not-a-number', 'THB')).toBe('not-a-number');
  });

  it('formats a currency amount with the currency style', () => {
    const out = formatMoney('en', '1500000', 'THB');
    expect(out).toContain('1,500,000');
    // currency style must render a symbol or code, not a bare number
    expect(out).not.toBe('1,500,000');
  });

  it('formats without a currency as a plain decimal', () => {
    expect(formatMoney('en', '1500000', null)).toBe('1,500,000');
  });

  it('rounds to whole units', () => {
    expect(formatMoney('en', '1500000.87', null)).toBe('1,500,001');
  });

  it('handles zero and negatives', () => {
    expect(formatMoney('en', '0', null)).toBe('0');
    expect(formatMoney('en', '-2500', null)).toBe('-2,500');
  });

  it('formats Thai amounts through the Thai tag', () => {
    expect(formatMoney('th', '1500000', 'THB')).toContain('1,500,000');
  });
});

describe('formatPercent', () => {
  it('treats the input as a percentage value, not a fraction', () => {
    // 12.5 means 12.5%, so the formatter divides by 100 before applying the percent style.
    expect(formatPercent('en', 12.5)).toBe('12.5%');
  });

  it('keeps at most one fraction digit', () => {
    expect(formatPercent('en', 12.34)).toBe('12.3%');
  });

  it('handles zero and negatives', () => {
    expect(formatPercent('en', 0)).toBe('0%');
    expect(formatPercent('en', -5)).toBe('-5%');
  });

  it('formats over 100%', () => {
    expect(formatPercent('en', 120)).toBe('120%');
  });

  it('formats through the Thai tag without throwing', () => {
    expect(typeof formatPercent('th', 12.5)).toBe('string');
  });
});

describe('formatDate', () => {
  it('renders an em dash for a null or empty date', () => {
    expect(formatDate('th', null)).toBe('—');
    expect(formatDate('en', '')).toBe('—');
  });

  it('formats an ISO date in medium style', () => {
    const out = formatDate('en', '2026-06-08T00:00:00Z');
    expect(out).toContain('2026');
    expect(out).toMatch(/Jun/);
  });

  it('renders the Thai locale in the Buddhist era', () => {
    // 2026 CE is 2569 BE — the whole point of the th-TH-u-ca-buddhist tag.
    expect(formatDate('th', '2026-06-08T00:00:00Z')).toContain('2569');
  });

  it('accepts a date-only ISO string', () => {
    expect(formatDate('en', '2026-06-08')).toContain('2026');
  });
});

describe('formatDateTime', () => {
  it('renders — for a missing timestamp', () => {
    expect(formatDateTime('en', null)).toBe('—');
    expect(formatDateTime('th', '')).toBe('—');
  });

  it('includes the seconds', () => {
    const out = formatDateTime('en', '2026-06-08T10:14:22Z');
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });
});

describe('formatTime', () => {
  it('renders — for a missing timestamp', () => {
    expect(formatTime('en', null)).toBe('—');
  });

  it('is the time with seconds and no year', () => {
    const out = formatTime('en', '2026-06-08T10:14:22Z');
    expect(out).toMatch(/\d{1,2}:\d{2}:\d{2}/);
    expect(out).not.toMatch(/2026/);
  });
});

describe('localIsoDate / localDatetimeInput — the local calendar and clock', () => {
  const early = new Date('2026-08-10T20:05:00Z'); // 03:05 on 11 Aug in Bangkok

  it('localIsoDate is the local day, not the UTC one', () => {
    expect(localIsoDate(early)).toBe('2026-08-11');
  });

  it('localDatetimeInput is the local wall clock a datetime-local input holds, and reads back exactly', () => {
    expect(localDatetimeInput(early)).toBe('2026-08-11T03:05');
    // The delivery form submits `new Date(value).toISOString()`: the instant must survive the trip.
    expect(new Date(localDatetimeInput(early)).toISOString()).toBe('2026-08-10T20:05:00.000Z');
  });
});
