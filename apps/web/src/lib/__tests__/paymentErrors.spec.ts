import { ApiError } from '../api/client';
import { paymentErrorKey } from '../paymentErrors';
import en from '../../i18n/en.json';
import th from '../../i18n/th.json';

const apiError = (status: number, messageKey?: string, code?: string) =>
  new ApiError(status, `Request failed: ${status}`, code, undefined, messageKey);

// Plan DB (product owner 2026-11-21): a TH/EN reason for a refused payment, never the server's English text.
describe('paymentErrorKey', () => {
  it.each([
    [
      'the invoice of another project',
      apiError(422, 'finance.payment.invoiceOtherProject', 'COS-FIN-422'),
      'finance.err.invoiceOtherProject',
    ],
    [
      'an invoice not APPROVED',
      apiError(422, 'finance.payment.invoiceNotApproved', 'COS-FIN-422'),
      'finance.err.invoiceNotApproved',
    ],
    [
      "another currency than the invoice's",
      apiError(422, 'finance.payment.currencyMismatch', 'COS-FIN-422'),
      'finance.err.currencyMismatch',
    ],
    [
      'more than remains on the invoice',
      apiError(422, 'finance.payment.exceedsInvoice', 'COS-FIN-422'),
      'finance.err.exceedsInvoice',
    ],
    ['no such invoice in the tenant', apiError(404), 'finance.err.invoiceNotFound'],
    ['no permission', apiError(403, undefined, 'COS-PLAN-003'), 'finance.err.forbidden'],
    ['a ValidationPipe 400', apiError(400, 'general.error.validation'), 'finance.err.generic'],
    ['an unknown messageKey', apiError(422, 'finance.something.else'), 'finance.err.generic'],
    ['a network failure', new TypeError('Failed to fetch'), 'finance.err.generic'],
  ])('%s → %s', (_n, error, key) => {
    expect(paymentErrorKey(error)).toBe(key);
  });

  it('every key it can return exists in both languages', () => {
    for (const dict of [en, th] as Array<{ finance: { err: Record<string, string> } }>) {
      for (const k of [
        'generic',
        'forbidden',
        'invoiceNotFound',
        'invoiceOtherProject',
        'invoiceNotApproved',
        'currencyMismatch',
        'exceedsInvoice',
      ]) {
        expect(dict.finance.err[k]).toEqual(expect.any(String));
      }
    }
  });
});
