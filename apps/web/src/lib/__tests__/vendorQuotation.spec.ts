import en from '../../i18n/en.json';
import th from '../../i18n/th.json';
import {
  offersVendorDashboard,
  quotationErrorKey,
  vendorInvoiceErrorKey,
  vendorLinkErrorKey,
} from '../vendorQuotation';

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
    ['COS-VND-009', 'vendor.submitFailed'], // a code with no line of its own (003 has one since plan DS)
    [undefined, 'vendor.submitFailed'],
  ])('%s → %s, in both languages', (code, key) => {
    expect(quotationErrorKey(code ? { code } : null)).toBe(key);
    expect(lookup(en as Messages, key)).toBeTruthy();
    expect(lookup(th as Messages, key)).toBeTruthy();
  });
});

// Plan DS (product owner 2026-11-21): the four invitation cases, on opening the RFQ and on submitting to it.
describe.each([
  ['vendorLinkErrorKey', vendorLinkErrorKey, 'vendor.rfqUnavailable'],
  ['quotationErrorKey', quotationErrorKey, 'vendor.submitFailed'],
] as const)('%s — the invitation cases', (_name, fn, fallback) => {
  it.each([
    ['COS-VND-004', 'vendor.linkExpired'],
    ['COS-VND-003', 'vendor.linkUsed'],
    ['COS-VND-001', 'vendor.linkInvalid'],
    ['COS-VND-002', 'vendor.linkInvalid'],
    ['COS-VND-005', 'vendor.relationshipEnded'],
  ])('%s → %s, in both languages', (code, key) => {
    expect(fn({ code })).toBe(key);
    expect(lookup(en as Messages, key)).toBeTruthy();
    expect(lookup(th as Messages, key)).toBeTruthy();
  });

  it(`anything else → ${fallback}`, () => {
    expect(fn({ code: 'COS-GENERAL-500' })).toBe(fallback);
    expect(fn(null)).toBe(fallback);
  });
});

describe('offersVendorDashboard (plan DS)', () => {
  it('offers the dashboard for "already answered" and "expired" (an answered link opened after its expiry)', () => {
    expect(offersVendorDashboard('vendor.linkUsed')).toBe(true);
    expect(offersVendorDashboard('vendor.linkExpired')).toBe(true);
  });

  it.each([
    'vendor.linkInvalid',
    'vendor.relationshipEnded',
    'vendor.rfqUnavailable',
    'vendor.submitFailed',
  ])('offers nothing for %s', (key) => {
    expect(offersVendorDashboard(key)).toBe(false);
  });
});

// Plan DU (product owner 2026-11-21): the buyer's read-only account (an ended trial) refuses a vendor's write with 403
// COS-PLAN-003; both forms say the buyer cannot take documents now — without naming the trial.
describe('COS-PLAN-003 on the vendor forms (plan DU)', () => {
  const readOnly = { code: 'COS-PLAN-003' };

  it('the quotation and the invoice forms both say the buyer cannot take documents', () => {
    expect(quotationErrorKey(readOnly)).toBe('vendor.buyerReadOnly');
    expect(vendorInvoiceErrorKey(readOnly)).toBe('vendor.buyerReadOnly');
  });

  it('anything else on the invoice form is the general line', () => {
    expect(vendorInvoiceErrorKey({ code: 'COS-GENERAL-500' })).toBe('vendor.submitFailed');
    expect(vendorInvoiceErrorKey(null)).toBe('vendor.submitFailed');
  });

  it.each([
    ['en', en],
    ['th', th],
  ])('%s carries the line, and it names neither the trial nor the plan', (_lang, dict) => {
    const line = lookup(dict as Messages, 'vendor.buyerReadOnly');
    expect(line).toBeTruthy();
    expect(line).not.toMatch(/trial|plan|subscription|ทดลอง|แพ็กเกจ|แผน|สมัครสมาชิก/i);
  });
});
