// SiteOps Service — Phase 6
// Business logic: site reports, offline sync, issue tracking, inspections, conflict resolution.
// Conflict strategies per spec §Phase 6 (QM-9): LAST_WRITE_WINS, FIELD_LEVEL_MERGE, SERVER_WINS.
// Emits typed Kafka events via @cos/shared KafkaProducer.

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
import { KafkaProducer } from '@cos/shared';
import { createLogger } from '@cos/logger';
import { SiteOpsRepository } from './site-ops.repository';
import type { IssueRow, SiteReportRow, InspectionRow } from './site-ops.repository';
import { resolveReportConflict, resolveIssueConflict } from './conflict-handler';
import type { ConflictStatus } from './conflict-handler';
import type { CreateSiteReportDto } from './dto/create-site-report.dto';
import type { SyncSiteReportsDto } from './dto/sync-site-reports.dto';
import type { CreateIssueDto } from './dto/create-issue.dto';
import type { UpdateIssueDto } from './dto/update-issue.dto';
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
  private readonly kafka: KafkaProducer;
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
    this.kafka = new KafkaProducer();
    this.openSearch = new OpenSearchClient({
      node: process.env['OPENSEARCH_URL'] ?? 'http://localhost:9200',
    });
  }

  // ── Site Reports ──────────────────────────────────────────────────────────

  async createSiteReport(dto: CreateSiteReportDto) {
    const reportId = randomUUID();
    const report = await this.repo.createSiteReport({
      report_id: reportId,
      project_id: dto.project_id,
      submitted_by: this.userId,
      report_date: dto.report_date,
      summary: dto.summary ?? null,
      weather: dto.weather ?? null,
      manpower_count: dto.manpower_count ?? null,
      client_submitted_at: dto.client_submitted_at ?? null,
    });

    await this.emitEvent('site.report.created.v1', {
      report_id: report.report_id,
      project_id: report.project_id,
      report_date: dto.report_date,
      submitted_by: this.userId,
      summary: dto.summary ?? '',
      issue_count: 0,
      photo_count: 0,
    });

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
        const report = await this.repo.createSiteReport({
          report_id: item.client_id,
          project_id: item.project_id,
          submitted_by: this.userId,
          report_date: item.report_date,
          summary: item.summary ?? null,
          weather: item.weather ?? null,
          manpower_count: item.manpower_count ?? null,
          client_submitted_at: item.client_submitted_at ?? null,
        });

        await this.emitEvent('site.report.submitted.v1', {
          report_id: report.report_id,
          project_id: report.project_id,
          report_date: item.report_date,
          submitted_by: this.userId,
        });

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
        await this.repo.createConflictRecord({
          conflict_id: randomUUID(),
          entity_type: 'site_reports',
          entity_id: existing.report_id,
          client_payload: clientPayload,
          server_payload: serverRow,
          conflict_type: 'FIELD_CONFLICT',
        });
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
    const issueId = randomUUID();
    const issue = await this.repo.createIssue({
      issue_id: issueId,
      project_id: dto.project_id,
      report_id: dto.report_id ?? null,
      title: dto.title,
      description: dto.description ?? null,
      severity: dto.severity,
      assigned_to: dto.assigned_to ?? null,
      client_submitted_at: dto.client_submitted_at ?? null,
    });

    await this.emitEvent('site.issue.created.v1', {
      issue_id: issue.issue_id,
      project_id: issue.project_id,
      report_id: issue.report_id,
      title: issue.title,
      severity: issue.severity,
      created_by: this.userId,
    });

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
    const updated = await this.repo.updateIssue(issueId, {
      description: resolved['description'] as string | null,
      severity: resolved['severity'] as string,
      status: resolved['status'] as string,
      assigned_to: dto.assigned_to ?? null,
      resolution_note: resolved['resolution_note'] as string | null,
      client_submitted_at: dto.client_submitted_at ?? null,
    });

    if (resolution.conflict_status === 'CONFLICT_FLAGGED') {
      await this.repo.createConflictRecord({
        conflict_id: randomUUID(),
        entity_type: 'issues',
        entity_id: issueId,
        client_payload: clientPayload,
        server_payload: serverRow,
        conflict_type: 'STATUS_CONFLICT',
      });
    }

    const fromStatus = existing.status;
    /* istanbul ignore next */
    const toStatus = (resolved['status'] as IssueRow['status']) ?? existing.status;
    /* istanbul ignore next */
    if (fromStatus !== toStatus) {
      await this.emitEvent('site.issue.status_changed.v1', {
        issue_id: issueId,
        project_id: existing.project_id,
        from_status: fromStatus,
        to_status: toStatus,
      });
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
    const inspection = await this.repo.createInspection({
      inspection_id: inspectionId,
      project_id: dto.project_id,
      checklist_id: dto.checklist_id,
      status: dto.status,
      inspected_by: this.userId,
      inspected_at: dto.inspected_at,
      notes: dto.notes ?? null,
    });

    if (dto.status === 'PASSED') {
      await this.emitEvent('site.inspection.passed.v1', {
        inspection_id: inspection.inspection_id,
        project_id: inspection.project_id,
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

      await this.emitEvent('site.inspection.failed.v1', {
        inspection_id: inspection.inspection_id,
        project_id: inspection.project_id,
        checklist_id: dto.checklist_id,
        failed_items: checklistItems.map((i) => ({
          item_id: i.item_id,
          description: i.description,
        })),
        inspected_by: this.userId,
        inspected_at: dto.inspected_at,
      });
    }

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

    const updated = await this.repo.updateInspectionStatus({
      inspection_id: inspectionId,
      status: dto.status,
      notes: dto.notes ?? null,
    });

    if (dto.status === 'PASSED') {
      await this.emitEvent('site.inspection.passed.v1', {
        inspection_id: inspectionId,
        project_id: updated.project_id,
        inspected_by: this.userId,
      });
    } else if (dto.status === 'FAILED') {
      await this.emitEvent('site.inspection.failed.v1', {
        inspection_id: inspectionId,
        project_id: updated.project_id,
        checklist_id: updated.checklist_id,
        inspected_by: this.userId,
      });
    }

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
    const row = await this.repo.insertMaterialConsumption({
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
    });
    await this.emitEvent('site.material.consumed.v1', {
      consumption_id: row.consumption_id,
      project_id: row.project_id,
      task_id: row.task_id ?? '',
      material_id: row.material_id,
      quantity: row.quantity,
      unit: row.unit,
      consumed_by: row.consumed_by,
      consumed_at: new Date(row.consumed_at).toISOString(),
    });
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

  private async emitEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.kafka.connect();
      await this.kafka.publish({
        event_type: eventType,
        event_version: '1.0',
        tenant_id: this.tenantId,
        actor_id: this.userId,
        occurred_at: new Date().toISOString(),
        correlation_id: this.correlationId,
        payload,
      });
    } catch (err) {
      logger.warn({
        event: 'kafka.publish.failed',
        event_type: eventType,
        tenant_id: this.tenantId,
        trace_id: this.correlationId,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      await this.kafka.disconnect().catch(/* istanbul ignore next */ () => undefined);
    }
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
      const must: Record<string, unknown>[] = [
        { multi_match: { query: q, fields: ['summary', 'weather'] } },
        { term: { tenant_id: this.tenantId } },
      ];
      if (params.project_id) must.push({ term: { project_id: params.project_id } });

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
        { term: { tenant_id: this.tenantId } },
      ];
      if (params.project_id) must.push({ term: { project_id: params.project_id } });

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
