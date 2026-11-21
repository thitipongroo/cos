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
  return linkReasonKey(error) ?? 'vendor.submitFailed';
}

/**
 * Why the vendor's RFQ link would not open (plan DS, product owner 2026-11-21) — it said "invalid or expired"
 * whatever the cause. Since plans DP–DR every COS-VND code is the envelope's `error.code`.
 */
export function vendorLinkErrorKey(error: { code?: string } | null | undefined): string {
  return linkReasonKey(error) ?? 'vendor.rfqUnavailable';
}

/** The four invitation cases, on opening the RFQ and on submitting to it alike; each line says what to do next. */
function linkReasonKey(error: { code?: string } | null | undefined): string | undefined {
  switch (error?.code) {
    case 'COS-VND-004':
      return 'vendor.linkExpired';
    case 'COS-VND-003':
      return 'vendor.linkUsed';
    case 'COS-VND-001':
    case 'COS-VND-002':
      return 'vendor.linkInvalid';
    case 'COS-VND-005':
      return 'vendor.relationshipEnded';
    default:
      return undefined;
  }
}

/**
 * Whether the line offers the vendor dashboard (plan DS): "already answered" points there, and so does "expired" —
 * the guard checks a link's expiry before the service knows it was answered, so an answered invitation opened after
 * its expiry reads "expired" (found by /doubt; product owner: reword and link rather than reorder the checks).
 */
export function offersVendorDashboard(key: string): boolean {
  return key === 'vendor.linkUsed' || key === 'vendor.linkExpired';
}
