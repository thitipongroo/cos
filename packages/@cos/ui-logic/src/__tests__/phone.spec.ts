import { DEFAULT_COUNTRY_ISO2, formatNationalPhone, toE164 } from '../phone';

describe('DEFAULT_COUNTRY_ISO2', () => {
  it('is the Thai home market', () => {
    expect(DEFAULT_COUNTRY_ISO2).toBe('th');
  });
});

describe('toE164', () => {
  it('strips separators and a leading trunk 0 (TH mobile)', () => {
    expect(toE164('+66', '081-234-5678')).toBe('+66812345678');
  });

  it('strips multiple leading zeros', () => {
    expect(toE164('+66', '00812345678')).toBe('+66812345678');
  });

  it('leaves a number with no trunk prefix intact (SG)', () => {
    expect(toE164('+65', '8123 4567')).toBe('+6581234567');
  });

  it('drops all non-digits from the national number', () => {
    expect(toE164('+84', '(91) 234.5678')).toBe('+84912345678');
  });
});

describe('formatNationalPhone', () => {
  it('renders a Thai mobile the way §20.5 specifies', () => {
    // "(+66) 0XX-XXX-XXXX" — the dial code in parentheses (amended 2026-08-06), then the national
    // number with its trunk 0 restored, because E.164 does not carry the 0 and it is what a Thai
    // reader recognises from their own handset.
    expect(formatNationalPhone('+66811000003')).toBe('(+66) 081-100-0003');
    expect(formatNationalPhone('+66812345678')).toBe('(+66) 081-234-5678');
  });

  it('round-trips with toE164', () => {
    // The two must agree about BOTH the trunk prefix and the parenthesised dial code. They live in
    // one module so they cannot drift — and this assertion is what forced toE164 to learn to strip
    // the prefix when the display format gained it.
    expect(toE164('+66', formatNationalPhone('+66812345678'))).toBe('+66812345678');
  });

  it('does not double-count the dial code when a formatted value is fed back', () => {
    // The failure this guards against is silent: '(+66) 081...' → digits '66081...' → '+6666081...',
    // a number that is still shaped like E.164 and would pass the backend's regex.
    expect(toE164('+66', '(+66) 081-234-5678')).toBe('+66812345678');
    expect(toE164('+66', '( +66 ) 081-234-5678')).toBe('+66812345678');
  });

  it('returns an unspecified country UNCHANGED rather than guessing a grouping', () => {
    // §20.5 specifies +66 and nothing else. A wrongly-grouped number is harder to read than an
    // ungrouped one, and the reader cannot tell which digits were moved.
    expect(formatNationalPhone('+6581234567')).toBe('+6581234567');
    expect(formatNationalPhone('+84912345678')).toBe('+84912345678');
    expect(formatNationalPhone('+14155552671')).toBe('+14155552671');
  });

  it('returns a Thai number of unexpected length unchanged', () => {
    // A short or long number is not silently padded into the pattern — it is shown as stored.
    expect(formatNationalPhone('+6681100')).toBe('+6681100');
    expect(formatNationalPhone('+668110000031')).toBe('+668110000031');
  });

  it('leaves anything that is not E.164 alone', () => {
    expect(formatNationalPhone('081-100-0003')).toBe('081-100-0003');
    expect(formatNationalPhone('')).toBe('');
    expect(formatNationalPhone('not a phone')).toBe('not a phone');
    expect(formatNationalPhone('+0123456789')).toBe('+0123456789');
  });

  it('tolerates surrounding whitespace', () => {
    expect(formatNationalPhone('  +66811000003  ')).toBe('(+66) 081-100-0003');
  });
});
