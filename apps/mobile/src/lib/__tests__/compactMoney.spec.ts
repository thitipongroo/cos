import { toDecimal } from '@cos/financial';
import { compactMoney } from '../compactMoney';

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
