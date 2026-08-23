/**
 * Phone country data for the OTP login — spec §20.6.1 Path A.
 *
 * §35.13 ESC-25: apps/web had no unit tests. toE164 is the sharp edge here — the backend rejects
 * anything that is not `^\+[1-9]\d{7,14}$`, and a Thai mobile number is entered with a leading
 * trunk "0" that must be stripped. Getting this wrong means nobody can log in.
 */
import {
  COUNTRIES,
  DEFAULT_COUNTRY_ISO2,
  countryFromLocale,
  findCountry,
  toE164,
} from '../countries';

const E164 = /^\+[1-9]\d{7,14}$/;

describe('COUNTRIES', () => {
  it('leads with the home market', () => {
    expect(COUNTRIES[0]!.iso2).toBe(DEFAULT_COUNTRY_ISO2);
    expect(DEFAULT_COUNTRY_ISO2).toBe('th');
  });

  it('has a unique lowercase iso2 per entry', () => {
    const codes = COUNTRIES.map((c) => c.iso2);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toBe(code.toLowerCase());
      expect(code).toHaveLength(2);
    }
  });

  it('every dial code is a plausible E.164 country code', () => {
    for (const c of COUNTRIES) {
      expect(c.dialCode).toMatch(/^\+[1-9]\d{0,2}$/);
    }
  });

  it('every entry carries both an English and a Thai name', () => {
    for (const c of COUNTRIES) {
      expect(c.nameEn.length).toBeGreaterThan(0);
      expect(c.nameTh.length).toBeGreaterThan(0);
    }
  });

  it('covers Thailand plus the ASEAN markets the module documents', () => {
    const codes = COUNTRIES.map((c) => c.iso2).sort();
    expect(codes).toEqual(['bn', 'id', 'kh', 'la', 'mm', 'my', 'ph', 'sg', 'th', 'vn']);
  });
});

describe('findCountry', () => {
  it('returns the matching country', () => {
    expect(findCountry('sg').dialCode).toBe('+65');
  });

  it('falls back to the home market for an unknown code', () => {
    // The picker renders findCountry(...).dialCode unconditionally — it must never get undefined.
    const fallback = findCountry('zz');
    expect(fallback).toBe(COUNTRIES[0]);
    expect(fallback.iso2).toBe(DEFAULT_COUNTRY_ISO2);
  });

  it('is case-sensitive by design — iso2 keys are stored lowercase', () => {
    expect(findCountry('TH').iso2).toBe('th'); // falls through to the default, which is also th
    expect(findCountry('SG').iso2).toBe('th'); // an uppercase code does NOT match 'sg'
  });
});

describe('toE164', () => {
  it('strips a Thai leading trunk zero', () => {
    expect(toE164('+66', '081-234-5678')).toBe('+66812345678');
  });

  it('strips spaces, dashes and parentheses', () => {
    expect(toE164('+65', '(9123) 4567')).toBe('+6591234567');
  });

  it('leaves a number without a trunk zero alone', () => {
    expect(toE164('+66', '812345678')).toBe('+66812345678');
  });

  it('strips several leading zeroes', () => {
    expect(toE164('+66', '00812345678')).toBe('+66812345678');
  });

  it('produces a string the backend regex accepts', () => {
    expect(toE164('+66', '081-234-5678')).toMatch(E164);
    expect(toE164('+855', '012 345 678')).toMatch(E164);
  });

  it('drops non-digits anywhere in the number', () => {
    expect(toE164('+66', '08a1b2c34567 8')).toBe('+66812345678');
  });

  it('returns just the dial code for an empty national number', () => {
    // Not a valid E.164 number — the caller validates before submitting; this documents the shape.
    expect(toE164('+66', '')).toBe('+66');
    expect(toE164('+66', '')).not.toMatch(E164);
  });

  it('returns just the dial code when the number is all zeroes', () => {
    expect(toE164('+66', '000')).toBe('+66');
  });
});

describe('countryFromLocale', () => {
  it('prefers an in-list region subtag', () => {
    expect(countryFromLocale('en-SG')).toBe('sg');
    expect(countryFromLocale('th-TH')).toBe('th');
  });

  it('lowercases the region subtag', () => {
    expect(countryFromLocale('en-MY')).toBe('my');
  });

  it('falls back to the home market for a region that is not in the list', () => {
    expect(countryFromLocale('en-GB')).toBe(DEFAULT_COUNTRY_ISO2);
    expect(countryFromLocale('ja-JP')).toBe(DEFAULT_COUNTRY_ISO2);
  });

  it('maps a bare Thai language tag to Thailand', () => {
    expect(countryFromLocale('th')).toBe('th');
  });

  it('falls back for a bare language tag that is not Thai', () => {
    expect(countryFromLocale('en')).toBe(DEFAULT_COUNTRY_ISO2);
  });

  it('falls back when the locale is missing', () => {
    expect(countryFromLocale(undefined)).toBe(DEFAULT_COUNTRY_ISO2);
    expect(countryFromLocale('')).toBe(DEFAULT_COUNTRY_ISO2);
  });

  it('only ever returns an iso2 that exists in COUNTRIES', () => {
    const known = new Set(COUNTRIES.map((c) => c.iso2));
    for (const locale of ['en-SG', 'th-TH', 'en-GB', 'th', 'en', '', undefined, 'xx-YY']) {
      expect(known.has(countryFromLocale(locale))).toBe(true);
    }
  });
});
