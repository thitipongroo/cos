import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  formatDate,
  formatTime,
  lookup,
  statusLabel,
  translate,
} from '../translate';
import en from '../en.json';
import th from '../th.json';

describe('locale constants (QM-3)', () => {
  it('default locale is th and fallback is en', () => {
    expect(DEFAULT_LOCALE).toBe('th');
    expect(FALLBACK_LOCALE).toBe('en');
  });
});

describe('lookup', () => {
  it('resolves a nested dot-path key', () => {
    expect(lookup(en, 'site.reports.title')).toBe('Site Reports');
  });

  it('returns undefined for a missing key', () => {
    expect(lookup(en, 'site.reports.doesNotExist')).toBeUndefined();
  });

  it('returns undefined when the path resolves to a non-string node', () => {
    expect(lookup(en, 'site.reports')).toBeUndefined();
  });

  it('returns undefined when traversing through a leaf', () => {
    expect(lookup(en, 'site.reports.title.deeper')).toBeUndefined();
  });
});

describe('translate', () => {
  it('resolves Thai text for the th locale', () => {
    expect(translate('th', 'home.main.title')).toBe('หน้าหลัก');
  });

  it('resolves English text for the en locale', () => {
    expect(translate('en', 'home.main.title')).toBe('Home');
  });

  it('returns the key itself when missing in both locales', () => {
    expect(translate('th', 'missing.key.entirely')).toBe('missing.key.entirely');
  });

  it('formats ICU plural for count 0 / 1 / many (en)', () => {
    expect(translate('en', 'sync.statusBar.pending', { count: 0 })).toBe('0 changes pending');
    expect(translate('en', 'sync.statusBar.pending', { count: 1 })).toBe('1 change pending');
    expect(translate('en', 'sync.statusBar.pending', { count: 12 })).toBe('12 changes pending');
  });

  it('formats ICU plural for th (single "other" category)', () => {
    expect(translate('th', 'sync.statusBar.pending', { count: 1 })).toBe('1 รายการรอซิงค์');
    expect(translate('th', 'sync.statusBar.pending', { count: 5 })).toBe('5 รายการรอซิงค์');
  });

  it('formats simple ICU arguments', () => {
    expect(translate('en', 'sync.statusBar.lastSynced', { time: '10:30' })).toBe(
      'Last synced 10:30',
    );
  });

  it('reuses the cached formatter on repeat calls', () => {
    expect(translate('en', 'photos.capture.queued', { count: 1 })).toBe('1 photo queued');
    expect(translate('en', 'photos.capture.queued', { count: 3 })).toBe('3 photos queued');
  });

  it('returns the raw template when ICU arguments are missing', () => {
    expect(translate('en', 'sync.statusBar.pending')).toBe(
      '{count, plural, one {# change pending} other {# changes pending}}',
    );
  });

  it('returns plain messages without ICU formatting', () => {
    expect(translate('en', 'sync.statusBar.upToDate')).toBe('Up to date');
  });
});

describe('statusLabel', () => {
  it('translates a known status for th', () => {
    expect(statusLabel('th', 'PENDING')).toBe('รอดำเนินการ');
  });

  it('translates a known status for en', () => {
    expect(statusLabel('en', 'PENDING')).toBe('Pending');
  });

  it('returns the raw code for an unknown status', () => {
    expect(statusLabel('th', 'SOME_NEW_STATUS')).toBe('SOME_NEW_STATUS');
  });
});

describe('formatDate (Buddhist Era for th — QM-3)', () => {
  it('renders 2026 CE as 2569 BE for th', () => {
    expect(formatDate(new Date(2026, 6, 4), 'th')).toContain('2569');
  });

  it('renders the Gregorian year for en', () => {
    expect(formatDate(new Date(2026, 6, 4), 'en')).toContain('2026');
  });

  it('accepts ISO strings', () => {
    expect(formatDate('2026-07-04', 'th')).toContain('2569');
  });

  it('returns an empty string for an invalid date', () => {
    expect(formatDate('not-a-date', 'th')).toBe('');
  });
});

describe('formatTime', () => {
  it('formats a time of day', () => {
    const out = formatTime(new Date(2026, 6, 4, 14, 30), 'th');
    expect(out).toContain('14');
    expect(out).toContain('30');
  });

  it('accepts ISO strings', () => {
    expect(formatTime('2026-07-04T09:05:00', 'en')).not.toBe('');
  });

  it('returns an empty string for an invalid date', () => {
    expect(formatTime('nope', 'en')).toBe('');
  });
});

describe('key parity th ↔ en', () => {
  const flatten = (obj: Record<string, unknown>, prefix = ''): string[] =>
    Object.entries(obj).flatMap(([k, v]) => {
      const key = prefix ? `${prefix}.${k}` : k;
      return v && typeof v === 'object' ? flatten(v as Record<string, unknown>, key) : [key];
    });

  it('en.json and th.json contain exactly the same keys', () => {
    expect(flatten(th).sort()).toEqual(flatten(en).sort());
  });
});
