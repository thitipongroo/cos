import { applyDocumentLocale, directionFor, toBcp47 } from '../locale';

describe('toBcp47', () => {
  it('widens th to th-TH', () => {
    expect(toBcp47('th')).toBe('th-TH');
  });

  it('widens en to en-US', () => {
    expect(toBcp47('en')).toBe('en-US');
  });

  it('leaves th-TH free to resolve to the buddhist calendar', () => {
    // QM-3 requires Buddhist Era. ICU gives it for a bare th-TH; a -u-ca- extension here would
    // override that, so the tag must stay unqualified.
    expect(toBcp47('th')).not.toMatch(/-u-ca-/);
    expect(new Intl.DateTimeFormat(toBcp47('th')).resolvedOptions().calendar).toBe('buddhist');
  });

  it('resolves en-US to the gregorian calendar', () => {
    expect(new Intl.DateTimeFormat(toBcp47('en')).resolvedOptions().calendar).toBe('gregory');
  });
});

describe('directionFor', () => {
  it.each(['ar', 'ar-SA', 'he', 'he-IL', 'fa', 'fa-IR', 'ur', 'ur-PK'])(
    'reports %s as rtl',
    (locale) => {
      expect(directionFor(locale)).toBe('rtl');
    },
  );

  it.each(['en', 'en-US', 'th', 'th-TH', 'ja-JP'])('reports %s as ltr', (locale) => {
    expect(directionFor(locale)).toBe('ltr');
  });

  it('is case-insensitive', () => {
    expect(directionFor('AR-SA')).toBe('rtl');
  });

  it('accepts an underscore-separated tag', () => {
    expect(directionFor('ar_SA')).toBe('rtl');
  });

  it('defaults an unknown tag to ltr rather than guessing', () => {
    expect(directionFor('zz-ZZ')).toBe('ltr');
  });

  it('defaults an empty string to ltr', () => {
    expect(directionFor('')).toBe('ltr');
  });
});

describe('applyDocumentLocale', () => {
  // jest runs testEnvironment: 'node' here (apps/web/jest.config.js) — there is no document, so
  // these tests install a minimal stub rather than pulling in jsdom for two attribute writes.
  const withDocument = (fn: (el: { lang: string; dir: string }) => void) => {
    const documentElement = { lang: '', dir: '' };
    (globalThis as { document?: unknown }).document = { documentElement };
    try {
      fn(documentElement);
    } finally {
      delete (globalThis as { document?: unknown }).document;
    }
  };

  it('sets lang and dir for th', () => {
    withDocument((el) => {
      applyDocumentLocale('th');
      expect(el.lang).toBe('th-TH');
      expect(el.dir).toBe('ltr');
    });
  });

  it('sets lang and dir for en', () => {
    withDocument((el) => {
      applyDocumentLocale('en');
      expect(el.lang).toBe('en-US');
      expect(el.dir).toBe('ltr');
    });
  });

  it('is a no-op without a document, so it is safe to call during SSR', () => {
    expect(typeof document).toBe('undefined');
    expect(() => applyDocumentLocale('th')).not.toThrow();
  });
});
