// Phone country picker data for the OTP login (§20.6.1 Path A). Scope: the markets COS operates in
// — Thailand (home), Singapore and Vietnam. Flags are bundled SVGs (public/flags/<iso2>.svg, from the
// MIT flag-icons set) — no external/CDN request. Dial codes are ITU-T E.164 country codes.

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

/** Home market — the fallback when device/locale detection yields nothing in-list. */
export const DEFAULT_COUNTRY_ISO2 = 'th';

export function findCountry(iso2: string): Country {
  return COUNTRIES.find((c) => c.iso2 === iso2) ?? COUNTRIES[0]!;
}

/**
 * Combine a country dial code + a nationally-formatted number into an E.164 string the backend
 * accepts (^\+[1-9]\d{7,14}$). Strips separators and a single leading trunk '0' (e.g. TH mobile
 * "081-234-5678" → "+66812345678").
 */
export function toE164(dialCode: string, nationalNumber: string): string {
  const digits = nationalNumber.replace(/\D/g, '').replace(/^0+/, '');
  return `${dialCode}${digits}`;
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
