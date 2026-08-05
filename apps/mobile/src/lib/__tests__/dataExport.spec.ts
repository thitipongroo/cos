// PDPA export display logic (ADR-078).
//
// The assertion that matters most is the one about promises: the mockup's success state told the
// subject their archive would arrive "within 24 hours", and no such commitment exists anywhere —
// not in ADR-078, not in the workflow, and not in PDPA §30, which allows thirty days. The screen
// reports the request's real state instead, and these tests are what keep an SLA from creeping back
// in through a default.

import {
  canSubmitExport,
  daysUntil,
  describeExport,
  isCompleteStepUpCode,
  toggleCategory,
} from '../dataExport';
import type { DataExportRequest } from '../../api/dataExport';

const NOW = Date.parse('2026-08-05T00:00:00.000Z');

const request = (over: Partial<DataExportRequest> = {}): DataExportRequest => ({
  exportId: 'e1',
  status: 'READY',
  categories: ['identity'],
  format: 'JSON',
  requestedAt: '2026-08-01T00:00:00.000Z',
  expiresAt: '2026-08-08T00:00:00.000Z',
  downloadable: true,
  failureReason: null,
  ...over,
});

describe('describeExport', () => {
  it.each([
    ['PENDING', 'QUEUED'],
    ['PROCESSING', 'PREPARING'],
    ['READY', 'READY'],
    ['FAILED', 'FAILED'],
    ['EXPIRED', 'EXPIRED'],
  ] as const)('maps %s to %s', (status, stage) => {
    expect(describeExport(request({ status }), NOW).stage).toBe(stage);
  });

  it('takes canDownload from the SERVER, never re-deriving it', () => {
    // A client computing "READY and not past expires_at" is wrong the moment the two clocks disagree
    // or the archive is removed early, and offering a download that 404s is worse than offering none.
    const ready = describeExport(request({ status: 'READY', downloadable: false }), NOW);
    expect(ready.canDownload).toBe(false);
  });

  it('carries the server’s failure sentence through unchanged', () => {
    const failed = describeExport(
      request({ status: 'FAILED', downloadable: false, failureReason: 'We could not build it.' }),
      NOW,
    );
    expect(failed.failureReason).toBe('We could not build it.');
  });

  it('reports the real expiry window rather than a promised duration', () => {
    expect(describeExport(request(), NOW).expiresInDays).toBe(3);
  });

  it('defaults `now` to the real clock — the screen calls it with one argument', () => {
    // A minute of headroom, because the result is FLOORED: without it, the millisecond that elapses
    // between building the date and reading the clock turns 5 days into 4 and the test is flaky.
    const expiresAt = new Date(Date.now() + 5 * 86_400_000 + 60_000).toISOString();
    expect(describeExport(request({ expiresAt })).expiresInDays).toBe(5);
  });
});

describe('daysUntil', () => {
  it('returns null for a missing date', () => {
    expect(daysUntil(null, NOW)).toBeNull();
  });

  it('returns null rather than NaN for an unparseable date', () => {
    // NaN would render as "expires in NaN days" — a screen bug in the place a reader trusts most.
    expect(daysUntil('not-a-date', NOW)).toBeNull();
  });

  it('floors downwards', () => {
    // 6.9 days left reads as 6, never 7: understating by hours is honest, overstating gives someone
    // a day they do not have.
    expect(daysUntil('2026-08-11T21:00:00.000Z', NOW)).toBe(6);
  });

  it('clamps a past date to zero', () => {
    expect(daysUntil('2026-07-01T00:00:00.000Z', NOW)).toBe(0);
  });

  it('defaults `now` to the real clock', () => {
    // Same headroom as above, and for the same reason: floored arithmetic against a live clock.
    expect(daysUntil(new Date(Date.now() + 2 * 86_400_000 + 60_000).toISOString())).toBe(2);
  });
});

describe('toggleCategory', () => {
  it('adds and removes', () => {
    expect(toggleCategory([], 'location')).toEqual(['location']);
    expect(toggleCategory(['location'], 'location')).toEqual([]);
  });

  it('keeps the canonical order however the user taps', () => {
    // The selection is echoed back on the status screen; a list that reorders itself as it is tapped
    // reads as though the platform changed something.
    const picked = toggleCategory(toggleCategory(['operational'], 'identity'), 'contact');
    expect(picked).toEqual(['identity', 'contact', 'operational']);
  });
});

describe('canSubmitExport', () => {
  const base = { categories: ['identity'] as const, format: 'JSON' as const };

  it('requires at least one category, as the server does', () => {
    expect(canSubmitExport({ ...base, categories: [] })).toBe(false);
  });

  it('requires a format', () => {
    expect(canSubmitExport({ ...base, format: null })).toBe(false);
  });

  it('rejects an inverted window before the server answers 422', () => {
    expect(canSubmitExport({ ...base, fromDate: '2026-06-30', toDate: '2026-01-01' })).toBe(false);
  });

  it('accepts a window in the right order', () => {
    expect(canSubmitExport({ ...base, fromDate: '2026-01-01', toDate: '2026-06-30' })).toBe(true);
  });

  it('accepts an absent window — the complete record is what §30 entitles them to', () => {
    expect(canSubmitExport(base)).toBe(true);
  });

  it('accepts one bound alone', () => {
    expect(canSubmitExport({ ...base, fromDate: '2026-01-01', toDate: null })).toBe(true);
  });
});

describe('isCompleteStepUpCode', () => {
  it('accepts exactly six digits', () => {
    expect(isCompleteStepUpCode('123456')).toBe(true);
  });

  it.each(['12345', '1234567', '12345 ', 'abcdef', ''])('rejects %p', (code) => {
    // A pasted code with a stray space would otherwise be sent, rejected, and count against the
    // attempt limit that locks the subject out of their own §30 request.
    expect(isCompleteStepUpCode(code)).toBe(false);
  });
});
