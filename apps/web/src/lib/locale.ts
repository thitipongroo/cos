/**
 * Locale plumbing shared by the i18n provider and React Aria (QM-3).
 *
 * The app's own locale type is a bare language code (`'th' | 'en'`), which is enough to pick a
 * message bundle but not enough for anything that formats: React Aria, `Intl.DateTimeFormat` and
 * `Intl.NumberFormat` all want a BCP-47 tag. This module is the single place that widens one into
 * the other, and it is pure so the 100% QM-1 gate can cover it.
 */

/** The UI languages the app ships. Mirrors `Locale` in `src/i18n`. */
export type AppLocale = 'th' | 'en';

/**
 * BCP-47 tag per shipped language.
 *
 * `th-TH` is deliberately left without a `-u-ca-*` extension: ICU already resolves it to the
 * `buddhist` calendar, so React Aria's date components render Buddhist Era years with no further
 * configuration. Verified against `@internationalized/date` 3.12.3 — `th-TH` → calendar
 * `buddhist`, 2026-08-03 → 2569-08-03 BE. Pinning `th-TH-u-ca-gregory` here would silently
 * *remove* the Buddhist Era that QM-3 requires.
 */
const BCP47: Readonly<Record<AppLocale, string>> = {
  th: 'th-TH',
  en: 'en-US',
};

/**
 * Languages written right-to-left, by ISO 639-1 code.
 *
 * QM-3 names `ar-SA` as the RTL conformance target. Arabic is not a shipped UI language — there is
 * no `ar.json` — but layout, focus order and date components must survive being told they are RTL,
 * which is what this list makes testable. Widened when a real RTL locale ships, not before.
 */
const RTL_LANGUAGES: ReadonlySet<string> = new Set(['ar', 'he', 'fa', 'ur']);

/** Widen an app locale to the BCP-47 tag `Intl` and React Aria need. */
export function toBcp47(locale: AppLocale): string {
  return BCP47[locale];
}

/**
 * Writing direction for any BCP-47 tag or bare language code.
 *
 * Takes a string rather than `AppLocale` so it can answer for `ar-SA` in tests without `ar` being
 * a shipped locale. Unknown tags are `ltr` — the safe default, since guessing `rtl` would mirror
 * the entire layout for a language nobody asked for.
 */
export function directionFor(locale: string): 'ltr' | 'rtl' {
  // Strip the region/script subtags rather than indexing a split() result: indexing needs a
  // `?? ''` fallback for noUncheckedIndexedAccess, and that fallback is unreachable — split()
  // always yields at least one element — which would leave an uncoverable branch under QM-1.
  const language = locale.toLowerCase().replace(/[-_].*$/, '');
  return RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr';
}

/**
 * Apply a locale to the document element.
 *
 * `lang` matters more than it looks: a screen reader picks its voice and pronunciation rules from
 * it, so Thai content announced under `lang="en"` is unintelligible. No automated check catches
 * this — it is item B1 on docs/evidence/screenreader-checklist.md.
 *
 * Returns void and tolerates a missing document so it can be called from an effect without the
 * caller guarding for SSR.
 */
export function applyDocumentLocale(locale: AppLocale): void {
  if (typeof document === 'undefined') {
    return;
  }
  const tag = toBcp47(locale);
  document.documentElement.lang = tag;
  document.documentElement.dir = directionFor(tag);
}
