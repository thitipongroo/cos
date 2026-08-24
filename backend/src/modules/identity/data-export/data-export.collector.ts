// PDPA §30/§31 export collector (ADR-078) — gathers one person's data, by category.
//
// SCOPE IS THE PLATFORM'S OWN @pdpa TAXONOMY, not the mockup's invented list. Every table below is
// here because migration 20260803000001_tag_pii_columns tagged a column on it, and every join below
// is a column that actually exists — verified against the CREATE TABLE statements, not assumed:
//
//   identity     platform.users · platform.trusted_devices.user_id · workforce.workers.user_id
//   contact      platform.users · workforce.workers.user_id
//   location     site_ops.site_reports.submitted_by · .incidents.reported_by
//                · .inspections.inspected_by · .issues.created_by|assigned_to|report chain
//                · workforce_telemetry.attendance_logs.worker_id ← workers.user_id
//   financial    workforce.project_workforce.worker_id · workforce_telemetry.timesheets.worker_id
//                (both ← workers.user_id)
//   operational  platform.audit_logs.actor_id · files.files.uploaded_by
//                · finance.payments.recorded_by
//
// THE WORKER LINK IS REAL. `workforce.workers.user_id` was added by migration
// 20260624000001_workers_user_id (nullable, `uq_workers_user_id` unique per tenant where set) so a
// signed-in worker can resolve "my worker" for GET /api/v1/workers/me. A comment in
// transparency-identity.tsx claimed there was "no join" — it was wrong, and believing it would have
// silently emptied three of the five categories. A user with no linked worker row legitimately gets
// nothing for those tables — and says so via `note`, because an empty section that does not explain
// itself reads the same as a section the export forgot to fill.
//
// ISSUES ARE ATTRIBUTED THREE WAYS: `created_by` (added 20260804000004), `assigned_to`, and the
// report chain `report_id → site_reports.submitted_by`. All three are needed. `created_by` is NULL on
// every issue predating that migration and cannot be backfilled — audit_logs has no resource_id and
// the outbox is a transient queue — so for historical rows the other two are the only attribution
// there is. `report_id` is nullable (SiteOpsService.createIssue defaults it to NULL), so the chain
// covers issues raised from a site report and nothing else.
//
// FINANCE IS NOT PAYROLL. There is no payroll table in this schema. `project_workforce.daily_rate` is
// an agreed rate and `timesheets` is hours worked; together they are the closest thing to earnings
// the platform holds. `finance.payments` is invoice-keyed with no personal payee, so only
// `recorded_by` is personal — it belongs in operational as an ACTION the subject performed, and the
// amount columns are the tenant's money, not theirs, so they are not exported into an individual's
// archive.
//
// AN EXPORT SPANS TWO DATABASES. `platform.*` is always on the shared platform database; every
// domain schema follows the tenant (a dedicated instance for ENTERPRISE). See `ExportDb` below for
// why passing one handle for both is a silent, legally wrong answer rather than a style choice.
//
// Every statement is schema-qualified and parameterised (QM-4). Reads run through the caller's
// transaction so `SET LOCAL app.current_tenant_id` is already in force and RLS applies — tenant
// isolation is not re-implemented here as a WHERE clause, it is inherited.

import type { PrismaClient } from '@prisma/client';

/** A tenant-scoped transaction handle, as `$transaction` yields it. */
export type Tx = Pick<PrismaClient, '$queryRaw' | '$queryRawUnsafe'>;

/**
 * The two databases an export spans. For a shared-DB tenant both are the same client; for an
 * ENTERPRISE tenant they are different servers, and conflating them is a silent, legally wrong answer.
 *
 * `migrateDataActivity` pg_dumps exactly ten schemas into a new dedicated instance — projects, boq,
 * procurement, finance, files, notifications, site_ops, equipment, workforce, ai. `platform` is
 * deliberately absent (get-db-url.ts: "platform schema never moves to a dedicated DB"). But
 * `prisma migrate deploy` runs EVERY migration against that instance first, so `platform.users`,
 * `platform.trusted_devices` and `platform.audit_logs` exist there and are EMPTY.
 *
 * A single handle pointed at the tenant URL would therefore return zero rows for identity, contact
 * and most of operational — no error, no warning, an archive that looks complete and answers a PDPA
 * §30 request with a lie. Hence two handles, named, with no default: forgetting the split has to be
 * a type error rather than a quiet omission in someone's subject-rights response.
 */
export interface ExportDb {
  /** platform.* — always the shared platform database. */
  platform: Tx;
  /** Domain schemas — the tenant's own database (dedicated for ENTERPRISE, shared otherwise). */
  tenant: Tx;
}

export type ExportCategory = 'identity' | 'contact' | 'location' | 'financial' | 'operational';

/** Optional reporting window. Both ends are inclusive; either may be absent. */
export interface DateWindow {
  from?: Date | null;
  to?: Date | null;
}

/** One table's worth of rows, named so the archive is readable without the schema to hand. */
export interface CollectedTable {
  table: string;
  /** How this table was attributed to the subject — shown in the archive so the export is auditable. */
  attributedBy: string;
  rows: Record<string, unknown>[];
  /**
   * Why this table is empty, when the reason is structural rather than "you have no records".
   *
   * A silently empty section is indistinguishable from one the export failed to fill, and a subject
   * cannot challenge a gap they cannot see. An office account has no worker profile, so the three
   * worker-keyed tables are not applicable to them — which is an answer, not a blank.
   */
  note?: string;
}

export type CollectedData = Record<ExportCategory, CollectedTable[]>;

/**
 * A table that was deliberately not queried, carried into the archive as an explained absence.
 *
 * Emitted instead of omitting the table so the archive lists the same tables for every subject —
 * a reader can then see the full scope of what the platform holds and where they fall outside it.
 */
function notApplicable(table: string, attributedBy: string, note: string): CollectedTable {
  return { table, attributedBy, rows: [], note };
}

/** The reason every worker-keyed table gives when the subject's account has no worker profile. */
const NO_WORKER_LINK =
  'Not applicable — this account is not linked to a worker profile ' +
  '(workforce.workers.user_id), and this table is keyed by worker_id. No records were withheld.';

/**
 * Resolve the subject's worker_id, if they have one.
 *
 * Three tables (workers, project_workforce, attendance_logs) key on worker_id rather than user_id,
 * so this single lookup decides whether they contribute anything at all. Returns null for a user
 * with no linked worker — an office account, or a worker created before the link existed.
 */
export async function resolveWorkerId(tenant: Tx, userId: string): Promise<string | null> {
  const rows = await tenant.$queryRaw<{ worker_id: string }[]>`
    SELECT worker_id FROM workforce.workers WHERE user_id = ${userId}::uuid LIMIT 1`;
  return rows[0]?.worker_id ?? null;
}

/**
 * Build the `BETWEEN`-style bounds for a window, as a pair of nullable values.
 *
 * Returned rather than interpolated so each query can apply it to its OWN date column — the tables
 * disagree about which column dates a record (report_date, occurred_at, recorded_at, inspected_at),
 * and using the wrong one would quietly return the wrong slice of someone's data.
 */
export function windowBounds(window: DateWindow): { from: Date | null; to: Date | null } {
  return { from: window.from ?? null, to: window.to ?? null };
}

export async function collectIdentity(
  db: ExportDb,
  userId: string,
  workerId: string | null,
  w: DateWindow,
): Promise<CollectedTable[]> {
  const { from, to } = windowBounds(w);
  const out: CollectedTable[] = [];

  // The account itself is never date-filtered: it is the subject's current record, not an event.
  const users = await db.platform.$queryRaw<Record<string, unknown>[]>`
    SELECT user_id, display_name, department, is_active, created_at, updated_at
      FROM platform.users WHERE user_id = ${userId}::uuid`;
  out.push({ table: 'platform.users', attributedBy: 'user_id', rows: users });

  const devices = await db.platform.$queryRaw<Record<string, unknown>[]>`
    SELECT device_id, platform, model, created_at, last_seen_at, expires_at, revoked_at
      FROM platform.trusted_devices
     WHERE user_id = ${userId}::uuid
       AND (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
       AND (${to}::timestamptz   IS NULL OR created_at <= ${to}::timestamptz)
     ORDER BY created_at`;
  out.push({ table: 'platform.trusted_devices', attributedBy: 'user_id', rows: devices });

  if (workerId) {
    const workers = await db.tenant.$queryRaw<Record<string, unknown>[]>`
      SELECT worker_id, employee_code, full_name, trade_type, employment_type, is_active, created_at
        FROM workforce.workers WHERE worker_id = ${workerId}::uuid`;
    out.push({ table: 'workforce.workers', attributedBy: 'workers.user_id', rows: workers });
  } else {
    out.push(notApplicable('workforce.workers', 'workers.user_id', NO_WORKER_LINK));
  }
  return out;
}

export async function collectContact(
  db: ExportDb,
  userId: string,
  workerId: string | null,
): Promise<CollectedTable[]> {
  const out: CollectedTable[] = [];

  const users = await db.platform.$queryRaw<Record<string, unknown>[]>`
    SELECT email, phone_number FROM platform.users WHERE user_id = ${userId}::uuid`;
  out.push({ table: 'platform.users', attributedBy: 'user_id', rows: users });

  if (workerId) {
    const workers = await db.tenant.$queryRaw<Record<string, unknown>[]>`
      SELECT contact_phone FROM workforce.workers WHERE worker_id = ${workerId}::uuid`;
    out.push({ table: 'workforce.workers', attributedBy: 'workers.user_id', rows: workers });
  } else {
    out.push(notApplicable('workforce.workers', 'workers.user_id', NO_WORKER_LINK));
  }
  return out;
}

export async function collectLocation(
  tenant: Tx,
  userId: string,
  workerId: string | null,
  w: DateWindow,
): Promise<CollectedTable[]> {
  const { from, to } = windowBounds(w);
  const out: CollectedTable[] = [];

  // Each table dates its records differently — report_date, created_at, inspected_at, recorded_at.
  const reports = await tenant.$queryRaw<Record<string, unknown>[]>`
    SELECT report_id, project_id, report_date, latitude, longitude, client_submitted_at
      FROM site_ops.site_reports
     WHERE submitted_by = ${userId}::uuid
       AND (${from}::date IS NULL OR report_date >= ${from}::date)
       AND (${to}::date   IS NULL OR report_date <= ${to}::date)
     ORDER BY report_date`;
  out.push({ table: 'site_ops.site_reports', attributedBy: 'submitted_by', rows: reports });

  const incidents = await tenant.$queryRaw<Record<string, unknown>[]>`
    SELECT incident_id, project_id, incident_type, severity, latitude, longitude, created_at
      FROM site_ops.incidents
     WHERE reported_by = ${userId}::uuid
       AND (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
       AND (${to}::timestamptz   IS NULL OR created_at <= ${to}::timestamptz)
     ORDER BY created_at`;
  out.push({ table: 'site_ops.incidents', attributedBy: 'reported_by', rows: incidents });

  const inspections = await tenant.$queryRaw<Record<string, unknown>[]>`
    SELECT inspection_id, project_id, status, latitude, longitude, inspected_at
      FROM site_ops.inspections
     WHERE inspected_by = ${userId}::uuid
       AND (${from}::timestamptz IS NULL OR inspected_at >= ${from}::timestamptz)
       AND (${to}::timestamptz   IS NULL OR inspected_at <= ${to}::timestamptz)
     ORDER BY inspected_at`;
  out.push({ table: 'site_ops.inspections', attributedBy: 'inspected_by', rows: inspections });

  // Three predicates, none redundant (see the header note): created_by is NULL on historical rows,
  // assigned_to is NULL on unassigned ones, and report_id is NULL on issues raised standalone.
  // `created_by` is selected so the subject can see WHICH of the three put each row in their export.
  const issues = await tenant.$queryRaw<Record<string, unknown>[]>`
    SELECT issue_id, project_id, title, severity, status, latitude, longitude,
           created_by, assigned_to, report_id, created_at
      FROM site_ops.issues
     WHERE (created_by  = ${userId}::uuid
         OR assigned_to = ${userId}::uuid
         OR report_id IN (SELECT report_id FROM site_ops.site_reports
                           WHERE submitted_by = ${userId}::uuid))
       AND (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
       AND (${to}::timestamptz   IS NULL OR created_at <= ${to}::timestamptz)
     ORDER BY created_at`;
  out.push({
    table: 'site_ops.issues',
    attributedBy: 'created_by | assigned_to | report_id → site_reports.submitted_by',
    rows: issues,
    // Stated on every export, including a full one: a subject cannot challenge a gap they are not
    // told about, and this one is invisible from the rows themselves.
    note:
      'created_by exists only for issues raised on or after 2026-08-04 (migration ' +
      '20260804000004). Older issues are attributed only if they were assigned to you or belong ' +
      'to a site report you submitted; who raised them was never recorded and cannot be recovered.',
  });

  if (workerId) {
    const attendance = await tenant.$queryRaw<Record<string, unknown>[]>`
      SELECT log_id, project_id, recorded_at, check_in_at, check_out_at, hours_worked,
             latitude, longitude
        FROM workforce_telemetry.attendance_logs
       WHERE worker_id = ${workerId}::uuid
         AND (${from}::timestamptz IS NULL OR recorded_at >= ${from}::timestamptz)
         AND (${to}::timestamptz   IS NULL OR recorded_at <= ${to}::timestamptz)
       ORDER BY recorded_at`;
    out.push({
      table: 'workforce_telemetry.attendance_logs',
      attributedBy: 'workers.user_id → worker_id',
      rows: attendance,
    });
  } else {
    out.push(
      notApplicable(
        'workforce_telemetry.attendance_logs',
        'workers.user_id → worker_id',
        NO_WORKER_LINK,
      ),
    );
  }
  return out;
}

export async function collectFinancial(
  tenant: Tx,
  workerId: string | null,
  w: DateWindow,
): Promise<CollectedTable[]> {
  // Rate AND hours. `daily_rate` alone is what was agreed; `timesheets` is what was actually worked,
  // and a person cannot tell what their work was worth from either half on its own. Neither is a
  // payslip: Phase 7 states the finance service is project cost tracking, and there is no payroll
  // table in this schema — finance.payments is invoice-keyed with no personal payee, so it is an
  // operational record of an action, not this person's money (see collectOperational).
  if (!workerId) {
    return [
      notApplicable('workforce.project_workforce', 'workers.user_id → worker_id', NO_WORKER_LINK),
      notApplicable(
        'workforce_telemetry.timesheets',
        'workers.user_id → worker_id',
        NO_WORKER_LINK,
      ),
    ];
  }
  const { from, to } = windowBounds(w);
  const allocations = await tenant.$queryRaw<Record<string, unknown>[]>`
    SELECT allocation_id, project_id, role_on_project, start_date, end_date,
           daily_rate, currency_code
      FROM workforce.project_workforce
     WHERE worker_id = ${workerId}::uuid
       AND (${from}::date IS NULL OR start_date >= ${from}::date)
       AND (${to}::date   IS NULL OR start_date <= ${to}::date)
     ORDER BY start_date`;

  // Windowed on period_date — the day the hours were worked, not when the sheet was keyed in, which
  // is the date the subject would recognise as theirs.
  const timesheets = await tenant.$queryRaw<Record<string, unknown>[]>`
    SELECT timesheet_id, project_id, period_date, regular_hours, overtime_hours, status
      FROM workforce_telemetry.timesheets
     WHERE worker_id = ${workerId}::uuid
       AND (${from}::date IS NULL OR period_date >= ${from}::date)
       AND (${to}::date   IS NULL OR period_date <= ${to}::date)
     ORDER BY period_date`;

  return [
    {
      table: 'workforce.project_workforce',
      attributedBy: 'workers.user_id → worker_id',
      rows: allocations,
    },
    {
      table: 'workforce_telemetry.timesheets',
      attributedBy: 'workers.user_id → worker_id',
      rows: timesheets,
    },
  ];
}

/**
 * The only category that spans both databases: audit_logs is platform, files and payments are the
 * tenant's. For a shared-DB tenant the two handles are the same client and this reads as one query
 * set; for an ENTERPRISE tenant it is genuinely two servers.
 */
export async function collectOperational(
  db: ExportDb,
  userId: string,
  w: DateWindow,
): Promise<CollectedTable[]> {
  const { from, to } = windowBounds(w);

  const audit = await db.platform.$queryRaw<Record<string, unknown>[]>`
    SELECT log_id, action, resource_type, resource_id, ip_address, user_agent, occurred_at
      FROM platform.audit_logs
     WHERE actor_id = ${userId}::uuid
       AND (${from}::timestamptz IS NULL OR occurred_at >= ${from}::timestamptz)
       AND (${to}::timestamptz   IS NULL OR occurred_at <= ${to}::timestamptz)
     ORDER BY occurred_at`;

  // Metadata only. The FILE CONTENTS are not inlined: an export is a portability artefact, and
  // embedding every photo a site worker ever uploaded would produce an archive nobody can mail and
  // would duplicate data the subject can already download individually.
  const files = await db.tenant.$queryRaw<Record<string, unknown>[]>`
    SELECT file_id, original_filename, mime_type, file_size_bytes, file_status, uploaded_at
      FROM files.files
     WHERE uploaded_by = ${userId}::uuid
       AND deleted_at IS NULL
       AND (${from}::timestamptz IS NULL OR uploaded_at >= ${from}::timestamptz)
       AND (${to}::timestamptz   IS NULL OR uploaded_at <= ${to}::timestamptz)
     ORDER BY uploaded_at`;

  // Payments the subject KEYED IN. `recorded_by` traces an action to a user exactly as
  // audit_logs.actor_id does — which is why this sits in operational and not financial.
  //
  // amount and currency_code are deliberately NOT selected. The money belongs to the tenant, not to
  // the person who typed it in; exporting it would put the company's finances into an individual's
  // portable archive, including a former employee's. payment_reference is included because it is the
  // subject's own entry, and identifies which record their action attaches to.
  const payments = await db.tenant.$queryRaw<Record<string, unknown>[]>`
    SELECT payment_id, project_id, payment_date, payment_reference, status, created_at
      FROM finance.payments
     WHERE recorded_by = ${userId}::uuid
       AND (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
       AND (${to}::timestamptz   IS NULL OR created_at <= ${to}::timestamptz)
     ORDER BY created_at`;

  return [
    { table: 'platform.audit_logs', attributedBy: 'actor_id', rows: audit },
    { table: 'files.files', attributedBy: 'uploaded_by', rows: files },
    {
      table: 'finance.payments',
      attributedBy: 'recorded_by',
      rows: payments,
      note:
        'Payment entries you recorded. Amounts are excluded — they are the organisation’s financial ' +
        'data, not yours; what is personal here is that you performed the entry.',
    },
  ];
}

/** Collect every requested category. Unrequested categories are absent, not empty. */
export async function collect(
  db: ExportDb,
  userId: string,
  categories: readonly ExportCategory[],
  w: DateWindow,
): Promise<Partial<CollectedData>> {
  const needsWorker =
    categories.includes('identity') ||
    categories.includes('contact') ||
    categories.includes('location') ||
    categories.includes('financial');
  // workforce.workers lives with the domain schemas, so the lookup goes to the tenant database even
  // though what it resolves is an identity link.
  const workerId = needsWorker ? await resolveWorkerId(db.tenant, userId) : null;

  const out: Partial<CollectedData> = {};
  if (categories.includes('identity'))
    out.identity = await collectIdentity(db, userId, workerId, w);
  if (categories.includes('contact')) out.contact = await collectContact(db, userId, workerId);
  if (categories.includes('location'))
    out.location = await collectLocation(db.tenant, userId, workerId, w);
  if (categories.includes('financial'))
    out.financial = await collectFinancial(db.tenant, workerId, w);
  if (categories.includes('operational')) out.operational = await collectOperational(db, userId, w);
  return out;
}
