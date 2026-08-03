// SiteOps Repository — Phase 6
// All DB access via TenantPrismaService (SET LOCAL app.current_tenant_id per request — ADR-008).
// Uses $queryRaw (parameterized tagged template) — never raw string interpolation.

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';
import { clsTenantId } from '../../shared/context/cls-context';

// Row types live in ./site-ops.rows; imported here for the method signatures below and re-exported so
// existing `from './site-ops.repository'` type imports (service, specs) keep resolving. ManpowerLogRow
// is re-exported (via `export type *`) but not imported here — no method in this file references it.
import type {
  SiteReportRow,
  IssueRow,
  InspectionRow,
  SafetyChecklistRow,
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

  async createSiteReport(params: {
    report_id: string;
    project_id: string;
    submitted_by: string;
    report_date: string;
    summary: string | null;
    blockers?: string | null;
    weather: string | null;
    manpower_count: number | null;
    client_submitted_at: string | null;
    latitude?: number | null;
    longitude?: number | null;
  }): Promise<SiteReportRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<SiteReportRow[]>`
        INSERT INTO site_ops.site_reports
          (report_id, project_id, tenant_id, report_date, submitted_by,
           summary, blockers, weather, manpower_count, client_submitted_at, latitude, longitude)
        VALUES
          (${params.report_id}::uuid, ${params.project_id}::uuid,
           ${this.tenantId}::uuid, ${params.report_date}::date,
           ${params.submitted_by}::uuid,
           ${params.summary}, ${params.blockers ?? null}, ${params.weather}, ${params.manpower_count},
           ${params.client_submitted_at}::timestamptz,
           ${params.latitude ?? null}::numeric, ${params.longitude ?? null}::numeric)
        ON CONFLICT (project_id, report_date, submitted_by)
          DO UPDATE SET
            summary             = EXCLUDED.summary,
            blockers            = EXCLUDED.blockers,
            weather             = EXCLUDED.weather,
            manpower_count      = EXCLUDED.manpower_count,
            client_submitted_at = EXCLUDED.client_submitted_at,
            latitude            = EXCLUDED.latitude,
            longitude           = EXCLUDED.longitude,
            modified_at         = now()
        RETURNING *
      `,
    );
    return rows[0]!;
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

  async createIssue(params: {
    issue_id: string;
    issue_number: string;
    project_id: string;
    report_id: string | null;
    title: string;
    description: string | null;
    severity: string;
    assigned_to: string | null;
    client_submitted_at: string | null;
    latitude?: number | null;
    longitude?: number | null;
  }): Promise<IssueRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<IssueRow[]>`
        INSERT INTO site_ops.issues
          (issue_id, issue_number, project_id, tenant_id, report_id, title, description,
           severity, assigned_to, client_submitted_at, latitude, longitude)
        VALUES
          (${params.issue_id}::uuid, ${params.issue_number}, ${params.project_id}::uuid,
           ${this.tenantId}::uuid,
           ${params.report_id}::uuid,
           ${params.title}, ${params.description},
           ${params.severity}, ${params.assigned_to}::uuid,
           ${params.client_submitted_at}::timestamptz,
           ${params.latitude ?? null}::numeric, ${params.longitude ?? null}::numeric)
        RETURNING *
      `,
    );
    return rows[0]!;
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

  // ── Inspections ────────────────────────────────────────────────────────

  async createInspection(params: {
    inspection_id: string;
    project_id: string;
    checklist_id: string;
    status: string;
    inspected_by: string;
    inspected_at: string;
    notes: string | null;
    issue_severity?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  }): Promise<InspectionRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<InspectionRow[]>`
        INSERT INTO site_ops.inspections
          (inspection_id, project_id, tenant_id, checklist_id, status,
           inspected_by, inspected_at, notes, issue_severity, latitude, longitude)
        VALUES
          (${params.inspection_id}::uuid, ${params.project_id}::uuid,
           ${this.tenantId}::uuid, ${params.checklist_id}::uuid,
           ${params.status}, ${params.inspected_by}::uuid,
           ${params.inspected_at}::timestamptz, ${params.notes},
           ${params.issue_severity ?? null},
           ${params.latitude ?? null}::numeric, ${params.longitude ?? null}::numeric)
        RETURNING *
      `,
    );
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

  async updateInspectionStatus(params: {
    inspection_id: string;
    status: string;
    notes?: string | null;
  }): Promise<InspectionRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<InspectionRow[]>`
        UPDATE site_ops.inspections SET
          status = ${params.status},
          notes = COALESCE(${params.notes ?? null}, notes)
        WHERE inspection_id = ${params.inspection_id}::uuid AND tenant_id = ${this.tenantId}::uuid
        RETURNING *
      `,
    );
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
    return this.db.run(
      (tx) =>
        tx.$queryRaw<SafetyChecklistRow[]>`
        SELECT * FROM site_ops.safety_checklists
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${project_id ?? null}::uuid IS NULL OR project_id = ${project_id ?? null}::uuid)
        ORDER BY created_at DESC
      `,
    );
  }

  // ── Conflict Records ───────────────────────────────────────────────────

  async createConflictRecord(params: {
    conflict_id: string;
    entity_type: string;
    entity_id: string;
    client_payload: Record<string, unknown>;
    server_payload: Record<string, unknown>;
    conflict_type: 'FIELD_CONFLICT' | 'STATUS_CONFLICT' | 'REJECTED';
  }): Promise<ConflictRecordRow> {
    const clientJson = JSON.stringify(params.client_payload);
    const serverJson = JSON.stringify(params.server_payload);
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<ConflictRecordRow[]>`
        INSERT INTO site_ops.conflict_records
          (conflict_id, tenant_id, entity_type, entity_id,
           client_payload, server_payload, conflict_type)
        VALUES
          (${params.conflict_id}::uuid, ${this.tenantId}::uuid,
           ${params.entity_type}, ${params.entity_id}::uuid,
           ${clientJson}::jsonb, ${serverJson}::jsonb,
           ${params.conflict_type})
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async listConflictRecords(unresolvedOnly: boolean): Promise<ConflictRecordRow[]> {
    return this.db.run(
      (tx) =>
        tx.$queryRaw<ConflictRecordRow[]>`
        SELECT * FROM site_ops.conflict_records
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (NOT ${unresolvedOnly} OR reviewed_at IS NULL)
        ORDER BY created_at DESC
      `,
    );
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

  async insertMaterialConsumption(params: {
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
  }): Promise<MaterialConsumptionRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<MaterialConsumptionRow[]>`
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
      `,
    );
    return rows[0]!;
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
