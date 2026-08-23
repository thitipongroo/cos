// SiteOps Service — Phase 6
// Business logic: site reports, offline sync, issue tracking, inspections, conflict resolution.
// Conflict strategies per spec §Phase 6 (QM-9): LAST_WRITE_WINS, FIELD_LEVEL_MERGE, SERVER_WINS.
// Emits typed events through the Phase 8 OUTBOX (§35.13 ESC-13) — written inside the business
// transaction by the repository, relayed to Kafka by OutboxPollerService.

import {
  Injectable,
  Scope,
  Inject,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { Client as OpenSearchClient } from '@opensearch-project/opensearch';
import { createLogger } from '@cos/logger';
import { buildOutboxEvent } from '../../shared/outbox/outbox.types';
import { SiteOpsRepository } from './site-ops.repository';
import type { IssueRow, SiteReportRow, InspectionRow } from './site-ops.repository';
import { resolveReportConflict, resolveIssueConflict } from './conflict-handler';
import type { ConflictStatus } from './conflict-handler';
import type { CreateSiteReportDto } from './dto/create-site-report.dto';
import type { SyncSiteReportsDto } from './dto/sync-site-reports.dto';
import type { CreateIssueDto } from './dto/create-issue.dto';
import type { UpdateIssueDto } from './dto/update-issue.dto';
import type { ChangeIssueStatusDto } from './dto/change-issue-status.dto';
import type { SubmitInspectionDto } from './dto/submit-inspection.dto';
import type { UpdateInspectionDto } from './dto/update-inspection.dto';
import type { CreateMaterialConsumptionDto } from './dto/create-material-consumption.dto';

const logger = createLogger('site-ops-service');
const OS_REPORTS_INDEX = 'site-reports';
const OS_ISSUES_INDEX = 'site-issues';

@Injectable({ scope: Scope.REQUEST })
export class SiteOpsService {
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? '';
  }
  private get userId(): string {
    return (this.request as { userId?: string }).userId ?? '';
  }
  private readonly correlationId: string;
  private readonly openSearch: OpenSearchClient;

  constructor(
    private readonly repo: SiteOpsRepository,
    @Inject(REQUEST)
    private readonly request: Request & {
      tenantId?: string;
      userId?: string;
      correlationId?: string;
    },
  ) {
    this.correlationId = request.correlationId ?? randomUUID();
    this.openSearch = new OpenSearchClient({
      node: process.env['OPENSEARCH_URL'] ?? 'http://localhost:9200',
    });
  }

  // ── Site Reports ──────────────────────────────────────────────────────────

  async createSiteReport(dto: CreateSiteReportDto) {
    const reportId = randomUUID();
    const report = await this.repo.createSiteReport(
      {
        report_id: reportId,
        project_id: dto.project_id,
        submitted_by: this.userId,
        report_date: dto.report_date,
        summary: dto.summary ?? null,
        blockers: dto.blockers ?? null,
        weather: dto.weather ?? null,
        manpower_count: dto.manpower_count ?? null,
        client_submitted_at: dto.client_submitted_at ?? null,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
      },
      this.outboxEvent('site.report.created.v1', {
        report_id: reportId,
        project_id: dto.project_id,
        report_date: dto.report_date,
        submitted_by: this.userId,
        summary: dto.summary ?? '',
        issue_count: 0,
        photo_count: 0,
      }),
    );

    logger.info({
      event: 'site-report.created',
      report_id: report.report_id,
      project_id: dto.project_id,
      tenant_id: this.tenantId,
      trace_id: this.correlationId,
    });

    await this.indexSiteReport(report);
    return report;
  }

  async getSiteReport(reportId: string) {
    const report = await this.repo.findReportById(reportId);
    if (!report) {
      throw new NotFoundException({ code: 'COS-SITE-001', message: 'Site report not found' });
    }
    return report;
  }

  async listSiteReports(params: {
    project_id?: string;
    from_date?: string;
    to_date?: string;
    page: number;
    limit: number;
    minimal?: boolean;
    q?: string;
  }) {
    if (params.q) {
      const results = await this.searchSiteReports(params.q, params);
      return { items: results, total: results.length, page: params.page, limit: params.limit };
    }
    const { rows, total } = await this.repo.listSiteReports(params);
    const items = params.minimal ? rows.map(this.toMinimalReport) : rows;
    return { items, total, page: params.page, limit: params.limit };
  }

  async syncSiteReports(dto: SyncSiteReportsDto) {
    const results: Array<{
      client_id: string;
      report_id: string;
      conflict_status: ConflictStatus;
    }> = [];

    for (const item of dto.items) {
      const existing = await this.repo.findReportById(item.client_id).catch(() => null);

      if (!existing) {
        // New report — accept directly
        const report = await this.repo.createSiteReport(
          {
            report_id: item.client_id,
            project_id: item.project_id,
            submitted_by: this.userId,
            report_date: item.report_date,
            summary: item.summary ?? null,
            blockers: item.blockers ?? null,
            weather: item.weather ?? null,
            manpower_count: item.manpower_count ?? null,
            client_submitted_at: item.client_submitted_at ?? null,
            latitude: item.latitude ?? null,
            longitude: item.longitude ?? null,
          },
          this.outboxEvent('site.report.submitted.v1', {
            report_id: item.client_id,
            project_id: item.project_id,
            report_date: item.report_date,
            submitted_by: this.userId,
          }),
        );

        results.push({
          client_id: item.client_id,
          report_id: report.report_id,
          conflict_status: 'ACCEPTED',
        });
        continue;
      }

      // Existing — apply conflict resolution
      const clientPayload: Record<string, unknown> = {
        ...item,
        last_known_modified_at: item.last_known_modified_at,
      };
      const serverRow = existing as unknown as Record<string, unknown>;
      const resolution = resolveReportConflict(
        clientPayload,
        serverRow,
        item.client_submitted_at ?? new Date().toISOString(),
      );

      if (resolution.conflict_status === 'CONFLICT_FLAGGED') {
        const conflictId = randomUUID();
        await this.repo.createConflictRecord(
          {
            conflict_id: conflictId,
            entity_type: 'site_reports',
            entity_id: existing.report_id,
            client_payload: clientPayload,
            server_payload: serverRow,
            conflict_type: 'FIELD_CONFLICT',
          },
          this.outboxEvent('site.conflict.flagged.v1', {
            conflict_id: conflictId,
            entity_type: 'site_reports',
            entity_id: existing.report_id,
            conflict_type: 'FIELD_CONFLICT',
          }),
        );
      }

      results.push({
        client_id: item.client_id,
        report_id: existing.report_id,
        conflict_status: resolution.conflict_status,
      });
    }

    return results;
  }

  // ── Issues ────────────────────────────────────────────────────────────────

  async createIssue(dto: CreateIssueDto) {
    // Use the client-provided id when present (offline create → photo linkage, G-M11); else generate.
    const issueId = dto.client_id ?? randomUUID();
    const issue = await this.repo.createIssue(
      {
        issue_id: issueId,
        project_id: dto.project_id,
        report_id: dto.report_id ?? null,
        title: dto.title,
        description: dto.description ?? null,
        severity: dto.severity,
        assigned_to: dto.assigned_to ?? null,
        client_submitted_at: dto.client_submitted_at ?? null,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
      },
      this.outboxEvent('site.issue.created.v1', {
        issue_id: issueId,
        project_id: dto.project_id,
        report_id: dto.report_id ?? null,
        title: dto.title,
        severity: dto.severity,
        created_by: this.userId,
      }),
    );

    logger.info({
      event: 'issue.created',
      issue_id: issue.issue_id,
      project_id: dto.project_id,
      tenant_id: this.tenantId,
      trace_id: this.correlationId,
    });

    await this.indexIssue(issue);
    return issue;
  }

  // G-M12 — escalate an issue to the Project Manager. Non-destructive: no issue field changes; emits
  // site.issue.escalated.v1 which the notification service routes to PROJECT_MANAGER (in-app).
  async escalateIssue(issueId: string) {
    const issue = await this.repo.findIssueById(issueId);
    if (!issue) {
      throw new NotFoundException({ code: 'COS-SITE-002', message: 'Issue not found' });
    }
    // Non-destructive by design: no issue field changes, so there is no row to be atomic *with*.
    // The outbox is still used, as the durable at-least-once relay the direct publish was not.
    await this.repo.writeOutboxEvent(
      this.outboxEvent('site.issue.escalated.v1', {
        issue_id: issue.issue_id,
        project_id: issue.project_id,
        title: issue.title,
        severity: issue.severity,
        escalated_by: this.userId,
      }),
    );
    logger.info({
      event: 'issue.escalated',
      issue_id: issue.issue_id,
      project_id: issue.project_id,
      tenant_id: this.tenantId,
      trace_id: this.correlationId,
    });
    return { issue_id: issue.issue_id, status: 'ESCALATED' as const };
  }

  /**
   * Direct status transition — `PATCH /api/v1/site/issues/:issueId/status` (§35.13 ESC-21).
   *
   * `updateIssue` carries offline-sync semantics: FIELD_LEVEL_MERGE makes the server's status
   * authoritative, so a status sent there is discarded by design. That left `issues.status` with
   * no writer at all — every issue stayed OPEN for its whole life and
   * `site.issue.status_changed.v1`, which the master spec lists as a required Phase 6 producer,
   * could never be emitted. This endpoint is that writer.
   */
  async changeIssueStatus(issueId: string, dto: ChangeIssueStatusDto): Promise<IssueRow> {
    const existing = await this.repo.findIssueById(issueId);
    if (!existing) {
      throw new NotFoundException({ code: 'COS-SITE-002', message: 'Issue not found' });
    }

    const fromStatus = existing.status;
    const toStatus = dto.status;

    // A no-op transition still persists resolution_note, but emits nothing — the event contract is
    // "status changed", and re-announcing an unchanged status would be a false transition.
    const updated = await this.repo.updateIssueStatus(
      issueId,
      toStatus,
      dto.resolution_note ?? null,
      fromStatus === toStatus
        ? undefined
        : (row) =>
            this.outboxEvent('site.issue.status_changed.v1', {
              issue_id: issueId,
              project_id: row.project_id,
              from_status: fromStatus,
              to_status: toStatus,
            }),
    );

    /* istanbul ignore next -- the row was read above in the same request; a concurrent hard delete
       is the only way to miss it, and site_ops.issues has no delete path. */
    if (!updated) {
      throw new NotFoundException({ code: 'COS-SITE-002', message: 'Issue not found' });
    }

    logger.info({
      event: 'issue.status_changed',
      issue_id: issueId,
      from_status: fromStatus,
      to_status: toStatus,
      tenant_id: this.tenantId,
      trace_id: this.correlationId,
    });

    return updated;
  }

  async updateIssue(issueId: string, dto: UpdateIssueDto) {
    const existing = await this.repo.findIssueById(issueId);
    if (!existing) {
      throw new NotFoundException({ code: 'COS-SITE-002', message: 'Issue not found' });
    }

    // Apply FIELD_LEVEL_MERGE conflict strategy
    const clientPayload: Record<string, unknown> = { ...dto };
    const serverRow = existing as unknown as Record<string, unknown>;
    const resolution = resolveIssueConflict(
      clientPayload,
      serverRow,
      dto.client_submitted_at ?? new Date().toISOString(),
    );

    const resolved = resolution.resolved_payload;

    // No status event is emitted here: FIELD_LEVEL_MERGE makes the server's status authoritative,
    // so `resolved.status` is always `existing.status` and nothing transitions. A real transition
    // goes through changeIssueStatus() below (§35.13 ESC-21).
    const updated = await this.repo.updateIssue(issueId, {
      description: resolved['description'] as string | null,
      severity: resolved['severity'] as string,
      status: resolved['status'] as string,
      assigned_to: dto.assigned_to ?? null,
      resolution_note: resolved['resolution_note'] as string | null,
      client_submitted_at: dto.client_submitted_at ?? null,
    });

    if (resolution.conflict_status === 'CONFLICT_FLAGGED') {
      const conflictId = randomUUID();
      await this.repo.createConflictRecord(
        {
          conflict_id: conflictId,
          entity_type: 'issues',
          entity_id: issueId,
          client_payload: clientPayload,
          server_payload: serverRow,
          conflict_type: 'STATUS_CONFLICT',
        },
        this.outboxEvent('site.conflict.flagged.v1', {
          conflict_id: conflictId,
          entity_type: 'issues',
          entity_id: issueId,
          conflict_type: 'STATUS_CONFLICT',
        }),
      );
    }

    return updated;
  }

  async listIssues(params: {
    project_id?: string;
    severity?: string;
    status?: string;
    page: number;
    limit: number;
    q?: string;
  }) {
    if (params.q) {
      const results = await this.searchIssues(params.q, params);
      return { items: results, total: results.length, page: params.page, limit: params.limit };
    }
    const { rows, total } = await this.repo.listIssues(params);
    return { items: rows, total, page: params.page, limit: params.limit };
  }

  // ── Inspections ───────────────────────────────────────────────────────────

  async submitInspection(dto: SubmitInspectionDto) {
    const checklist = await this.repo.findChecklistById(dto.checklist_id);
    if (!checklist) {
      throw new NotFoundException({ code: 'COS-SITE-003', message: 'Safety checklist not found' });
    }

    const inspectionId = randomUUID();

    // The outcome event is decided from the DTO, so it rides the INSERT (§35.13 ESC-13):
    // a rolled-back inspection can never report a PASSED/FAILED result.
    let outcome: ReturnType<typeof this.outboxEvent> | undefined;
    if (dto.status === 'PASSED') {
      outcome = this.outboxEvent('site.inspection.passed.v1', {
        inspection_id: inspectionId,
        project_id: dto.project_id,
        inspected_by: this.userId,
      });
    } else if (dto.status === 'FAILED') {
      // failed_items from checklist items (all required items that failed)
      const checklistItems = (
        checklist.items as Array<{
          item_id: string;
          description: string;
          is_required: boolean;
        }>
      ).filter((i) => i.is_required);

      outcome = this.outboxEvent('site.inspection.failed.v1', {
        inspection_id: inspectionId,
        project_id: dto.project_id,
        checklist_id: dto.checklist_id,
        failed_items: checklistItems.map((i) => ({
          item_id: i.item_id,
          description: i.description,
        })),
        inspected_by: this.userId,
        inspected_at: dto.inspected_at,
      });
    }

    const inspection = await this.repo.createInspection(
      {
        inspection_id: inspectionId,
        project_id: dto.project_id,
        checklist_id: dto.checklist_id,
        status: dto.status,
        inspected_by: this.userId,
        inspected_at: dto.inspected_at,
        notes: dto.notes ?? null,
        issue_severity: dto.issue_severity ?? null, // spec 11 §517 — set on FAILED/conditional
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
      },
      outcome,
    );

    logger.info({
      event: 'inspection.submitted',
      inspection_id: inspection.inspection_id,
      status: dto.status,
      tenant_id: this.tenantId,
      trace_id: this.correlationId,
    });

    return inspection;
  }

  async listInspections(params: {
    project_id?: string;
    status?: string;
    page: number;
    limit: number;
  }) {
    const { rows, total } = await this.repo.findInspections(params);
    return { items: rows, total, page: params.page, limit: params.limit };
  }

  async getInspection(inspectionId: string): Promise<InspectionRow> {
    const inspection = await this.repo.findInspectionById(inspectionId);
    if (!inspection) {
      throw new NotFoundException({ code: 'COS-SITE-006', message: 'Inspection not found' });
    }
    return inspection;
  }

  /** Approve (→PASSED) or request re-inspection (→REQUIRES_REINSPECTION); PASSED is terminal (ADR-025). */
  async updateInspectionStatus(
    inspectionId: string,
    dto: UpdateInspectionDto,
  ): Promise<InspectionRow> {
    const inspection = await this.getInspection(inspectionId);
    if (inspection.status === 'PASSED') {
      throw new UnprocessableEntityException({
        code: 'COS-SITE-007',
        message: 'Inspection already PASSED (terminal); create a new inspection for re-inspection',
      });
    }

    // Builder over the UPDATEd row — project_id and checklist_id come from the row (§35.13 ESC-13).
    const updated = await this.repo.updateInspectionStatus(
      {
        inspection_id: inspectionId,
        status: dto.status,
        notes: dto.notes ?? null,
      },
      dto.status === 'PASSED'
        ? (row) =>
            this.outboxEvent('site.inspection.passed.v1', {
              inspection_id: inspectionId,
              project_id: row.project_id,
              inspected_by: this.userId,
            })
        : dto.status === 'FAILED'
          ? (row) =>
              this.outboxEvent('site.inspection.failed.v1', {
                inspection_id: inspectionId,
                project_id: row.project_id,
                checklist_id: row.checklist_id,
                inspected_by: this.userId,
              })
          : undefined,
    );

    logger.info({
      event: 'inspection.updated',
      inspection_id: inspectionId,
      status: dto.status,
      tenant_id: this.tenantId,
      trace_id: this.correlationId,
    });
    return updated;
  }

  // ── Conflict Records ──────────────────────────────────────────────────────

  async listConflictRecords() {
    return this.repo.listConflictRecords(true);
  }

  async listChecklists(project_id?: string) {
    return this.repo.listChecklists(project_id);
  }

  // ── Material Consumptions ─────────────────────────────────────────────────

  async createMaterialConsumption(reportId: string, dto: CreateMaterialConsumptionDto) {
    const report = await this.repo.findReportById(reportId);
    if (!report) {
      throw new NotFoundException({ code: 'COS-SITE-005', message: 'Site report not found' });
    }
    const consumptionId = randomUUID();
    const materialId = randomUUID();
    const row = await this.repo.insertMaterialConsumption(
      {
        consumption_id: consumptionId,
        project_id: report.project_id,
        report_id: reportId,
        material_name: dto.material_name,
        material_id: materialId,
        task_id: dto.task_id ?? null,
        quantity: dto.quantity,
        unit: dto.unit,
        consumed_by: this.userId,
        consumed_at: dto.consumed_at,
      },
      this.outboxEvent('site.material.consumed.v1', {
        consumption_id: consumptionId,
        project_id: report.project_id,
        task_id: dto.task_id ?? '',
        material_id: materialId,
        quantity: dto.quantity,
        unit: dto.unit,
        consumed_by: this.userId,
        consumed_at: new Date(dto.consumed_at).toISOString(),
      }),
    );
    logger.info({
      event: 'material.consumed',
      consumption_id: consumptionId,
      project_id: report.project_id,
      tenant_id: this.tenantId,
      trace_id: this.correlationId,
    });
    return row;
  }

  async resolveConflict(conflictId: string) {
    const record = await this.repo.resolveConflictRecord(conflictId, this.userId);
    if (!record) {
      throw new UnprocessableEntityException({
        code: 'COS-SITE-004',
        message: 'Conflict record not found or already resolved',
      });
    }
    logger.info({
      event: 'conflict.resolved',
      conflict_id: conflictId,
      reviewed_by: this.userId,
      tenant_id: this.tenantId,
      trace_id: this.correlationId,
    });
    return record;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Builds the outbox envelope handed to the repository write that anchors it (§35.13 ESC-13).
   * Replaces the previous `emitEvent`, which published directly to Kafka and logged failures as
   * `kafka.publish.failed` — so every site event was silently lost during a broker outage, and
   * offline-sync clients had no way to tell.
   */
  private outboxEvent(eventType: string, payload: Record<string, unknown>) {
    return buildOutboxEvent({
      eventType,
      tenantId: this.tenantId,
      actorId: this.userId,
      correlationId: this.correlationId,
      payload,
    });
  }

  private toMinimalReport(report: SiteReportRow) {
    return {
      report_id: report.report_id,
      project_id: report.project_id,
      report_date: report.report_date,
      submitted_by: report.submitted_by,
      status: report.status,
      manpower_count: report.manpower_count,
    };
  }

  // ── OpenSearch indexing (non-blocking — failure must not block primary write path) ──

  private async indexSiteReport(report: SiteReportRow): Promise<void> {
    try {
      await this.openSearch.index({
        index: OS_REPORTS_INDEX,
        id: report.report_id,
        body: {
          report_id: report.report_id,
          project_id: report.project_id,
          tenant_id: this.tenantId,
          report_date: report.report_date,
          summary: report.summary,
          weather: report.weather,
          submitted_by: report.submitted_by,
          status: report.status,
        },
      });
    } catch (err) {
      logger.warn({ report_id: report.report_id, err }, 'opensearch.index.failed');
    }
  }

  private async indexIssue(issue: IssueRow): Promise<void> {
    try {
      await this.openSearch.index({
        index: OS_ISSUES_INDEX,
        id: issue.issue_id,
        body: {
          issue_id: issue.issue_id,
          project_id: issue.project_id,
          tenant_id: this.tenantId,
          title: issue.title,
          description: issue.description,
          severity: issue.severity,
          status: issue.status,
        },
      });
    } catch (err) {
      logger.warn({ issue_id: issue.issue_id, err }, 'opensearch.index.failed');
    }
  }

  private async searchSiteReports(
    q: string,
    params: { project_id?: string; minimal?: boolean },
  ): Promise<SiteReportRow[]> {
    try {
      // §35.13 ESC-32: .keyword, not the bare field — dynamic mapping stores these strings as
      // analyzed `text` with a `.keyword` sub-field, and a `term` on the analyzed field never
      // matches a UUID. See the fuller note in project.service.ts.
      const must: Record<string, unknown>[] = [
        { multi_match: { query: q, fields: ['summary', 'weather'] } },
        { term: { 'tenant_id.keyword': this.tenantId } },
      ];
      if (params.project_id) must.push({ term: { 'project_id.keyword': params.project_id } });

      const response = await this.openSearch.search({
        index: OS_REPORTS_INDEX,
        body: { query: { bool: { must } }, size: 50 },
      });

      const ids: string[] = (
        response.body.hits.hits as Array<{ _source: { report_id: string } }>
      ).map((h) => h._source.report_id);

      if (ids.length === 0) return [];
      const { rows } = await this.repo.listSiteReports({ ...params, page: 1, limit: 50 });
      const matched = rows.filter((r) => ids.includes(r.report_id));
      return params.minimal
        ? (matched.map(this.toMinimalReport) as unknown as SiteReportRow[])
        : matched;
    } catch (err) {
      logger.warn({ q, err }, 'opensearch.search.failed — falling back to DB list');
      const { rows } = await this.repo.listSiteReports({ ...params, page: 1, limit: 50 });
      return rows;
    }
  }

  private async searchIssues(
    q: string,
    params: { project_id?: string; severity?: string; status?: string },
  ): Promise<IssueRow[]> {
    try {
      const must: Record<string, unknown>[] = [
        { multi_match: { query: q, fields: ['title', 'description'] } },
        { term: { 'tenant_id.keyword': this.tenantId } },
      ];
      if (params.project_id) must.push({ term: { 'project_id.keyword': params.project_id } });

      const response = await this.openSearch.search({
        index: OS_ISSUES_INDEX,
        body: { query: { bool: { must } }, size: 50 },
      });

      const ids: string[] = (
        response.body.hits.hits as Array<{ _source: { issue_id: string } }>
      ).map((h) => h._source.issue_id);

      if (ids.length === 0) return [];
      const { rows } = await this.repo.listIssues({ ...params, page: 1, limit: 50 });
      return rows.filter((r) => ids.includes(r.issue_id));
    } catch (err) {
      logger.warn({ q, err }, 'opensearch.search.failed — falling back to DB list');
      const { rows } = await this.repo.listIssues({ ...params, page: 1, limit: 50 });
      return rows;
    }
  }
}
