import {
  COUNTRIES,
  DEFAULT_COUNTRY_ISO2,
  FLAG_SVG,
  countryFromRegion,
  findCountry,
  toE164,
} from '../countries';

describe('countries — OTP phone split/combine', () => {
  it('every country has a bundled flag SVG', () => {
    for (const c of COUNTRIES) {
      expect(FLAG_SVG[c.iso2]).toMatch(/^<svg[\s\S]*<\/svg>$/);
    }
  });

  it('Thailand is the home-market default', () => {
    expect(DEFAULT_COUNTRY_ISO2).toBe('th');
    expect(findCountry('th').dialCode).toBe('+66');
  });

  it('findCountry falls back to the home market for an unknown code', () => {
    // The login screen calls findCountry with whatever iso2 is in state, so the picker never has to
    // handle an undefined country — a stored/region-derived code that has since left COUNTRIES
    // (Myanmar, say) resolves to Thailand rather than crashing on a missing dial code.
    expect(findCountry('zz').iso2).toBe(DEFAULT_COUNTRY_ISO2);
    expect(findCountry('mm').dialCode).toBe('+66');
  });

  describe('toE164', () => {
    it('prefixes the dial code and strips a leading trunk 0 + separators (TH)', () => {
      expect(toE164('+66', '081-234-5678')).toBe('+66812345678');
      expect(toE164('+66', '0812345678')).toBe('+66812345678');
      expect(toE164('+66', '812345678')).toBe('+66812345678');
    });

    it('handles an already-national number without a leading 0 (e2e seed form)', () => {
      expect(toE164('+66', '800000004')).toBe('+66800000004');
    });

    it('applies other ASEAN dial codes', () => {
      expect(toE164('+95', '9123456789')).toBe('+959123456789'); // Myanmar
      expect(toE164('+65', '81234567')).toBe('+6581234567'); // Singapore
    });

    it('produces backend-valid E.164 (^\\+[1-9]\\d{7,14}$)', () => {
      const e164 = /^\+[1-9]\d{7,14}$/;
      expect(toE164('+66', '0812345678')).toMatch(e164);
      expect(toE164('+855', '12345678')).toMatch(e164);
    });
  });

  describe('countryFromRegion', () => {
    it('maps an in-list device region to its iso2', () => {
      expect(countryFromRegion('TH')).toBe('th');
      expect(countryFromRegion('sg')).toBe('sg');
      expect(countryFromRegion('VN')).toBe('vn');
    });

    it('falls back to the home market for unsupported / missing regions', () => {
      expect(countryFromRegion('US')).toBe('th');
      expect(countryFromRegion(null)).toBe('th');
      expect(countryFromRegion(undefined)).toBe('th');
    });
  });
});
