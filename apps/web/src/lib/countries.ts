// Phone country picker data for the OTP login (§20.6.1 Path A). Scope: the markets COS operates in
// — Thailand (home), Singapore and Vietnam. Flags are bundled SVGs (public/flags/<iso2>.svg, from the
// MIT flag-icons set) — no external/CDN request. Dial codes are ITU-T E.164 country codes.
//
// `toE164` and `DEFAULT_COUNTRY_ISO2` are shared with the mobile app via @cos/ui-logic (ADR-068);
// re-exported here so this module stays the single import surface. The country catalogue itself is
// web-specific (no `nationalDigits`, asset-based flags, BCP-47 locale detection).

import { DEFAULT_COUNTRY_ISO2, toE164 } from '@cos/ui-logic';

export { DEFAULT_COUNTRY_ISO2, toE164 };

export interface Country {
  /** ISO 3166-1 alpha-2, lowercased to match the bundled public/flags/<iso2>.svg asset. */
  iso2: string;
  /** E.164 country calling code, incl. leading '+'. */
  dialCode: string;
  nameEn: string;
  nameTh: string;
}

export const COUNTRIES: Country[] = [
  { iso2: 'th', dialCode: '+66', nameEn: 'Thailand', nameTh: 'ไทย' },
  { iso2: 'vn', dialCode: '+84', nameEn: 'Vietnam', nameTh: 'เวียดนาม' },
  { iso2: 'sg', dialCode: '+65', nameEn: 'Singapore', nameTh: 'สิงคโปร์' },
];

export function findCountry(iso2: string): Country {
  return COUNTRIES.find((c) => c.iso2 === iso2) ?? COUNTRIES[0]!;
}

/**
 * Resolve the default country from a BCP-47 locale/region tag (e.g. navigator.language "th-TH",
 * or "en-SG"). Prefers the region subtag; falls back to a Thai language tag → TH; else the home
 * market. Only ever returns an iso2 that exists in COUNTRIES.
 */
export function countryFromLocale(locale: string | undefined): string {
  if (!locale) return DEFAULT_COUNTRY_ISO2;
  const parts = locale.split('-');
  const region = parts[1]?.toLowerCase();
  if (region && COUNTRIES.some((c) => c.iso2 === region)) return region;
  const lang = parts[0]?.toLowerCase();
  if (lang === 'th') return 'th';
  return DEFAULT_COUNTRY_ISO2;
}
