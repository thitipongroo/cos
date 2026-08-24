// The Site Engineer issue board — its filter row and its colour coding.
//
// Pure, and in `src/lib/` for the same reason every other board rule is: the screen renders, this
// decides. `mockup/mobile/03_site_engineer/02_issues/02_se_issue_dashboard` draws five filter chips
// and colours every card by how bad the issue is, and neither rule should live inside a component
// where it cannot be tested without a render host.
//
// EVERY CHIP MAPS TO A REAL COLUMN. The drawing's five are ALL · CRITICAL · HIGH · OPEN · RESOLVED,
// and `site_ops.issues` carries exactly what they need: `severity` (LOW · MEDIUM · HIGH · CRITICAL)
// and `status` (OPEN · IN_PROGRESS · RESOLVED · CLOSED). Nothing here is invented and no chip
// filters on a field the row does not have.

/** An issue as this module needs to see it — the two real columns the board reads. */
export interface IssueLike {
  severity: string;
  status: string;
}

/** The filter chips, in the drawing's order. `all` is first and selected on entry. */
export const ISSUE_FILTERS = ['all', 'critical', 'high', 'open', 'resolved'] as const;
export type IssueFilter = (typeof ISSUE_FILTERS)[number];

/**
 * An issue that no longer needs work.
 *
 * RESOLVED *and* CLOSED, because both are end states in `site_ops.issues.status` and the drawing has
 * one chip for the pair. Filing a closed issue under "open" would put finished work back in front of
 * the engineer; leaving it out of "resolved" would hide it from the only chip that would show it.
 */
export function isIssueClosed(status: string): boolean {
  return status === 'RESOLVED' || status === 'CLOSED';
}

export function matchesIssueFilter(issue: IssueLike, filter: IssueFilter): boolean {
  switch (filter) {
    case 'critical':
      return issue.severity === 'CRITICAL';
    case 'high':
      return issue.severity === 'HIGH';
    case 'open':
      return !isIssueClosed(issue.status);
    case 'resolved':
      return isIssueClosed(issue.status);
    default:
      return true;
  }
}

/** A palette role, not a colour — the screen resolves it, so light and dark stay one decision. */
export type IssueTone = 'danger' | 'warning' | 'primary' | 'muted' | 'success';

/**
 * The severity's own tone — the drawing's four card strips, top down: `mobile-danger` for CRITICAL,
 * `mobile-warning` for HIGH, `cos-blue` for MEDIUM. LOW is not drawn; it takes the neutral, which is
 * the same grey the drawing gives a card with nothing urgent about it.
 */
export function issueSeverityTone(severity: string): IssueTone {
  switch (severity) {
    case 'CRITICAL':
      return 'danger';
    case 'HIGH':
      return 'warning';
    case 'MEDIUM':
      return 'primary';
    default:
      return 'muted';
  }
}

/**
 * The tone of the card's left strip.
 *
 * A finished issue is GREEN whatever it once was — the drawing's last card is a resolved item with a
 * `mobile-success` strip, and that is the point: the strip answers "does this need me", not "how bad
 * was it". A resolved CRITICAL still glowing red would keep pulling the eye to work already done.
 */
export function issueStripTone(issue: IssueLike): IssueTone {
  return isIssueClosed(issue.status) ? 'success' : issueSeverityTone(issue.severity);
}
