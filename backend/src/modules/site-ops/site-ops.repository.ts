// SiteOps Repository — Phase 6
// All DB access via TenantPrismaService (SET LOCAL app.current_tenant_id per request — ADR-008).
// Uses $queryRaw (parameterized tagged template) — never raw string interpolation.

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { OutboxPublisher } from '@cos/kafka';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';
import type { OutboxEventInput } from '../../shared/outbox/outbox.types';
import { applyCap, capLimit } from '../../shared/pagination/list-cap';
import { clsTenantId } from '../../shared/context/cls-context';

// Row types live in ./site-ops.rows; imported here for the method signatures below and re-exported so
// existing `from './site-ops.repository'` type imports (service, specs) keep resolving.
import type {
  SiteReportRow,
  IssueRow,
  InspectionRow,
  SafetyChecklistRow,
  ManpowerLogRow,
  MaterialConsumptionRow,
  CarbonRecordRow,
  ConflictRecordRow,
} from './site-ops.rows';

export type * from './site-ops.rows';

// ── Repository ─────────────────────────────────────────────────────────────

@Injectable({ scope: Scope.REQUEST })
export class SiteOpsRepository {
  constructor(
    private readonly db: TenantPrismaService,
    @Inject(REQUEST) private readonly request: Request & { tenantId?: string },
  ) {}

  // CLS fallback is load-bearing, not cosmetic: under Fastify the REQUEST injected into a
  // Scope.REQUEST provider is not guaranteed to be the object the auth layer decorated. The auth
  // guards publish tenant_id into CLS (the same source TenantPrismaService reads for RLS), so this
  // resolves even when the request copy does not carry it.
  private get tenantId(): string {
    return this.request.tenantId ?? clsTenantId();
  }

  // ── Site Reports ───────────────────────────────────────────────────────

  async createSiteReport(
    params: {
      report_id: string;
      project_id: string;
      submitted_by: string;
      report_date: string;
      summary: string | null;
      blockers?: string | null;
      blocker_category?: string | null;
      weather: string | null;
      manpower_count: number | null;
      shift?: string | null;
      client_submitted_at: string | null;
      latitude?: number | null;
      longitude?: number | null;
    },
    outboxEvent?: OutboxEventInput,
  ): Promise<SiteReportRow> {
    const rows = await this.db.run(async (tx) => {
      const written = await tx.$queryRaw<SiteReportRow[]>`
        INSERT INTO site_ops.site_reports
          (report_id, project_id, tenant_id, report_date, submitted_by,
           summary, blockers, blocker_category, weather, manpower_count, shift,
           client_submitted_at, latitude, longitude)
        VALUES
          (${params.report_id}::uuid, ${params.project_id}::uuid,
           ${this.tenantId}::uuid, ${params.report_date}::date,
           ${params.submitted_by}::uuid,
           ${params.summary}, ${params.blockers ?? null}, ${params.blocker_category ?? null},
           ${params.weather}, ${params.manpower_count}, ${params.shift ?? null},
           ${params.client_submitted_at}::timestamptz,
           ${params.latitude ?? null}::numeric, ${params.longitude ?? null}::numeric)
        ON CONFLICT (project_id, report_date, submitted_by)
          DO UPDATE SET
            summary             = EXCLUDED.summary,
            blockers            = EXCLUDED.blockers,
            blocker_category    = EXCLUDED.blocker_category,
            weather             = EXCLUDED.weather,
            manpower_count      = EXCLUDED.manpower_count,
            shift               = EXCLUDED.shift,
            client_submitted_at = EXCLUDED.client_submitted_at,
            latitude            = EXCLUDED.latitude,
            longitude           = EXCLUDED.longitude,
            modified_at         = now()
        RETURNING *
      `;
      if (outboxEvent) await OutboxPublisher.write(tx, outboxEvent);
      return written;
    });
    return rows[0]!;
  }

  /**
   * Replace a report's per-trade manpower breakdown (site_ops.manpower_logs, master §Phase 6).
   *
   * DELETE-then-INSERT rather than upsert: the table has no natural key beyond its generated
   * `log_id`, and a resubmitted report is the authoritative statement of who was on site — a trade
   * the operator removed must disappear, which an insert-only path would never do. Both statements
   * run inside ONE db.run transaction so a report is never briefly left with no breakdown at all.
   *
   * An empty `lines` array is meaningful and honoured: it clears the breakdown.
   */
  async replaceManpowerLogs(
    reportId: string,
    lines: Array<{ trade_type: string; worker_count: number; hours_worked: number }>,
  ): Promise<void> {
    await this.db.run(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM site_ops.manpower_logs
        WHERE report_id = ${reportId}::uuid
          AND tenant_id = ${this.tenantId}::uuid
      `;
      for (const line of lines) {
        await tx.$executeRaw`
          INSERT INTO site_ops.manpower_logs
            (report_id, tenant_id, trade_type, worker_count, hours_worked)
          VALUES
            (${reportId}::uuid, ${this.tenantId}::uuid,
             ${line.trade_type}, ${line.worker_count}, ${line.hours_worked}::numeric)
        `;
      }
    });
  }

  /** A report's per-trade breakdown, ordered by headcount so the biggest trade reads first. */
  async listManpowerLogs(reportId: string): Promise<ManpowerLogRow[]> {
    return this.db.run(
      (tx) =>
        tx.$queryRaw<ManpowerLogRow[]>`
        SELECT * FROM site_ops.manpower_logs
        WHERE report_id = ${reportId}::uuid
          AND tenant_id = ${this.tenantId}::uuid
        ORDER BY worker_count DESC, trade_type ASC
      `,
    );
  }

  async findReportById(reportId: string): Promise<SiteReportRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<SiteReportRow[]>`
        SELECT * FROM site_ops.site_reports
        WHERE report_id = ${reportId}::uuid
          AND tenant_id = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  /**
   * Look up many reports at once, keyed by report_id.
   *
   * Exists for the offline-sync batch (syncSiteReports), which called findReportById once per item —
   * a full round trip AND its own `db.run` transaction per element, so a 200-report catch-up sync
   * opened 200 transactions before doing any work. Callers must pass validated UUIDs: a single
   * malformed id would fail the `::uuid[]` cast for the whole batch, whereas the per-item version
   * only failed that item.
   */
  async findReportsByIds(reportIds: string[]): Promise<Map<string, SiteReportRow>> {
    if (reportIds.length === 0) return new Map();
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<SiteReportRow[]>`
        SELECT * FROM site_ops.site_reports
        WHERE report_id = ANY(${reportIds}::uuid[])
          AND tenant_id = ${this.tenantId}::uuid
      `,
    );
    return new Map(rows.map((r) => [r.report_id, r]));
  }

  async listSiteReports(params: {
    project_id?: string;
    from_date?: string;
    to_date?: string;
    page: number;
    limit: number;
  }): Promise<{ rows: SiteReportRow[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<SiteReportRow[]>`
        SELECT * FROM site_ops.site_reports
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${params.project_id ?? null}::uuid IS NULL
               OR project_id = ${params.project_id ?? null}::uuid)
          AND (${params.from_date ?? null}::date IS NULL
               OR report_date >= ${params.from_date ?? null}::date)
          AND (${params.to_date ?? null}::date IS NULL
               OR report_date <= ${params.to_date ?? null}::date)
        ORDER BY report_date DESC
        LIMIT ${params.limit} OFFSET ${offset}
      `,
    );
    const countRows = await this.db.run(
      (tx) =>
        tx.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM site_ops.site_reports
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${params.project_id ?? null}::uuid IS NULL
               OR project_id = ${params.project_id ?? null}::uuid)
          AND (${params.from_date ?? null}::date IS NULL
               OR report_date >= ${params.from_date ?? null}::date)
          AND (${params.to_date ?? null}::date IS NULL
               OR report_date <= ${params.to_date ?? null}::date)
      `,
    );
    return { rows, total: Number(countRows[0]?.count ?? 0) };
  }

  /**
   * Apply a resolved offline edit to an existing report (ConflictHandler LAST_WRITE_WINS).
   *
   * Deliberately narrow: only the fields a site report's author can edit offline. `project_id`,
   * `report_date` and `submitted_by` form the row's natural identity (and the ON CONFLICT target of
   * createSiteReport), so an offline edit must never move a report to a different project or day —
   * that would be a new report, not an edit.
   *
   * Returns null when no row matched, so a caller cannot report a write that did not land.
   */
  async updateSiteReport(
    reportId: string,
    params: {
      summary: string | null;
      blockers: string | null;
      weather: string | null;
      manpower_count: number | null;
      client_submitted_at: string | null;
      latitude?: number | null;
      longitude?: number | null;
    },
  ): Promise<SiteReportRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<SiteReportRow[]>`
        UPDATE site_ops.site_reports
        SET summary             = ${params.summary},
            blockers            = ${params.blockers},
            weather             = ${params.weather},
            manpower_count      = ${params.manpower_count},
            client_submitted_at = ${params.client_submitted_at}::timestamptz,
            latitude            = ${params.latitude ?? null}::numeric,
            longitude           = ${params.longitude ?? null}::numeric,
            modified_at         = now()
        WHERE report_id = ${reportId}::uuid
          AND tenant_id = ${this.tenantId}::uuid
        RETURNING *
      `,
    );
    return rows[0] ?? null;
  }

  async updateReportStatus(reportId: string, status: 'SUBMITTED' | 'ACKNOWLEDGED'): Promise<void> {
    await this.db.run(
      (tx) =>
        tx.$queryRaw`
        UPDATE site_ops.site_reports
        SET status = ${status}, modified_at = now()
        WHERE report_id = ${reportId}::uuid
          AND tenant_id = ${this.tenantId}::uuid
      `,
    );
  }

  // ── Issues ─────────────────────────────────────────────────────────────

  /**
   * Next issue number for the tenant, as `ISS-<year>-<seq>` (ADR-069). Mirrors nextPrNumber: derived
   * from the highest existing number for that year (not a sequence), so the series stays per-tenant and
   * restarts each January. Called inside the caller's transaction; concurrent creates collide on
   * uq_issues_tenant_number, which is the constraint doing the real uniqueness work.
   */
  async nextIssueNumber(year: number): Promise<string> {
    const prefix = `ISS-${year}-`;
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<Array<{ max_seq: number | null }>>`
        SELECT MAX(NULLIF(regexp_replace(issue_number, '^ISS-[0-9]{4}-', ''), '')::int) AS max_seq
        FROM site_ops.issues
        WHERE tenant_id = ${this.tenantId}::uuid
          AND issue_number LIKE ${prefix + '%'}`,
    );
    const next = (rows[0]?.max_seq ?? 0) + 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  /**
   * Insert an issue under a caller-supplied id. Returns null when that id is already taken.
   *
   * `client_id` has been accepted on this path since G-M11, so that photos captured offline against
   * the client's UUID link up on sync — but nothing made the INSERT itself idempotent. A replayed
   * queue item hit the `issues_pkey` primary key and surfaced as a 500: better than a silent
   * duplicate, and worse than either, because the mutation stayed FAILED in the device's outbox and
   * retried until §17.2 discarded it. An issue raised on site could be reported, rejected five times
   * and thrown away without a word to the person who raised it.
   *
   * ON CONFLICT DO NOTHING is the same shape `createIncident`, `createDelivery` and
   * `createPurchaseRequest` use; the caller reads the existing row back and skips the side effects.
   */
  async createIssue(
    params: {
      issue_id: string;
      issue_number: string;
      project_id: string;
      report_id: string | null;
      title: string;
      description: string | null;
      severity: string;
      /**
       * DEFECT | REWORK | PUNCH | GENERAL. `null` lets the column's own DEFAULT 'GENERAL' apply, which
       * is what every caller got before the field was exposed — COALESCE below, not a TS default, so
       * the default lives in exactly one place (the schema).
       */
      issue_type?: string | null;
      assigned_to: string | null;
      /**
       * Who raised it. Passed in like `submitted_by` on a site report rather than read here, because
       * the repository holds tenant context but not the actor. Without it an issue the subject raised
       * but was never assigned is unattributable in their PDPA export (20260804000004).
       */
      created_by: string;
      client_submitted_at: string | null;
      latitude?: number | null;
      longitude?: number | null;
    },
    outboxEvent?: OutboxEventInput,
  ): Promise<IssueRow | null> {
    const rows = await this.db.run(async (tx) => {
      const written = await tx.$queryRaw<IssueRow[]>`
        INSERT INTO site_ops.issues
          (issue_id, issue_number, project_id, tenant_id, report_id, title, description,
           severity, issue_type, assigned_to, created_by, client_submitted_at, latitude, longitude)
        VALUES
          (${params.issue_id}::uuid, ${params.issue_number}, ${params.project_id}::uuid,
           ${this.tenantId}::uuid,
           ${params.report_id}::uuid,
           ${params.title}, ${params.description},
           ${params.severity}, COALESCE(${params.issue_type ?? null}, 'GENERAL'),
           ${params.assigned_to}::uuid, ${params.created_by}::uuid,
           ${params.client_submitted_at}::timestamptz,
           ${params.latitude ?? null}::numeric, ${params.longitude ?? null}::numeric)
        ON CONFLICT (issue_id) DO NOTHING
        RETURNING *
      `;
      if (outboxEvent) await OutboxPublisher.write(tx, outboxEvent);
      return written;
    });
    // `?? null`, not `rows[0]!` — ON CONFLICT DO NOTHING returns no row on a replayed create, and
    // the non-null assertion would hand the caller `undefined` typed as an IssueRow.
    return rows[0] ?? null;
  }

  async findIssueById(issueId: string): Promise<IssueRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<IssueRow[]>`
        SELECT * FROM site_ops.issues
        WHERE issue_id = ${issueId}::uuid
          AND tenant_id = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  async listIssues(params: {
    project_id?: string;
    severity?: string;
    status?: string;
    page: number;
    limit: number;
  }): Promise<{ rows: IssueRow[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<IssueRow[]>`
        SELECT * FROM site_ops.issues
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${params.project_id ?? null}::uuid IS NULL
               OR project_id = ${params.project_id ?? null}::uuid)
          AND (${params.severity ?? null}::text IS NULL
               OR severity = ${params.severity ?? null}::text)
          AND (${params.status ?? null}::text IS NULL
               OR status = ${params.status ?? null}::text)
        ORDER BY created_at DESC
        LIMIT ${params.limit} OFFSET ${offset}
      `,
    );
    const countRows = await this.db.run(
      (tx) =>
        tx.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM site_ops.issues
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${params.project_id ?? null}::uuid IS NULL
               OR project_id = ${params.project_id ?? null}::uuid)
          AND (${params.severity ?? null}::text IS NULL
               OR severity = ${params.severity ?? null}::text)
          AND (${params.status ?? null}::text IS NULL
               OR status = ${params.status ?? null}::text)
      `,
    );
    return { rows, total: Number(countRows[0]?.count ?? 0) };
  }

  async updateIssue(
    issueId: string,
    patch: Partial<{
      description: string | null;
      severity: string;
      status: string;
      assigned_to: string | null;
      resolution_note: string | null;
      client_submitted_at: string | null;
    }>,
  ): Promise<IssueRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<IssueRow[]>`
        UPDATE site_ops.issues SET
          description         = COALESCE(${patch.description ?? null},    description),
          severity            = COALESCE(${patch.severity ?? null},        severity),
          status              = COALESCE(${patch.status ?? null},          status),
          assigned_to         = CASE WHEN ${patch.assigned_to !== undefined} THEN ${patch.assigned_to ?? null}::uuid ELSE assigned_to END,
          resolution_note     = COALESCE(${patch.resolution_note ?? null}, resolution_note),
          client_submitted_at = COALESCE(${patch.client_submitted_at ?? null}::timestamptz, client_submitted_at),
          modified_at         = now()
        WHERE issue_id  = ${issueId}::uuid
          AND tenant_id = ${this.tenantId}::uuid
        RETURNING *
      `,
    );
    return rows[0] ?? null;
  }

  /**
   * Direct status transition (§35.13 ESC-21) — the write behind
   * `PATCH /api/v1/site/issues/:issueId/status`.
   *
   * Separate from `updateIssue`, which applies FIELD_LEVEL_MERGE and therefore always writes the
   * server's existing status back. Before this method existed, `issues.status` could not be
   * changed through any endpoint: every issue stayed OPEN for its whole life, and
   * `site.issue.status_changed.v1` was unreachable.
   *
   * @param buildOutboxEvent Builder over the UPDATEd row — skipped when the UPDATE matched
   *   nothing, so a missing issue emits no event.
   */
  async updateIssueStatus(
    issueId: string,
    status: string,
    resolutionNote: string | null,
    buildOutboxEvent?: (row: IssueRow) => OutboxEventInput,
  ): Promise<IssueRow | null> {
    const rows = await this.db.run(async (tx) => {
      const written = await tx.$queryRaw<IssueRow[]>`
        UPDATE site_ops.issues SET
          status          = ${status},
          resolution_note = COALESCE(${resolutionNote}, resolution_note),
          modified_at     = now()
        WHERE issue_id  = ${issueId}::uuid
          AND tenant_id = ${this.tenantId}::uuid
        RETURNING *
      `;
      if (buildOutboxEvent && written[0]) {
        await OutboxPublisher.write(tx, buildOutboxEvent(written[0]));
      }
      return written;
    });
    return rows[0] ?? null;
  }

  // ── Inspections ────────────────────────────────────────────────────────

  async createInspection(
    params: {
      inspection_id: string;
      project_id: string;
      checklist_id: string;
      status: string;
      inspected_by: string;
      inspected_at: string;
      notes: string | null;
      issue_severity?: string | null;
      /**
       * Drawn attestation mark — AnnotationStroke[] (migration 20260808000002). Serialised here rather
       * than in the service so the JSONB cast lives beside the query that needs it; `null` for an
       * unsigned inspection, which is every row created before the pad existed.
       */
      signature?: unknown[] | null;
      latitude?: number | null;
      longitude?: number | null;
    },
    outboxEvent?: OutboxEventInput,
  ): Promise<InspectionRow> {
    const rows = await this.db.run(async (tx) => {
      const written = await tx.$queryRaw<InspectionRow[]>`
        INSERT INTO site_ops.inspections
          (inspection_id, project_id, tenant_id, checklist_id, status,
           inspected_by, inspected_at, notes, issue_severity, signature, latitude, longitude)
        VALUES
          (${params.inspection_id}::uuid, ${params.project_id}::uuid,
           ${this.tenantId}::uuid, ${params.checklist_id}::uuid,
           ${params.status}, ${params.inspected_by}::uuid,
           ${params.inspected_at}::timestamptz, ${params.notes},
           ${params.issue_severity ?? null},
           ${params.signature ? JSON.stringify(params.signature) : null}::jsonb,
           ${params.latitude ?? null}::numeric, ${params.longitude ?? null}::numeric)
        RETURNING *
      `;
      if (outboxEvent) await OutboxPublisher.write(tx, outboxEvent);
      return written;
    });
    return rows[0]!;
  }

  async findInspections(params: {
    project_id?: string;
    status?: string;
    page: number;
    limit: number;
  }): Promise<{ rows: InspectionRow[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<InspectionRow[]>`
        SELECT * FROM site_ops.inspections
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${params.project_id ?? null}::uuid IS NULL
               OR project_id = ${params.project_id ?? null}::uuid)
          AND (${params.status ?? null}::text IS NULL
               OR status = ${params.status ?? null}::text)
        ORDER BY inspected_at DESC
        LIMIT ${params.limit} OFFSET ${offset}
      `,
    );
    const countRows = await this.db.run(
      (tx) =>
        tx.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM site_ops.inspections
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${params.project_id ?? null}::uuid IS NULL
               OR project_id = ${params.project_id ?? null}::uuid)
          AND (${params.status ?? null}::text IS NULL
               OR status = ${params.status ?? null}::text)
      `,
    );
    return { rows, total: Number(countRows[0]?.count ?? 0) };
  }

  async findInspectionById(inspectionId: string): Promise<InspectionRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<InspectionRow[]>`
        SELECT * FROM site_ops.inspections
        WHERE inspection_id = ${inspectionId}::uuid AND tenant_id = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  async updateInspectionStatus(
    params: {
      inspection_id: string;
      status: string;
      notes?: string | null;
    },
    buildOutboxEvent?: (row: InspectionRow) => OutboxEventInput,
  ): Promise<InspectionRow> {
    const rows = await this.db.run(async (tx) => {
      const written = await tx.$queryRaw<InspectionRow[]>`
        UPDATE site_ops.inspections SET
          status = ${params.status},
          notes = COALESCE(${params.notes ?? null}, notes)
        WHERE inspection_id = ${params.inspection_id}::uuid AND tenant_id = ${this.tenantId}::uuid
        RETURNING *
      `;
      // Builder over the UPDATEd row — project_id and checklist_id are only known from the row.
      if (buildOutboxEvent && written[0]) {
        await OutboxPublisher.write(tx, buildOutboxEvent(written[0]));
      }
      return written;
    });
    return rows[0]!;
  }

  async findChecklistById(checklistId: string): Promise<SafetyChecklistRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<SafetyChecklistRow[]>`
        SELECT * FROM site_ops.safety_checklists
        WHERE checklist_id = ${checklistId}::uuid
          AND tenant_id    = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  async listChecklists(project_id?: string): Promise<SafetyChecklistRow[]> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<SafetyChecklistRow[]>`
        SELECT * FROM site_ops.safety_checklists
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${project_id ?? null}::uuid IS NULL OR project_id = ${project_id ?? null}::uuid)
        ORDER BY created_at DESC
        LIMIT ${capLimit()}
      `,
    );
    return applyCap(rows, 'site-ops.safety_checklists');
  }

  // ── Conflict Records ───────────────────────────────────────────────────

  async createConflictRecord(
    params: {
      conflict_id: string;
      entity_type: string;
      entity_id: string;
      client_payload: Record<string, unknown>;
      server_payload: Record<string, unknown>;
      conflict_type: 'FIELD_CONFLICT' | 'STATUS_CONFLICT' | 'REJECTED';
    },
    outboxEvent?: OutboxEventInput,
  ): Promise<ConflictRecordRow> {
    const clientJson = JSON.stringify(params.client_payload);
    const serverJson = JSON.stringify(params.server_payload);
    const rows = await this.db.run(async (tx) => {
      const written = await tx.$queryRaw<ConflictRecordRow[]>`
        INSERT INTO site_ops.conflict_records
          (conflict_id, tenant_id, entity_type, entity_id,
           client_payload, server_payload, conflict_type)
        VALUES
          (${params.conflict_id}::uuid, ${this.tenantId}::uuid,
           ${params.entity_type}, ${params.entity_id}::uuid,
           ${clientJson}::jsonb, ${serverJson}::jsonb,
           ${params.conflict_type})
        RETURNING *
      `;
      if (outboxEvent) await OutboxPublisher.write(tx, outboxEvent);
      return written;
    });
    return rows[0]!;
  }

  async listConflictRecords(unresolvedOnly: boolean): Promise<ConflictRecordRow[]> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<ConflictRecordRow[]>`
        SELECT * FROM site_ops.conflict_records
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (NOT ${unresolvedOnly} OR reviewed_at IS NULL)
        ORDER BY created_at DESC
        LIMIT ${capLimit()}
      `,
    );
    return applyCap(rows, 'site-ops.conflict_records');
  }

  async resolveConflictRecord(
    conflictId: string,
    reviewedBy: string,
  ): Promise<ConflictRecordRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<ConflictRecordRow[]>`
        UPDATE site_ops.conflict_records
        SET reviewed_by  = ${reviewedBy}::uuid,
            reviewed_at  = now()
        WHERE conflict_id = ${conflictId}::uuid
          AND tenant_id   = ${this.tenantId}::uuid
          AND reviewed_at IS NULL
        RETURNING *
      `,
    );
    return rows[0] ?? null;
  }

  // ── Material Consumptions ──────────────────────────────────────────────

  async insertMaterialConsumption(
    params: {
      consumption_id: string;
      project_id: string;
      report_id: string;
      material_name: string;
      material_id: string;
      task_id: string | null;
      quantity: string;
      unit: string;
      consumed_by: string;
      consumed_at: string;
    },
    outboxEvent?: OutboxEventInput,
  ): Promise<MaterialConsumptionRow> {
    const rows = await this.db.run(async (tx) => {
      const written = await tx.$queryRaw<MaterialConsumptionRow[]>`
        INSERT INTO site_ops.material_consumptions
          (consumption_id, project_id, tenant_id, report_id,
           material_name, material_id, task_id,
           quantity, unit, consumed_by, consumed_at)
        VALUES
          (${params.consumption_id}::uuid, ${params.project_id}::uuid,
           ${this.tenantId}::uuid, ${params.report_id}::uuid,
           ${params.material_name}, ${params.material_id}::uuid,
           ${params.task_id},
           ${params.quantity}::decimal, ${params.unit},
           ${params.consumed_by}::uuid, ${params.consumed_at}::timestamptz)
        RETURNING *
      `;
      if (outboxEvent) await OutboxPublisher.write(tx, outboxEvent);
      return written;
    });
    return rows[0]!;
  }

  /**
   * Writes an outbox event with no accompanying business write (§35.13 ESC-13).
   * Used by escalateIssue, which changes no issue field — there is no row to be atomic *with*,
   * so the outbox serves purely as the durable at-least-once relay the previous direct publish
   * was not: a broker outage silently dropped the escalation.
   */
  async writeOutboxEvent(event: OutboxEventInput): Promise<void> {
    await this.db.run(async (tx) => {
      await OutboxPublisher.write(tx, event);
    });
  }

  // ── Carbon analytics (Phase 24 — spec §33.4) ───────────────────────────

  /**
   * Resolve a free-text material name against the tenant's material master.
   *
   * The consumption endpoint accepts a name typed on site (the mobile app is offline-first and has
   * no master-data cache), so a name may legitimately not exist yet. Returns null in that case —
   * the caller still records the consumption and simply skips carbon.
   * Matches `procurement.materials`' own UNIQUE (tenant_id, name).
   */
  async findMaterialIdByName(name: string): Promise<string | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<Array<{ material_id: string }>>`
        SELECT material_id
        FROM procurement.materials
        WHERE tenant_id = ${this.tenantId}::uuid AND name = ${name} AND is_active = true
      `,
    );
    return rows[0]?.material_id ?? null;
  }

  /** The tenant's emission factor for a material, or null when none has been loaded (§33.4). */
  async findCarbonFactor(
    materialId: string,
  ): Promise<{ carbon_factor: string; source: string } | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<Array<{ carbon_factor: string; source: string }>>`
        SELECT carbon_factor, source
        FROM site_ops.carbon_factors
        WHERE tenant_id = ${this.tenantId}::uuid AND material_id = ${materialId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  /**
   * Insert a carbon record for a consumption.
   *
   * ON CONFLICT DO NOTHING against the unique index on consumption_id: a replayed
   * site.material.consumed event must not double-count a project's footprint. Returns null when the
   * record already existed, so the caller can skip re-emitting carbon.record.created.v1.
   */
  async insertCarbonRecord(params: {
    carbon_record_id: string;
    project_id: string;
    consumption_id: string;
    material_id: string;
    quantity_consumed: string;
    unit: string;
    carbon_factor: string;
    carbon_factor_source: string;
  }): Promise<CarbonRecordRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<CarbonRecordRow[]>`
        INSERT INTO site_ops.carbon_records
          (carbon_record_id, tenant_id, project_id, consumption_id, material_id,
           quantity_consumed, unit, carbon_factor, carbon_factor_source, carbon_kgco2e)
        VALUES
          (${params.carbon_record_id}::uuid, ${this.tenantId}::uuid,
           ${params.project_id}::uuid, ${params.consumption_id}::uuid,
           ${params.material_id}::uuid,
           ${params.quantity_consumed}::decimal, ${params.unit},
           ${params.carbon_factor}::decimal, ${params.carbon_factor_source},
           -- kgCO₂e = quantity × factor (§33.4), evaluated in Postgres' numeric domain so the
           -- stored DECIMAL(19,4) carries no binary-float drift into audited emissions data.
           ${params.quantity_consumed}::decimal * ${params.carbon_factor}::decimal)
        ON CONFLICT (consumption_id) DO NOTHING
        RETURNING *
      `,
    );
    return rows[0] ?? null;
  }
}
