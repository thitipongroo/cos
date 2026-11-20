import en from '../../i18n/en.json';
import th from '../../i18n/th.json';
import { quotationErrorKey } from '../vendorQuotation';

type Messages = { [key: string]: string | Messages };
const lookup = (m: Messages, key: string): string | undefined => {
  let node: string | Messages | undefined = m;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
};

describe('quotationErrorKey', () => {
  it.each([
    ['COS-VND-010', 'vendor.quotationExists'],
    ['COS-VND-011', 'vendor.rfqClosed'],
    ['COS-VND-003', 'vendor.submitFailed'],
    [undefined, 'vendor.submitFailed'],
  ])('%s → %s, in both languages', (code, key) => {
    expect(quotationErrorKey(code ? { code } : null)).toBe(key);
    expect(lookup(en as Messages, key)).toBeTruthy();
    expect(lookup(th as Messages, key)).toBeTruthy();
  });
});
