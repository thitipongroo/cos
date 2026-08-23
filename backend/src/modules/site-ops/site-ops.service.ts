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
  ConflictException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { Client as OpenSearchClient } from '@opensearch-project/opensearch';
import { EventOutboxService } from '../../shared/events/event-outbox.service';
import { createLogger } from '@cos/logger';
import { SiteOpsRepository } from './site-ops.repository';
import type {
  IssueRow,
  SiteReportRow,
  InspectionRow,
  MaterialConsumptionRow,
} from './site-ops.repository';
import { UUID_PATTERN } from '../../shared/prisma/assert-safe-tenant-id';
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
/**
 * Hours recorded for a manpower line whose caller sent none. site_ops.manpower_logs.hours_worked is
 * NOT NULL with no default, and the daily-report form collects headcount per trade without hours, so
 * omitting it must not fail the insert. A full shift is the honest stand-in for "the trade worked
 * today"; a caller that knows better (a timesheet import) sends the real figure and overrides it.
 */
const DEFAULT_SHIFT_HOURS = 8;

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
    private readonly outbox: EventOutboxService,
  ) {
    this.correlationId = request.correlationId ?? randomUUID();
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
      blockers: dto.blockers ?? null,
      blocker_category: dto.blocker_category ?? null,
      weather: dto.weather ?? null,
      manpower_count: dto.manpower_count ?? null,
      shift: dto.shift ?? null,
      client_submitted_at: dto.client_submitted_at ?? null,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
    });

    // Per-trade breakdown → site_ops.manpower_logs. Written against the row's OWN report_id, not
    // `reportId`: createSiteReport upserts on (project_id, report_date, submitted_by), so resubmitting
    // the same day returns the EXISTING report and the freshly generated UUID is discarded. Keying the
    // logs off the generated id would orphan every line on a resubmit.
    if (dto.manpower_lines) {
      await this.repo.replaceManpowerLogs(
        report.report_id,
        dto.manpower_lines.map((line) => ({
          trade_type: line.trade_type,
          worker_count: line.worker_count,
          // The column is NOT NULL; the mockup's form collects headcount per trade and no hours, so a
          // standard 8-hour shift stands in when the caller omits it (spec 11 manpower_logs).
          hours_worked: line.hours_worked ?? DEFAULT_SHIFT_HOURS,
        })),
      );
    }

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

    return report;
  }

  async getSiteReport(reportId: string) {
    const report = await this.repo.findReportById(reportId);
    if (!report) {
      throw new NotFoundException({
        error: { code: 'COS-SITE-001', message: 'Site report not found' },
      });
    }
    // The per-trade breakdown is returned with the detail, not the list: it is one query per report,
    // and a list of 50 reports would issue 50 of them for data no list view shows. Additive field, so
    // no version bump (QM-2) — clients that ignore it are unaffected. A report with no breakdown
    // recorded gets `[]`, which is the truth, not an error.
    const manpower_lines = await this.repo.listManpowerLogs(reportId);
    return { ...report, manpower_lines };
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

    // One lookup for the whole batch instead of one per item. This loop used to call
    // findReportById(item.client_id) on every element — each a separate round trip inside its own
    // db.run transaction — so a device coming back from a week offline opened one transaction per
    // queued report before performing a single write.
    //
    // Only well-formed UUIDs are sent: client_id comes from the device, and one malformed value
    // would break the `::uuid[]` cast for the entire batch. A non-UUID simply misses the map and
    // takes the create path, which is exactly what the old per-item `.catch(() => null)` did.
    const existingById = await this.repo
      .findReportsByIds(dto.items.map((i) => i.client_id).filter((id) => UUID_PATTERN.test(id)))
      .catch(() => new Map<string, SiteReportRow>());

    for (const item of dto.items) {
      const existing = existingById.get(item.client_id) ?? null;

      if (!existing) {
        // New report — accept directly
        const report = await this.repo.createSiteReport({
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

      // A clamped timestamp is not a conflict — the merge resolved — but the device that produced it
      // will keep producing them, and the fix is on the device rather than here. Logged so a clock
      // that is out by days is visible to someone instead of only changing merge outcomes (OQ-28).
      if (resolution.clock_skew_clamped) {
        logger.warn(
          {
            event: 'sync.clock_skew_clamped',
            entity_type: 'site_reports',
            entity_id: existing.report_id,
            client_submitted_at: item.client_submitted_at ?? null,
            tenant_id: this.tenantId,
          },
          'client_submitted_at was ahead of the server clock or unparseable — capped for ordering',
        );
      }

      // Persist the resolved row. This write used to be missing entirely: the branch computed a
      // resolution, wrote a conflict record when flagged, and returned ACCEPTED without ever
      // touching the report — so every offline EDIT of an existing report was acknowledged and
      // then silently discarded (clients drop their pending queue on ACCEPTED). Only the
      // create-path was ever wired up. `should_persist` comes from the resolver so the LWW rule
      // stays in one place: false means resolved_payload IS the untouched server row.
      if (resolution.should_persist) {
        const resolved = resolution.resolved_payload;
        const updated = await this.repo.updateSiteReport(existing.report_id, {
          summary: (resolved['summary'] as string | undefined) ?? null,
          blockers: (resolved['blockers'] as string | undefined) ?? null,
          weather: (resolved['weather'] as string | undefined) ?? null,
          manpower_count: (resolved['manpower_count'] as number | undefined) ?? null,
          client_submitted_at: (resolved['client_submitted_at'] as string | undefined) ?? null,
          latitude: (resolved['latitude'] as number | undefined) ?? null,
          longitude: (resolved['longitude'] as number | undefined) ?? null,
        });
        // The row was read a moment ago under the same tenant context; a null here means it was
        // deleted in between. Never report ACCEPTED for a write that did not land — that is the
        // exact failure mode this branch used to have.
        if (!updated) {
          results.push({
            client_id: item.client_id,
            report_id: existing.report_id,
            conflict_status: 'CONFLICT_REJECTED',
          });
          continue;
        }
      }

      if (resolution.conflict_status === 'CONFLICT_FLAGGED') {
        const conflictId = randomUUID();
        await this.repo.createConflictRecord({
          conflict_id: conflictId,
          entity_type: 'site_reports',
          entity_id: existing.report_id,
          client_payload: clientPayload,
          server_payload: serverRow,
          conflict_type: 'FIELD_CONFLICT',
        });
        await this.emitEvent('site.conflict.flagged.v1', {
          conflict_id: conflictId,
          entity_type: 'site_reports',
          entity_id: existing.report_id,
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

  /**
   * Raise an issue, at most once per `client_id`.
   *
   * The id half of this has been here since G-M11 — a client UUID becomes the `issue_id` so that
   * photos captured offline against it link up on sync. What was missing until 2026-08-19 is that
   * the write was not IDEMPOTENT on that id: `/sync/push` replays a queued create after a timeout or
   * any retry, and the replay hit the primary key and came back a 500, which the device's outbox
   * treats as a retryable failure. Five attempts later §17.2 discarded the item. The issue existed on
   * the server the whole time, and the person who raised it was never told anything.
   *
   * The existence check comes first so a replay does not re-read the issue-number sequence or reach
   * the insert at all; the ON CONFLICT in the repository still covers two replays racing each other.
   */
  async createIssue(dto: CreateIssueDto) {
    // Use the client-provided id when present (offline create → photo linkage, G-M11); else generate.
    const issueId = dto.client_id ?? randomUUID();

    if (dto.client_id) {
      const existing = await this.repo.findIssueById(dto.client_id);
      if (existing) {
        logger.info({
          event: 'issue.created.duplicate_ignored',
          issue_id: dto.client_id,
          tenant_id: this.tenantId,
          trace_id: this.correlationId,
        });
        return existing;
      }
    }

    // Server assigns the human-readable number (ADR-069) — not the offline client, which cannot know
    // the tenant's next ISS-<year>-<seq>.
    const issueNumber = await this.repo.nextIssueNumber(new Date().getFullYear());
    const created = await this.repo.createIssue({
      issue_id: issueId,
      issue_number: issueNumber,
      project_id: dto.project_id,
      report_id: dto.report_id ?? null,
      title: dto.title,
      description: dto.description ?? null,
      severity: dto.severity,
      issue_type: dto.issue_type ?? null, // null → the column DEFAULT 'GENERAL' (see repository)
      assigned_to: dto.assigned_to ?? null,
      // The same value the event below carries — now persisted on the row too, so a PDPA export can
      // find it. The event stream is a publish queue, not a queryable record of who raised what.
      created_by: this.userId,
      client_submitted_at: dto.client_submitted_at ?? null,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
    });

    // Nothing returned means a concurrent replay inserted it between the check above and the INSERT.
    if (!created) {
      const existing = await this.repo.findIssueById(issueId);
      if (existing) return existing;
      // The id conflicted but is invisible here, so it belongs to another tenant — RLS hides the row
      // while the primary key still rejects the insert.
      throw new ConflictException({
        error: {
          code: 'COS-SITE-409',
          message: 'client_id is already in use',
          messageKey: 'siteOps.issue.duplicateId',
        },
      });
    }
    const issue = created;

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

    return issue;
  }

  // G-M12 — escalate an issue to the Project Manager. Non-destructive: no issue field changes; emits
  // site.issue.escalated.v1 which the notification service routes to PROJECT_MANAGER (in-app).
  async escalateIssue(issueId: string) {
    const issue = await this.repo.findIssueById(issueId);
    if (!issue) {
      throw new NotFoundException({ error: { code: 'COS-SITE-002', message: 'Issue not found' } });
    }
    await this.emitEvent('site.issue.escalated.v1', {
      issue_id: issue.issue_id,
      project_id: issue.project_id,
      title: issue.title,
      severity: issue.severity,
      escalated_by: this.userId,
    });
    logger.info({
      event: 'issue.escalated',
      issue_id: issue.issue_id,
      project_id: issue.project_id,
      tenant_id: this.tenantId,
      trace_id: this.correlationId,
    });
    return { issue_id: issue.issue_id, status: 'ESCALATED' as const };
  }

  async updateIssue(issueId: string, dto: UpdateIssueDto) {
    const existing = await this.repo.findIssueById(issueId);
    if (!existing) {
      throw new NotFoundException({ error: { code: 'COS-SITE-002', message: 'Issue not found' } });
    }

    // Apply FIELD_LEVEL_MERGE conflict strategy
    const clientPayload: Record<string, unknown> = { ...dto };
    const serverRow = existing as unknown as Record<string, unknown>;
    const resolution = resolveIssueConflict(
      clientPayload,
      serverRow,
      dto.client_submitted_at ?? new Date().toISOString(),
    );

    // Same reason as the site-report path — see OQ-28.
    if (resolution.clock_skew_clamped) {
      logger.warn(
        {
          event: 'sync.clock_skew_clamped',
          entity_type: 'issues',
          entity_id: issueId,
          client_submitted_at: dto.client_submitted_at ?? null,
          tenant_id: this.tenantId,
        },
        'client_submitted_at was ahead of the server clock or unparseable — capped for ordering',
      );
    }

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
      const conflictId = randomUUID();
      await this.repo.createConflictRecord({
        conflict_id: conflictId,
        entity_type: 'issues',
        entity_id: issueId,
        client_payload: clientPayload,
        server_payload: serverRow,
        conflict_type: 'STATUS_CONFLICT',
      });
      await this.emitEvent('site.conflict.flagged.v1', {
        conflict_id: conflictId,
        entity_type: 'issues',
        entity_id: issueId,
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
      throw new NotFoundException({
        error: { code: 'COS-SITE-003', message: 'Safety checklist not found' },
      });
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
      issue_severity: dto.issue_severity ?? null, // spec 11 §517 — set on FAILED/conditional
      // Drawn attestation mark (migration 20260808000002). Absent → NULL, i.e. "not signed"; the
      // authoritative attribution stays `inspected_by` + `inspected_at`, which are always set.
      signature: dto.signature ?? null,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
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

      // A failed required item on a safety checklist IS a safety violation (§20.2 "Violation
      // alerts"; TDD OQ-35). `19-notification-architecture` §19.6 names SafetyViolationDetected as
      // one of two notifications a user may not disable, and until 2026-08-22 nothing produced it —
      // the name appeared in §19.6 and §16 and nowhere else, so the un-disableable set had an
      // unknown size.
      //
      // The checklist a failed inspection references lives in `site_ops.safety_checklists`, and the
      // Phase 6 command defines the safety route as "submit completed checklist (= inspection)" —
      // one concept, not two. So this fires for every FAILED inspection rather than trying to
      // distinguish a safety checklist from a QC one, a distinction the schema does not carry.
      //
      // Deliberately SEPARATE from site.inspection.failed.v1 rather than folded into it. They route
      // differently and must: inspection.failed alerts SITE_ENGINEER + PROJECT_MANAGER and is
      // ordinarily disableable, while a violation is in §19.6's critical set and is not. Merging
      // them would make one of those two properties wrong.
      await this.emitEvent('safety.violation.detected.v1', {
        violation_type: 'CHECKLIST_ITEM_FAILED',
        project_id: inspection.project_id,
        inspection_id: inspection.inspection_id,
        checklist_id: dto.checklist_id,
        failed_item_count: checklistItems.length,
        detected_by: 'CHECKLIST_SUBMISSION',
        detail: `Safety checklist failed with ${checklistItems.length} required item(s) outstanding`,
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
      throw new NotFoundException({
        error: { code: 'COS-SITE-006', message: 'Inspection not found' },
      });
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
        error: {
          code: 'COS-SITE-007',
          message:
            'Inspection already PASSED (terminal); create a new inspection for re-inspection',
        },
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
      throw new NotFoundException({
        error: { code: 'COS-SITE-005', message: 'Site report not found' },
      });
    }
    const consumptionId = randomUUID();
    // Resolve the typed name against the tenant's material master so the consumption carries a real
    // material id wherever possible (Phase 24 needs it to price carbon). The mobile app is
    // offline-first and has no master-data cache, so an unknown name is expected, not an error —
    // fall back to the historical random id and let the consumption through unchanged.
    const masterMaterialId = await this.repo.findMaterialIdByName(dto.material_name);
    const materialId = masterMaterialId ?? randomUUID();
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
    if (masterMaterialId) {
      await this.recordEmbodiedCarbon(row, masterMaterialId);
    }
    return row;
  }

  /**
   * Phase 24 (§33.4) — embodied carbon (GHG Protocol Scope 3) for one material consumption.
   *
   * Deliberately silent when there is nothing to price: §33.4 says the platform ships no factor
   * database, so a tenant that has loaded none simply produces no carbon records. Consumption
   * logging must never fail because carbon accounting is unconfigured.
   *
   * The factor value and its source are copied onto the record rather than joined at read time —
   * a tenant may revise a factor later and an emitted record must stay reproducible for audit.
   */
  private async recordEmbodiedCarbon(
    row: MaterialConsumptionRow,
    materialId: string,
  ): Promise<void> {
    const factor = await this.repo.findCarbonFactor(materialId);
    if (!factor) return;

    const record = await this.repo.insertCarbonRecord({
      carbon_record_id: randomUUID(),
      project_id: row.project_id,
      consumption_id: row.consumption_id,
      material_id: materialId,
      quantity_consumed: row.quantity,
      unit: row.unit,
      carbon_factor: factor.carbon_factor,
      carbon_factor_source: factor.source,
    });
    // Null means the unique index on consumption_id rejected a duplicate — a replay. Do not
    // re-emit, or the analytics store would double-count the project's footprint.
    if (!record) return;

    await this.emitEvent('carbon.record.created.v1', {
      carbon_record_id: record.carbon_record_id,
      project_id: record.project_id,
      consumption_id: record.consumption_id,
      material_id: record.material_id,
      quantity_consumed: record.quantity_consumed,
      unit: record.unit,
      carbon_factor: record.carbon_factor,
      carbon_factor_source: record.carbon_factor_source,
      carbon_kgco2e: record.carbon_kgco2e,
      // §33.4 GHG Protocol: embodied carbon in materials (EN 15804 modules A1–A3) is Scope 3.
      // Scope 1 (on-site fuel) and Scope 2 (grid electricity) come from equipment/workforce
      // telemetry, not from material consumption, so this producer only ever emits Scope 3.
      ghg_scope: 'SCOPE_3',
      recorded_at: new Date(record.recorded_at).toISOString(),
    });
    logger.info({
      event: 'carbon.record.created',
      carbon_record_id: record.carbon_record_id,
      consumption_id: record.consumption_id,
      tenant_id: this.tenantId,
      trace_id: this.correlationId,
    });
  }

  async resolveConflict(conflictId: string) {
    const record = await this.repo.resolveConflictRecord(conflictId, this.userId);
    if (!record) {
      throw new UnprocessableEntityException({
        error: {
          code: 'COS-SITE-004',
          message: 'Conflict record not found or already resolved',
        },
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

  /** Queue a domain event. Durable and off the request path — see EventOutboxService. */
  private async emitEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    await this.outbox.publish({
      event_type: eventType,
      event_version: '1.0',
      tenant_id: this.tenantId,
      actor_id: this.userId,
      occurred_at: new Date().toISOString(),
      correlation_id: this.correlationId,
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
