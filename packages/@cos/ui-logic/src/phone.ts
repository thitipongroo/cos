// Phone / E.164 helpers shared by the web and mobile OTP login (§20.6.1 Path A). Only the truly
// platform-agnostic pieces live here (ADR-068); the country catalogue itself differs by platform —
// mobile carries `nationalDigits` + inline flag SVGs and region detection, web bundles flag assets
// and does BCP-47 locale detection — so `COUNTRIES`, the `Country` shape, `findCountry`, and the
// region/locale resolvers stay in each app's own `lib/countries.ts`.

/** Home market — the fallback when device/locale detection yields nothing in-list. */
export const DEFAULT_COUNTRY_ISO2 = 'th';

/**
 * Combine a country dial code + a nationally-formatted number into an E.164 string the backend
 * accepts (^\+[1-9]\d{7,14}$). Strips separators and any leading trunk '0'
 * (e.g. TH mobile "081-234-5678" → "+66812345678").
 */
export function toE164(dialCode: string, nationalNumber: string): string {
  // Drop a leading parenthesised dial code first. Since 2026-08-06 `formatNationalPhone` emits
  // `(+66) 081-100-0003`, and without this line feeding that string back would strip the
  // parentheses, keep the 66 as digits and produce `+6666081...`. The round-trip test below is what
  // caught it; a caller reading a formatted value off a screen would not have.
  const national = nationalNumber.replace(/^\s*\(\s*\+\d+\s*\)\s*/, '');
  const digits = national.replace(/\D/g, '').replace(/^0+/, '');
  return `${dialCode}${digits}`;
}

/**
 * National-format grouping, by dial code.
 *
 * ONLY `+66` IS SPECIFIED. §20.5 gives Thailand's grouping and says of everywhere else only that
 * each country keeps its own convention — so the other dial codes the platform supports are absent
 * here on purpose rather than filled in with a plausible pattern. §20.5 is explicit that an
 * ungrouped number beats a wrongly grouped one, because a reader checking which number the platform
 * holds for them cannot tell a regrouping from a typo in the record. Add an entry when the spec
 * gains one.
 */
const NATIONAL_GROUPS: Readonly<Record<string, readonly number[]>> = {
  '+66': [3, 3, 4], // §20.5 — 0XX-XXX-XXXX
};

/**
 * Render an E.164 number the way §20.5 specifies: dial code in parentheses, then the national
 * number with its trunk '0' restored, grouped and hyphen-separated.
 *
 * `+66811000003` → `(+66) 081-100-0003`.
 *
 * The parenthesised dial code was added 2026-08-06 (§20.5 amendment). Without it the screen showed
 * `081-100-0003`, which is the number a Thai reader recognises but says nothing about which country
 * the platform filed it under — on a transparency screen, the thing being checked.
 *
 * The inverse of `toE164`, and deliberately in the same module: the two must agree about the trunk
 * prefix, and splitting them across packages is how they drift.
 *
 * Anything this cannot format confidently is returned UNCHANGED — an unknown dial code, a number
 * whose digit count does not match the specified grouping, or a value that is not E.164 at all. A
 * phone number rendered wrong is worse than one rendered plainly, because the reader cannot tell
 * which digits were moved.
 */
export function formatNationalPhone(e164: string): string {
  const trimmed = e164.trim();
  if (!/^\+[1-9]\d{7,14}$/.test(trimmed)) return e164;

  const dialCode = Object.keys(NATIONAL_GROUPS).find((code) => trimmed.startsWith(code));
  if (dialCode === undefined) return e164;

  const groups = NATIONAL_GROUPS[dialCode]!;
  // The trunk '0' is not carried in E.164 and is restored for display — that is what makes the
  // result the number a Thai reader would recognise from their own handset.
  const national = `0${trimmed.slice(dialCode.length)}`;
  const expected = groups.reduce((sum, n) => sum + n, 0);
  if (national.length !== expected) return e164;

  const parts: string[] = [];
  let at = 0;
  for (const size of groups) {
    parts.push(national.slice(at, at + size));
    at += size;
  }
  return `(${dialCode}) ${parts.join('-')}`;
}
