/**
 * Why recording an AP payment was refused, as an i18n key (plan DB).
 *
 * The payments page picks the project and the invoice in separate selects, and showed nothing when the server
 * refused. Product owner, 2026-11-21: a TH/EN line for the case — the API's own `messageKey` when it is one this
 * page knows, then the status — else a generic line; never the server's English message or the ids in it.
 *
 * From backend finance.service.ts `recordPayment`: 404 = no such invoice in the tenant; 422 COS-FIN-422
 * `finance.payment.invoiceOtherProject` = the invoice's PO is under another project; `invoiceNotApproved` and
 * `currencyMismatch` (plan DD) = the invoice is not APPROVED, or is in another currency; a ValidationPipe 400 is the
 * request's own fields (the form checks them first) — the generic line.
 */
import { ApiError } from './api/client';

const KNOWN_MESSAGE_KEYS: Record<string, string> = {
  'finance.payment.invoiceOtherProject': 'finance.err.invoiceOtherProject',
  // Plan DD: only an APPROVED invoice, in its own currency.
  'finance.payment.invoiceNotApproved': 'finance.err.invoiceNotApproved',
  'finance.payment.currencyMismatch': 'finance.err.currencyMismatch',
};

export function paymentErrorKey(error: unknown): string {
  if (!(error instanceof ApiError)) return 'finance.err.generic';
  const known = error.messageKey ? KNOWN_MESSAGE_KEYS[error.messageKey] : undefined;
  if (known) return known;
  if (error.status === 403) return 'finance.err.forbidden';
  if (error.status === 404) return 'finance.err.invoiceNotFound';
  return 'finance.err.generic';
}
