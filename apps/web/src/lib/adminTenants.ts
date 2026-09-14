/**
 * The SYSTEM_ADMIN Tenant List's decisions, kept out of the components so they sit inside the QM-1
 * 100% gate (jest.config.js collects coverage from src/lib only — components are Playwright's).
 *
 * Every figure the page shows is computed here from what the API returned, and nothing else. The
 * Stitch drawing ("Tenant List & DB Provisioning - SYSTEM_ADMIN") also shows Cluster Pulse, EMQX and
 * PG-fleet figures, Platform Compute and an average gate time; none of those has a source in this
 * repository yet, and they are specified for round 2 rather than drawn here (product-owner decision
 * 2026-09-14).
 */

export type PlanType = 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

/** One row of GET /admin/tenants — snake_case, as the endpoint returns it. */
export interface TenantListRow {
  tenant_id: string;
  tenant_code: string;
  tenant_name: string;
  /** Shown under the name — the drawing's second line holds an identifier, and this is the real one. */
  keycloak_realm: string;
  plan_type: PlanType;
  is_active: boolean;
  data_region: string;
  created_at: string;
  /** Hostname of the dedicated DB, or null on the shared database. Never the URL. */
  dedicated_db_host: string | null;
}

/** One row of GET /admin/tenants/provisioning. `null` state = the run exists but did not answer. */
export interface TenantProvisioningRow {
  tenant_id: string;
  workflow_state: string | null;
}

/** §34.3 states, in the order a run passes through them. PROVISIONING_TOPICS is in the code only. */
export const PROVISIONING_STATES = [
  'CREATING_RDS',
  'RUNNING_MIGRATIONS',
  'ASSIGNING_DB',
  'AWAITING_APPROVAL',
  'MIGRATING_DATA',
  'VERIFYING',
  'PROVISIONING_TOPICS',
  'COMPLETED',
  'ABORTING',
  'ABORTED',
] as const;

export const GATE_STATE = 'AWAITING_APPROVAL';

export type ProvisioningTone = 'ready' | 'gate' | 'working' | 'stopped' | 'unknown' | 'none';

export interface ProvisioningView {
  /** i18n key — never copy (QM-3). */
  labelKey: string;
  tone: ProvisioningTone;
}

/**
 * How one tenant's provisioning cell reads.
 *
 * Three different absences, kept apart on purpose: no run at all (`undefined` — the tenant is simply
 * not in the provisioning list), a run that could not be read (`null`), and a state string this
 * client does not know (a newer backend). The last is shown as unrecognised, never mapped onto the
 * nearest known state.
 *
 * NO RUN reads as the drawing reads it (product-owner decision 2026-09-14, Q3): "✓ Active" for an active
 * tenant — nothing is being provisioned and the tenant is in service — and `—` for an inactive one.
 */
export function provisioningView(
  state: string | null | undefined,
  isActive: boolean,
): ProvisioningView {
  if (state === undefined) {
    return isActive
      ? { labelKey: 'admin.provisioning.active', tone: 'ready' }
      : { labelKey: 'admin.provisioning.none', tone: 'none' };
  }
  if (state === null) return { labelKey: 'admin.provisioning.unreadable', tone: 'unknown' };
  if (!(PROVISIONING_STATES as readonly string[]).includes(state)) {
    return { labelKey: 'admin.provisioning.unrecognised', tone: 'unknown' };
  }
  const labelKey = `admin.provisioning.state.${state}`;
  if (state === 'COMPLETED') return { labelKey, tone: 'ready' };
  if (state === GATE_STATE) return { labelKey, tone: 'gate' };
  if (state === 'ABORTING' || state === 'ABORTED') return { labelKey, tone: 'stopped' };
  return { labelKey, tone: 'working' };
}

export type StatusTone = 'active' | 'inactive' | 'transit' | 'pending';

export interface StatusView {
  /** i18n key — never copy (QM-3). */
  labelKey: string;
  tone: StatusTone;
}

/**
 * The STATUS column (product-owner decision 2026-09-15, R11.4): a run parked at the migration gate reads
 * Transit, a run still in progress — including one compensating an abort — reads Pending, and everything else
 * is the tenant's own `is_active`. No run, an unreadable run, an unrecognised state, COMPLETED and ABORTED all
 * fall through to `is_active`: none of them says the tenant is between databases.
 */
export function statusView(state: string | null | undefined, isActive: boolean): StatusView {
  if (state === GATE_STATE) return { labelKey: 'admin.status.transit', tone: 'transit' };
  if (
    typeof state === 'string' &&
    (PROVISIONING_STATES as readonly string[]).includes(state) &&
    state !== 'COMPLETED' &&
    state !== 'ABORTED'
  ) {
    return { labelKey: 'admin.status.pending', tone: 'pending' };
  }
  return isActive
    ? { labelKey: 'admin.status.active', tone: 'active' }
    : { labelKey: 'admin.status.inactive', tone: 'inactive' };
}

/** tenant_id → workflow_state, so a row can tell "no run" (absent) from "unreadable" (null). */
export function provisioningByTenant(
  rows: readonly TenantProvisioningRow[] | undefined,
): Map<string, string | null> {
  return new Map((rows ?? []).map((r) => [r.tenant_id, r.workflow_state]));
}

export interface TenantMetrics {
  total: number;
  active: number;
  inactive: number;
  /** Created within the last 7 × 24 h of `now` — a rolling week, not a calendar one. */
  createdThisWeek: number;
  /** Tenants whose list row carries a dedicated DB host. */
  dedicated: number;
  /** Provisioning runs parked at AWAITING_APPROVAL. */
  awaitingGate: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function tenantMetrics(
  tenants: readonly TenantListRow[],
  provisioning: readonly TenantProvisioningRow[] | undefined,
  now: Date,
): TenantMetrics {
  const since = now.getTime() - WEEK_MS;
  const active = tenants.filter((t) => t.is_active).length;
  return {
    total: tenants.length,
    active,
    inactive: tenants.length - active,
    createdThisWeek: tenants.filter((t) => new Date(t.created_at).getTime() >= since).length,
    dedicated: tenants.filter((t) => t.dedicated_db_host !== null).length,
    awaitingGate: (provisioning ?? []).filter((p) => p.workflow_state === GATE_STATE).length,
  };
}

export type PlanFilter = 'ALL' | PlanType;

/** Case-insensitive match on code, name, dedicated host and region, then the plan chip. */
export function filterTenants(
  tenants: readonly TenantListRow[],
  query: string,
  plan: PlanFilter,
): TenantListRow[] {
  const q = query.trim().toLowerCase();
  return tenants.filter((t) => {
    if (plan !== 'ALL' && t.plan_type !== plan) return false;
    if (q === '') return true;
    return [t.tenant_code, t.tenant_name, t.dedicated_db_host ?? '', t.data_region].some((field) =>
      field.toLowerCase().includes(q),
    );
  });
}

export interface Page<T> {
  rows: T[];
  /** 1-based, clamped into range. */
  page: number;
  pageCount: number;
  /** 1-based index of the first row shown; 0 when there are none. */
  from: number;
  to: number;
  total: number;
}

export const PAGE_SIZE = 10;

export function paginate<T>(rows: readonly T[], page: number, pageSize = PAGE_SIZE): Page<T> {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, Math.floor(page)), pageCount);
  const start = (current - 1) * pageSize;
  const slice = rows.slice(start, start + pageSize);
  return {
    rows: slice,
    page: current,
    pageCount,
    from: total === 0 ? 0 : start + 1,
    to: start + slice.length,
    total,
  };
}

/**
 * The page buttons to draw: the first, the last, and the current page with one neighbour each side,
 * with an ellipsis wherever pages are skipped — "1 2 3 … 35" as the drawing shows it.
 */
export function pageNumbers(page: number, pageCount: number): Array<number | 'ellipsis'> {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1]);
  const pages = [...wanted].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const out: Array<number | 'ellipsis'> = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1]! > 1) out.push('ellipsis');
    out.push(p);
  });
  return out;
}

/** The page a tenant code sits on, so a freshly created tenant is shown and highlighted (§20.4.2). */
export function pageOf(rows: readonly TenantListRow[], code: string, pageSize = PAGE_SIZE): number {
  const index = rows.findIndex((r) => r.tenant_code === code);
  return index < 0 ? 1 : Math.floor(index / pageSize) + 1;
}

/** Tenants whose run is waiting at the gate, in list order — one banner each. */
export function tenantsAtGate(
  tenants: readonly TenantListRow[],
  provisioning: readonly TenantProvisioningRow[] | undefined,
): TenantListRow[] {
  const states = provisioningByTenant(provisioning);
  return tenants.filter((t) => states.get(t.tenant_id) === GATE_STATE);
}

export type AdminActionContext = 'create' | 'decision' | 'rowAction';

/**
 * The message for a failed admin request, by status. The API client exposes only the status, so the
 * copy says what that status means for THIS action and does not claim a detail it cannot see.
 */
export function errorKeyForStatus(status: number | undefined, context: AdminActionContext): string {
  if (status === 400) return 'admin.errors.invalid';
  if (status === 403) return 'admin.errors.forbidden';
  if (status === 404)
    return context === 'decision' ? 'admin.errors.noRun' : 'admin.errors.notFound';
  if (status === 409) {
    return context === 'create'
      ? 'admin.errors.codeTaken'
      : context === 'decision'
        ? 'admin.errors.notAtGate'
        : 'admin.errors.conflict';
  }
  if (status === 503) return 'admin.errors.stateUnreadable';
  return 'admin.errors.generic';
}

/** PostgreSQL's default port, used when a connection URL names none. */
export const POSTGRES_DEFAULT_PORT = '5432';

/**
 * The port a dedicated database URL names, for the modal's "Port … Open" badge (R13). A URL without a port means
 * PostgreSQL's default; a value that does not parse as a URL has no port to show (`null`).
 */
export function dbUrlPort(url: string): string | null {
  try {
    return new URL(url).port || POSTGRES_DEFAULT_PORT;
  } catch {
    return null;
  }
}

/** Up to two initials for the avatar; `?` when there is no name to take them from. */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const letters = parts.length === 1 ? parts[0]!.slice(0, 2) : parts[0]![0]! + parts[1]![0]!;
  return letters.toUpperCase();
}

export type ConnectionState = 'checking' | 'online' | 'offline';

/**
 * The top bar's connection pill (Q1, product-owner decision 2026-09-14). The drawing's `SYNCED` pill sits
 * there; the admin panel queues nothing offline, so what it reports instead is whether the last tenant
 * list request reached the API.
 */
export function connectionState(query: { isError: boolean; isSuccess: boolean }): ConnectionState {
  if (query.isError) return 'offline';
  return query.isSuccess ? 'online' : 'checking';
}
