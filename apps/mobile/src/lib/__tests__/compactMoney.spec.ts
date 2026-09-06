import { toDecimal } from '@cos/financial';
import { compactMoney, compactMoneyLabel, MONEY_SCALE_KEY } from '../compactMoney';

describe('compactMoney', () => {
  it('leaves an amount that fits exactly as the invoice formatter writes it', () => {
    // Under a million there is room for every digit, and rounding a number that fits would throw
    // away precision for nothing.
    expect(compactMoney('85000')).toEqual({ text: '฿85,000.00', scale: 'none' });
    expect(compactMoney('999999.99')).toEqual({ text: '฿999,999.99', scale: 'none' });
  });

  it('scales millions and billions and names the magnitude it used', () => {
    expect(compactMoney('450000000')).toEqual({ text: '฿ 450', scale: 'million' });
    expect(compactMoney('1240000000')).toEqual({ text: '฿ 1.24', scale: 'billion' });
    expect(compactMoney('1000000')).toEqual({ text: '฿ 1', scale: 'million' });
  });

  it('puts a gap after the currency mark — the project standard (PO 2026-08-10)', () => {
    // `฿ 805 M`, not `฿805M`: a currency mark, digits and a magnitude letter run together read as
    // one token. The second gap, before the localised suffix, is the screen's.
    expect(compactMoney('805000000').text).toBe('฿ 805');
  });

  it('drops trailing zeros — .00 at this size claims a precision the summary does not have', () => {
    expect(compactMoney('450000000').text).toBe('฿ 450');
    expect(compactMoney('1500000').text).toBe('฿ 1.5');
  });

  it('promotes to billions when the ROUNDING is what crosses the boundary', () => {
    // 999,999,999 is 999.999999 million, which rounds to 1000 — and "฿1000M" is a worse way of
    // writing "฿1B".
    expect(compactMoney('999999999')).toEqual({ text: '฿ 1', scale: 'billion' });
  });

  it('takes the symbol from the currency, and prints an unknown code rather than a wrong glyph', () => {
    expect(compactMoney('2500000', 'USD').text).toBe('$ 2.5');
    // An unknown code already ends in a space, so it does not gain a second one.
    expect(compactMoney('2500000', 'XAF').text).toBe('XAF 2.5');
  });

  it('keeps a credit negative, with the sign in front of the symbol', () => {
    expect(compactMoney('-4200000')).toEqual({ text: '-฿ 4.2', scale: 'million' });
  });

  it('accepts a Decimal as well as a string', () => {
    expect(compactMoney(toDecimal('12000000')).text).toBe('฿ 12');
  });
});

describe('compactMoneyLabel', () => {
  // The suffix is an i18n KEY, not a letter — "M"/"B" in English, ล้าน/พันล้าน in Thai — so this
  // stands in for the app's translate function and asserts which key each magnitude asks for.
  const t = (key: string): string =>
    ({ 'pm.finance.scaleMillion': 'M', 'pm.finance.scaleBillion': 'B' })[key] ?? key;

  it('appends the magnitude the amount was scaled to', () => {
    expect(compactMoneyLabel('450000000', 'THB', t)).toBe('฿ 450 M');
    expect(compactMoneyLabel('1240000000', 'THB', t)).toBe('฿ 1.24 B');
  });

  it('appends nothing below a million, where the figure was never scaled', () => {
    // The product owner's threshold: abbreviate only ABOVE ฿1,000,000. `compactMoney` already draws
    // that line, so a plain amount must come back with no suffix at all — not "฿85,000.00 M".
    expect(compactMoneyLabel('85000', 'THB', t)).toBe('฿85,000.00');
    expect(compactMoneyLabel('999999.99', 'THB', t)).toBe('฿999,999.99');
  });

  it('takes one million itself as the first scaled amount', () => {
    expect(compactMoneyLabel('1000000', 'THB', t)).toBe('฿ 1 M');
  });

  it('adds no second space when the locale suffix already carries one', () => {
    // Thai's suffixes lead with a space in the message file; two gaps would render "฿ 450  ล้าน".
    const thai = (key: string): string =>
      ({ 'pm.finance.scaleMillion': ' ล้าน', 'pm.finance.scaleBillion': ' พันล้าน' })[key] ?? key;
    expect(compactMoneyLabel('450000000', 'THB', thai)).toBe('฿ 450 ล้าน');
  });

  it('keeps a negative amount negative', () => {
    expect(compactMoneyLabel('-28900000', 'THB', t)).toBe('-฿ 28.9 M');
  });
});

describe('MONEY_SCALE_KEY', () => {
  it('has an entry for every scale compactMoney can return', () => {
    // A missing entry would be an undefined lookup and a crash at render, on a screen whose whole
    // subject is a number.
    expect(MONEY_SCALE_KEY.none).toBeNull();
    expect(MONEY_SCALE_KEY.million).toBe('pm.finance.scaleMillion');
    expect(MONEY_SCALE_KEY.billion).toBe('pm.finance.scaleBillion');
  });
});
