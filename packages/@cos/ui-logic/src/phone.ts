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
  const digits = nationalNumber.replace(/\D/g, '').replace(/^0+/, '');
  return `${dialCode}${digits}`;
}
