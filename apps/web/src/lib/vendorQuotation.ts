/**
 * What a refused quotation says on the vendor's RFQ page (fix/quotation-duplicate-and-closed-rfq). Pure, so it sits
 * inside the QM-1 gate.
 *
 * COS-VND-010: this vendor already quoted for the RFQ — the first quotation stands. COS-VND-011: the RFQ is no longer
 * open (closed, evaluated, awarded or cancelled). Both used to read "check your input", which was wrong for both.
 * Anything else is that general message.
 */
export function quotationErrorKey(error: { code?: string } | null | undefined): string {
  if (error?.code === 'COS-VND-010') return 'vendor.quotationExists';
  if (error?.code === 'COS-VND-011') return 'vendor.rfqClosed';
  return 'vendor.submitFailed';
}
