/**
 * Pure helpers for the SYSTEM_ADMIN audit-log screens (R17.5 / R17.7). The React Query bindings are in
 * `lib/api/adminAudit.ts`; what the pages compute from a row lives here so a spec can hold it.
 */

/** Query string of the set keys only, in a stable (alphabetical) order; `''` when nothing is set. */
export function auditQuery(params: Record<string, string | number | undefined | null>): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return entries.length === 0 ? '' : `?${entries.join('&')}`;
}

export type AuditTone = 'danger' | 'gate' | 'privileged' | 'config' | 'read' | 'other';

/**
 * How an action is coloured in the ledger. Only the families this repository writes are named: the §6.7 tenant
 * actions (deactivation red, the provisioning gate amber, the rest the privileged blue), platform settings changes,
 * and the audit reads themselves. Anything else is `other` rather than a guess.
 */
export function auditTone(action: string): AuditTone {
  if (action === 'tenant.deactivate') return 'danger';
  if (action.startsWith('tenant.provisioning.')) return 'gate';
  if (action.startsWith('tenant.')) return 'privileged';
  if (action.startsWith('platform.settings.') || action.startsWith('central_prices.'))
    return 'config';
  if (action.startsWith('audit.')) return 'read';
  return 'other';
}

/** `YYYY-MM-DD` of a date in UTC — the backend reads a bare date as 00:00 UTC. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The exclusive `to` for an inclusive end day: the next UTC day. */
export function exclusiveTo(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return utcDay(d);
}

/**
 * The Global Audit Log's "All Action Categories" select (Stitch 9). Each drawn category maps to the `action` filter the
 * backend takes — an exact action, or a prefix ending in `.` — using only the actions `TenantAdminAction` records
 * (backend tenant.service.ts). `null` means the category has no recorded action yet, so the option is disabled.
 */
export const AUDIT_ACTION_FILTERS = [
  { key: 'all', action: undefined },
  { key: 'deactivate', action: 'tenant.deactivate' },
  { key: 'provision', action: 'tenant.assign_dedicated_db' },
  { key: 'tier', action: 'tenant.mark_contracted' },
  { key: 'gateway', action: null },
  { key: 'gate', action: 'tenant.provisioning.' },
] as const satisfies ReadonlyArray<{ key: string; action: string | null | undefined }>;

export type AuditActionFilterKey = (typeof AUDIT_ACTION_FILTERS)[number]['key'];

/** The `action` query value for a category key; `undefined` for All or a category with no action. */
export function auditActionFor(key: AuditActionFilterKey): string | undefined {
  // The key type is drawn from the list itself, so the entry always exists.
  return AUDIT_ACTION_FILTERS.find((f) => f.key === key)!.action ?? undefined;
}

/**
 * OPERATOR JUSTIFICATIONS card: the share of audited SYSTEM_ADMIN tenant actions in range that carry a justification.
 * `privileged` is the count of those actions in the same range; `percent` is `null` when there are none (0 of 0 is not
 * 100%), otherwise rounded down so 99.6% never reads as complete.
 */
export function justificationShare(
  withJustification: number,
  privileged: number,
): { percent: number | null; missing: number } {
  if (privileged <= 0) return { percent: null, missing: 0 };
  const missing = Math.max(0, privileged - withJustification);
  return {
    percent: Math.floor((Math.min(withJustification, privileged) / privileged) * 100),
    missing,
  };
}
