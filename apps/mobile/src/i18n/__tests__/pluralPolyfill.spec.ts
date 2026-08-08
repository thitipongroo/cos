// The Intl.PluralRules polyfill must stay imported in translate.ts.
//
// WHY THIS IS A SOURCE-READING TEST AND NOT A BEHAVIOURAL ONE. Node and jsdom both ship full ICU, so
// `translate('en', …, { count })` formats correctly here whether or not the polyfill is imported —
// every behavioural assertion passes vacuously. The runtime that does NOT have PluralRules is
// Hermes, and no unit test runs there.
//
// The bug this guards against already shipped: `{count, plural, …}` messages threw inside
// formatIcu() on device, hit its catch, and rendered the RAW TEMPLATE to a field worker
// ("Structural{count, plural, one {# worker} other {# workers}}" on the daily-report screen). Three
// older strings — pending changes, unresolved conflicts, queued photos — had been doing it unnoticed.
//
// So this asserts the two things that actually prevent it: the polyfill is imported, and it is
// imported BEFORE intl-messageformat (which reads the global when it formats).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { translate } from '../translate';

const SOURCE = readFileSync(join(__dirname, '..', 'translate.ts'), 'utf8');

/** Every locale the app ships needs its own plural-rule data — the polyfill bundles none by default. */
const SHIPPED_LOCALES = ['en', 'th'] as const;

/** Install order is load-bearing: getCanonicalLocales → Locale → PluralRules (see translate.ts). */
const POLYFILLS = [
  '@formatjs/intl-getcanonicallocales/polyfill.js',
  '@formatjs/intl-locale/polyfill.js',
  '@formatjs/intl-pluralrules/polyfill.js',
] as const;

describe('Intl.PluralRules polyfill (QM-3)', () => {
  // The `.js` suffix is part of the assertion: these packages' `exports` maps have no extensionless
  // entry, so dropping it breaks resolution in both Metro and jest.
  it.each(POLYFILLS)('imports %s', (specifier) => {
    expect(SOURCE).toContain(`import '${specifier}'`);
  });

  // PluralRules resolves its locale via intl-localematcher, which constructs `new Intl.Locale`.
  // Importing PluralRules without Locale first does not fail loudly — it just moves the throw into
  // findMatchingDistanceImpl and the raw template is rendered again, which is how this was missed.
  it('installs them in dependency order', () => {
    const positions = POLYFILLS.map((specifier) => SOURCE.indexOf(specifier));
    expect(positions.every((at) => at > -1)).toBe(true);
    expect([...positions]).toEqual([...positions].sort((a, b) => a - b));
  });

  it.each(SHIPPED_LOCALES)('imports the %s locale data', (locale) => {
    expect(SOURCE).toContain(`import '@formatjs/intl-pluralrules/locale-data/${locale}.js'`);
  });

  it('imports the polyfill BEFORE intl-messageformat', () => {
    const polyfillAt = SOURCE.indexOf('@formatjs/intl-pluralrules/polyfill');
    const messageFormatAt = SOURCE.indexOf("from 'intl-messageformat'");
    expect(polyfillAt).toBeGreaterThan(-1);
    expect(messageFormatAt).toBeGreaterThan(-1);
    expect(polyfillAt).toBeLessThan(messageFormatAt);
  });

  it('still formats a plural message correctly where ICU is present', () => {
    // Not the real guard (see the file header) — this only proves the polyfill imports did not BREAK
    // formatting in an environment that already had PluralRules.
    expect(translate('en', 'site.report.workerCount', { count: 1 })).toBe('1 worker');
    expect(translate('en', 'site.report.workerCount', { count: 8 })).toBe('8 workers');
  });
});
