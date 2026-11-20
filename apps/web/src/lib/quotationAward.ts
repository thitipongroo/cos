/**
 * Whether the buyer's quotations page offers Award (plan CQ). Pure, so it sits inside the QM-1 gate.
 *
 * Award is accepted only while the RFQ is EVALUATED (POST /procurement/rfqs/{id}/award). The system's pick
 * (`is_selected`, made when the RFQ is evaluated) is a suggestion until then, so every row — the pick included —
 * is awardable at EVALUATED; at any other status, or for a read-only user, no row is.
 */
export function canAwardQuotations(readOnly: boolean, rfqStatus: string | undefined): boolean {
  return !readOnly && rfqStatus === 'EVALUATED';
}

/**
 * Whether this row offers Award (plan DI): as `canAwardQuotations`, and not for a deactivated vendor — the server
 * refuses that award (404, plan CP); the row stays, for the comparison, with a label instead of the button.
 * `vendor_active` absent (an older API) reads as active, so nothing is hidden that the server would accept.
 */
export function canAwardQuotation(
  readOnly: boolean,
  rfqStatus: string | undefined,
  row: { vendor_active?: boolean },
): boolean {
  return canAwardQuotations(readOnly, rfqStatus) && row.vendor_active !== false;
}
