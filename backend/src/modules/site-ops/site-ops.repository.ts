// SiteOps Repository — Phase 6
// All DB access via TenantPrismaService (SET LOCAL app.current_tenant_id per request — ADR-008).
// Uses $queryRaw (parameterized tagged template) — never raw string interpolation.

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';

// ── Row types ──────────────────────────────────────────────────────────────

export interface SiteReportRow {
  report_id: string;
  project_id: string;
  tenant_id: string;
  report_date: Date;
  submitted_by: string;
  status: 'DRAFT' | 'SUBMITTED' | 'ACKNOWLEDGED';
  summary: string | null;
  weather: string | null;
  manpower_count: number | null;
  client_submitted_at: Date | null;
  server_received_at: Date;
  modified_at: Date;
}

export interface IssueRow {
  issue_id: string;
  project_id: string;
  tenant_id: string;
  report_id: string | null;
  title: string;
  description: string | null;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  assigned_to: string | null;
  resolution_note: string | null;
  client_submitted_at: Date | null;
  modified_at: Date;
  created_at: Date;
}

export interface InspectionRow {
  inspection_id: string;
  project_id: string;
  tenant_id: string;
  checklist_id: string;
  status: 'PENDING' | 'PASSED' | 'FAILED' | 'REQUIRES_REINSPECTION';
  inspected_by: string;
  inspected_at: Date;
  notes: string | null;
}

export interface SafetyChecklistRow {
  checklist_id: string;
  project_id: string;
  tenant_id: string;
  checklist_name: string;
  version: number;
  items: unknown; // JSONB
  created_at: Date;
}

export interface ManpowerLogRow {
  log_id: string;
  report_id: string;
  tenant_id: string;
  trade_type: string;
  worker_count: number;
  hours_worked: string; // DECIMAL as string
}

export interface MaterialConsumptionRow {
  consumption_id: string;
  project_id: string;
  tenant_id: string;
  report_id: string | null;
  material_name: string;
  material_id: string;
  task_id: string | null;
  quantity: string; // DECIMAL as string
  unit: string;
  consumed_by: string;
  consumed_at: Date;
  created_at: Date;
}

export interface ConflictRecordRow {
  conflict_id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  client_payload: unknown; // JSONB
  server_payload: unknown; // JSONB
  conflict_type: 'FIELD_CONFLICT' | 'STATUS_CONFLICT' | 'REJECTED';
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date;
}

// ── Repository ─────────────────────────────────────────────────────────────

@Injectable({ scope: Scope.REQUEST })
export class SiteOpsRepository {
  constructor(
    private readonly db: TenantPrismaService,
    @Inject(REQUEST) private readonly request: Request & { tenantId?: string },
  ) {}

  private get tenantId(): string {
    return this.request.tenantId ?? '';
  }

  // ── Site Reports ───────────────────────────────────────────────────────

  async createSiteReport(params: {
    report_id: string;
    project_id: string;
    submitted_by: string;
    report_date: string;
    summary: string | null;
    weather: string | null;
    manpower_count: number | null;
    client_submitted_at: string | null;
  }): Promise<SiteReportRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<SiteReportRow[]>`
        INSERT INTO site_ops.site_reports
          (report_id, project_id, tenant_id, report_date, submitted_by,
           summary, weather, manpower_count, client_submitted_at)
        VALUES
          (${params.report_id}::uuid, ${params.project_id}::uuid,
           ${this.tenantId}::uuid, ${params.report_date}::date,
           ${params.submitted_by}::uuid,
           ${params.summary}, ${params.weather}, ${params.manpower_count},
           ${params.client_submitted_at}::timestamptz)
        ON CONFLICT (project_id, report_date, submitted_by)
          DO UPDATE SET
            summary             = EXCLUDED.summary,
            weather             = EXCLUDED.weather,
            manpower_count      = EXCLUDED.manpower_count,
            client_submitted_at = EXCLUDED.client_submitted_at,
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

  async createIssue(params: {
    issue_id: string;
    project_id: string;
    report_id: string | null;
    title: string;
    description: string | null;
    severity: string;
    assigned_to: string | null;
    client_submitted_at: string | null;
  }): Promise<IssueRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<IssueRow[]>`
        INSERT INTO site_ops.issues
          (issue_id, project_id, tenant_id, report_id, title, description,
           severity, assigned_to, client_submitted_at)
        VALUES
          (${params.issue_id}::uuid, ${params.project_id}::uuid,
           ${this.tenantId}::uuid,
           ${params.report_id}::uuid,
           ${params.title}, ${params.description},
           ${params.severity}, ${params.assigned_to}::uuid,
           ${params.client_submitted_at}::timestamptz)
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
          AND (${params.severity ?? null} IS NULL
               OR severity = ${params.severity ?? null})
          AND (${params.status ?? null} IS NULL
               OR status = ${params.status ?? null})
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
          AND (${params.severity ?? null} IS NULL
               OR severity = ${params.severity ?? null})
          AND (${params.status ?? null} IS NULL
               OR status = ${params.status ?? null})
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
  }): Promise<InspectionRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<InspectionRow[]>`
        INSERT INTO site_ops.inspections
          (inspection_id, project_id, tenant_id, checklist_id, status,
           inspected_by, inspected_at, notes)
        VALUES
          (${params.inspection_id}::uuid, ${params.project_id}::uuid,
           ${this.tenantId}::uuid, ${params.checklist_id}::uuid,
           ${params.status}, ${params.inspected_by}::uuid,
           ${params.inspected_at}::timestamptz, ${params.notes})
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
}
