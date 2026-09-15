// SYSTEM_ADMIN panel API shapes (R17, 2026-09-15) — declared once here, client-safe, and used by both the backend
// modules that return them (tenant audit reads, central-prices, platform-settings) and apps/web. Keys are
// snake_case: they are the tables' columns, returned by raw SQL.

// ── audit-log reads (backend/src/modules/tenant/admin-audit-log.service.ts) ─────────────────────

/** One audit row as the SYSTEM_ADMIN reads it. Keys are snake_case, as the table's columns. */
export interface AuditLogRow {
  log_id: string;
  /** ISO 8601, UTC, millisecond precision. */
  occurred_at: string;
  tenant_id: string;
  tenant_code: string;
  tenant_name: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  actor_id: string;
  /** From platform.users; null only if the user row cannot be joined. */
  actor_email: string | null;
  actor_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  /** metadata.justification in full; null when absent or blank. */
  justification: string | null;
  /** The row's metadata, with any credential-bearing URL replaced by [REDACTED]. `{}` when NULL. */
  metadata: Record<string, unknown>;
}

export interface AuditLogPage {
  rows: AuditLogRow[];
  /** Pass back as `cursor` for the next (older) page; null on the last page. */
  next_cursor: string | null;
}

export interface TenantAuditLogPage extends AuditLogPage {
  summary: {
    /** Every audit row of this tenant with occurred_at in the last 30 × 24 h. Ignores `q` and the cursor. */
    total_30d: number;
  };
}

/** The figures of the Global Audit Log cards. Definitions are on summarizeAuditLogs. */
export interface AuditLogSummary {
  total: number;
  today: number;
  with_justification: number;
  privileged: number;
  privileged_7d: number;
}

// ── ราคากลาง central prices (ADR-061; backend/src/modules/central-prices) ────────────────────────

/** ADR-061 source. Also the Avro enum `CentralPriceSource` — symbols may only ever be appended. */
export type CentralPriceSource = 'MANUAL_IMPORT' | 'GOV_API';

/**
 * How the register shows a row.
 *   INACTIVE — is_active = false. Never served to tenants or matched to a BOQ line.
 *   PENDING  — active, published_at IS NULL (ADR-061: not yet published). Never served to tenants.
 *   ACTIVE   — active and published. The only rows tenants read and BOQ lines are linked to.
 */
export type CentralPriceStatus = 'ACTIVE' | 'PENDING' | 'INACTIVE';

export type SyncRunKind = 'FILE_IMPORT' | 'GOV_API';

/**
 * SUCCEEDED      — the attempt ran; with a file import this includes a file where some rows were
 *                  rejected, as long as at least one row was written.
 * FAILED         — nothing was written: the file could not be read, lacked required columns, or every
 *                  row was rejected; or the adapter reported a failure.
 * NOT_CONFIGURED — the adapter has no usable upstream (D9: the e-GP adapter is a stub seam).
 */
export type SyncRunOutcome = 'SUCCEEDED' | 'FAILED' | 'NOT_CONFIGURED';

/** One catalog row as both the admin register and the tenant lookup return it. */
export interface CentralPriceRow {
  price_id: string;
  code: string;
  description: string;
  category: string | null;
  unit: string;
  /** DECIMAL(19,4) as stored, as a string — always four decimal places (e.g. "2450.0000"). */
  central_price: string;
  currency_code: string;
  effective_period: string;
  source: CentralPriceSource;
  source_ref: string | null;
  /** ISO 8601, or null while the row is not yet published. */
  published_at: string | null;
  is_active: boolean;
  status: CentralPriceStatus;
}

/** `GET /admin/central-prices` */
export interface CentralPriceListResponse {
  rows: CentralPriceRow[];
  /** Rows matching the filters, ignoring the cursor. */
  total: number;
  /** Pass back as `cursor` for the next page; null on the last page. */
  next_cursor: string | null;
  /** Every effective_period in the catalog, newest first — the register's period filter options. */
  periods: string[];
}

/** `GET /central-prices` (tenant read). */
export interface CentralPriceSearchResponse {
  rows: CentralPriceRow[];
  next_cursor: string | null;
}

/** One import or sync attempt (platform.central_price_sync_runs). */
export interface SyncRun {
  run_id: string;
  kind: SyncRunKind;
  source_name: string;
  effective_period: string | null;
  /** ISO 8601. */
  started_at: string;
  /** ISO 8601. */
  finished_at: string;
  outcome: SyncRunOutcome;
  records_total: number;
  records_inserted: number;
  records_updated: number;
  records_rejected: number;
  error_code: string | null;
  error_message: string | null;
  actor_id: string | null;
}

/** `GET /admin/central-prices/sync-status` */
export interface SyncStatusResponse {
  adapter: { name: string; configured: boolean };
  /** The newest attempt of either kind. */
  last_run: SyncRun | null;
  /** The newest attempt with outcome SUCCEEDED. */
  last_success: SyncRun | null;
  /** The newest attempt with outcome FAILED. NOT_CONFIGURED is not a failure and is not reported here. */
  last_failure: SyncRun | null;
}

/** A data row the import could not accept. `row` is the spreadsheet row number (the header is row 1). */
export interface RejectedRow {
  row: number;
  reason: string;
}

/** `POST /admin/central-prices/import` */
export interface ImportResult {
  run_id: string;
  outcome: SyncRunOutcome;
  records_total: number;
  inserted: number;
  updated: number;
  rejected: RejectedRow[];
}

// ── platform settings (ADR-108; backend/src/modules/platform-settings) ───────────────────────────
// STORED ONLY: nothing reads these values to change behaviour. Every field is nullable and null means "not set".

/** The plan tiers of `platform."PlanType"` — the tier table has one row per tier. */
export const PLAN_TIERS = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

/** Where an advance maintenance broadcast is delivered. */
export const BROADCAST_CHANNELS = ['IN_APP_BANNER', 'EMAIL_DIGEST'] as const;
export type BroadcastChannel = (typeof BROADCAST_CHANNELS)[number];

export interface TierLimits {
  db_strategy: string | null;
  storage_quota_gb: number | null;
  api_monthly_quota: number | null;
  token_limit_monthly: number | null;
}

export interface PlatformSettings {
  gateways: {
    primary: { name: string | null; url: string | null; protocol: string | null };
    secondary: { name: string | null; url: string | null; max_retries: number | null };
    /** Free text, e.g. "Daily 04:00 Asia/Bangkok". */
    auto_sync_cadence: string | null;
    failover_cache_ttl_hours: number | null;
    auto_fallback_on_timeout: boolean | null;
  };
  maintenance: {
    safety_non_suspension: boolean | null;
    /** STARTER + PROFESSIONAL window, free text. */
    shared_tiers_window: string | null;
    /** e.g. "ZERO_DOWNTIME". */
    enterprise_mode: string | null;
  };
  broadcast: { lead_time_hours: number | null; channels: BroadcastChannel[] };
  limits: { shared_tenant_cap: number | null; default_max_pool_conns: number | null };
  tiers: Record<PlanTier, TierLimits>;
}

/** The operator who saved the stored version. */
export interface PlatformSettingsActor {
  user_id: string;
  email: string;
  name: string;
}

/** `GET /api/v1/admin/settings` — and the body of a successful `PUT`. */
export interface PlatformSettingsResponse {
  /** 0 while nothing has ever been saved; the version a `PUT` must name. */
  version: number;
  /** ISO 8601, or null while nothing has ever been saved. */
  updated_at: string | null;
  updated_by: PlatformSettingsActor | null;
  settings: PlatformSettings;
  /** Live counts from platform.tenants — active tenants without / with a dedicated database. */
  counts: { shared_tenants: number; dedicated_tenants: number };
}
