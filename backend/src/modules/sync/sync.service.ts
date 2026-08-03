// SyncService — generic offline-sync server (Finding 2).
// Contract expected by the mobile DeltaSyncClient + SyncManager:
//   GET  /sync/delta  → { updated, deleted, server_timestamp }
//   POST /sync/push   → { status, server_payload? }  (per-entity §17.5 conflict strategy)
//   POST /sync/resolve (E2E write path) → same as push
//
// Push DELEGATES to the existing, already-tested domain services (reuse, not re-implement):
//   site_report → SiteOpsService.syncSiteReports (LWW + conflict-records)
//   issue       → SiteOpsService.createIssue
//   attendance  → WorkforceService.recordAttendance (server-authoritative timestamps)
//   safety      → SafetyService.createIncident
//   material    → SiteOpsService.createMaterialConsumption (append-only)
// task stays a direct Max-wins UPDATE (monotonic; no dedicated service method).
//
// delta + tombstones use TenantPrismaService directly (tenant-scoped via app_user + RLS GUC).
// NOTE: syncSiteReports returns conflict_status without server_payload, so site_report responses
// omit server_payload (the server row is preserved in the site-ops conflict-record).

import { Injectable, Scope, BadRequestException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';
import { SiteOpsService } from '../site-ops/site-ops.service';
import { SafetyService } from '../safety/safety.service';
import { WorkforceService } from '../workforce/workforce.service';
import { AnnotationService } from '../files/annotation.service';
import type { CreateIssueDto } from '../site-ops/dto/create-issue.dto';
import type { CreateMaterialConsumptionDto } from '../site-ops/dto/create-material-consumption.dto';
import type { SubmitInspectionDto } from '../site-ops/dto/submit-inspection.dto';
import type { SyncSiteReportsDto } from '../site-ops/dto/sync-site-reports.dto';
import type { RecordAttendanceDto } from '../workforce/dto/attendance.dto';
import type { CreateIncidentDto } from '../safety/dto/safety.dto';
import { PushItemDto, PushResponse, DeltaResponse, ServerSyncStatus } from './dto/sync.dto';
import { tombstoneRetentionCutoff, tombstoneRetentionDays } from './tombstone-retention';

interface EntityRegistryEntry {
  table: string; // schema-qualified
  deltaColumn: string;
}

// Per-entity-type cap on one /sync/delta page. Bounds both the SQL result set and the JSON response;
// see the note on delta() for how the client resumes past a truncated page.
const DELTA_PAGE_SIZE = 500;

/** Normalise a delta-column value (pg returns Date for timestamptz) to an ISO cursor string. */
function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

const ENTITY_REGISTRY: Record<string, EntityRegistryEntry> = {
  task: { table: 'projects.tasks', deltaColumn: 'created_at' }, // no updated_at → delta = new tasks only (TODO: modified_at)
  site_report: { table: 'site_ops.site_reports', deltaColumn: 'modified_at' },
  issue: { table: 'site_ops.issues', deltaColumn: 'modified_at' },
  attendance: { table: 'workforce_telemetry.attendance_logs', deltaColumn: 'recorded_at' },
  safety: { table: 'site_ops.incidents', deltaColumn: 'created_at' },
  material: { table: 'site_ops.material_consumptions', deltaColumn: 'created_at' },
};

@Injectable({ scope: Scope.REQUEST })
export class SyncService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly siteOps: SiteOpsService,
    private readonly safety: SafetyService,
    private readonly workforce: WorkforceService,
    private readonly annotations: AnnotationService,
  ) {}

  /**
   * Pull everything changed since `sinceIso`, in bounded pages.
   *
   * This used to run `SELECT *` with no LIMIT and no ORDER BY, once per entity type. The controller
   * defaults `since` to the epoch, so a client that had never synced — or one that lost its cursor —
   * pulled every row of every table into memory in one response.
   *
   * Paging rule: each type is capped at DELTA_PAGE_SIZE rows ordered by its delta column. If ANY type
   * is truncated, `server_timestamp` becomes the LOWEST watermark among the truncated types rather
   * than "now", so the next call resumes from there. Types that drained fully will resend a few rows
   * that fall after that watermark — harmless, because push/delta handlers are upserts — whereas
   * returning "now" would silently skip everything that did not fit. At-least-once, never skip.
   *
   * Residual limitation: the cursor is a timestamp, so a full page of rows sharing one identical
   * timestamp cannot be paged past. timestamptz has microsecond resolution and the page is 500 rows,
   * so this needs 500 writes inside the same microsecond. Fixing it properly means a composite
   * (timestamp, id) cursor, which is a client-visible contract change.
   */
  async delta(sinceIso: string, entityTypes: string[]): Promise<DeltaResponse> {
    // Cursor must be a real instant before it is bound as ::timestamptz — an unparseable `since`
    // would otherwise surface as a Postgres error (HTTP 500) rather than a 400 the client can act on.
    const sinceMs = Date.parse(sinceIso);
    if (!Number.isFinite(sinceMs)) {
      throw new BadRequestException({
        code: 'COS-SYNC-002',
        message: `Invalid 'since' cursor: ${sinceIso}`,
        messageKey: 'sync.delta.invalidCursor',
      });
    }

    // Retention guard — the other half of the tombstone-prune contract (tombstone-retention.ts).
    // Tombstones older than the window are deleted, so a cursor that predates it cannot be brought
    // up to date incrementally: deletions the client never saw no longer exist to be sent, and those
    // rows would live on that device forever.
    //
    // The flag is ADVISORY and the rows are still returned. Two reasons not to early-return empty:
    // the controller defaults `since` to the epoch for a client that never synced (an early return
    // would break first sync outright), and the server cannot tell "never synced" from "offline for
    // two years" — both send an ancient cursor. Returning the normal paged delta alongside
    // `full_resync_required` serves both: a client with no local state loses nothing by wiping it,
    // and an existing client learns it must drop local state before applying these pages. Clients
    // that ignore the new field behave exactly as they do today.
    const cutoff = tombstoneRetentionCutoff();
    const fullResyncRequired = sinceMs < cutoff.getTime();

    const types = entityTypes.filter((t) => ENTITY_REGISTRY[t]);
    const updated: Record<string, unknown>[] = [];
    const truncatedWatermarks: string[] = [];

    for (const type of types) {
      const entry = ENTITY_REGISTRY[type]!;
      const rows = await this.db.run((tx) =>
        tx.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT * FROM ${entry.table}
           WHERE ${entry.deltaColumn} > $1::timestamptz
           ORDER BY ${entry.deltaColumn} ASC
           LIMIT $2`,
          sinceIso,
          DELTA_PAGE_SIZE,
        ),
      );
      for (const row of rows) updated.push({ entity_type: type, ...row });

      if (rows.length === DELTA_PAGE_SIZE) {
        const watermark = toIso(rows[rows.length - 1]![entry.deltaColumn]);
        if (watermark) truncatedWatermarks.push(watermark);
      }
    }

    const tombstones =
      types.length === 0
        ? []
        : await this.db.run((tx) =>
            tx.$queryRawUnsafe<{ entity_id: string; deleted_at: unknown }[]>(
              `SELECT entity_id, deleted_at FROM platform.sync_tombstones
               WHERE entity_type = ANY($1::text[]) AND deleted_at > $2::timestamptz
               ORDER BY deleted_at ASC
               LIMIT $3`,
              types,
              sinceIso,
              DELTA_PAGE_SIZE,
            ),
          );

    if (tombstones.length === DELTA_PAGE_SIZE) {
      const watermark = toIso(tombstones[tombstones.length - 1]!.deleted_at);
      if (watermark) truncatedWatermarks.push(watermark);
    }

    const hasMore = truncatedWatermarks.length > 0;
    return {
      updated,
      deleted: tombstones.map((t) => t.entity_id),
      // Lowest watermark wins — resuming from the earliest truncation point cannot skip any type.
      server_timestamp: hasMore
        ? truncatedWatermarks.reduce((a, b) => (a < b ? a : b))
        : new Date().toISOString(),
      has_more: hasMore,
      full_resync_required: fullResyncRequired,
      ...(fullResyncRequired ? { retention_days: tombstoneRetentionDays() } : {}),
    };
  }

  async push(dto: PushItemDto): Promise<PushResponse> {
    switch (dto.entity_type) {
      case 'task':
        return this.pushTask(dto);

      case 'site_report': {
        const items = [{ ...dto.payload, client_id: dto.entity_id }];
        const results = await this.siteOps.syncSiteReports({
          items,
        } as unknown as SyncSiteReportsDto);
        const status = (results[0]?.conflict_status ?? 'ACCEPTED') as ServerSyncStatus;
        return { status };
      }

      case 'issue': {
        const row = await this.siteOps.createIssue(dto.payload as unknown as CreateIssueDto);
        return { status: 'ACCEPTED', server_payload: row };
      }

      case 'attendance': {
        const workerId = (dto.payload['worker_id'] as string) ?? dto.entity_id;
        const row = await this.workforce.recordAttendance(
          workerId,
          dto.payload as unknown as RecordAttendanceDto,
        );
        return { status: 'ACCEPTED', server_payload: row };
      }

      case 'safety': {
        const row = await this.safety.createIncident(dto.payload as unknown as CreateIncidentDto);
        return { status: 'ACCEPTED', server_payload: row };
      }

      case 'material': {
        const reportId = dto.payload['report_id'] as string;
        const row = await this.siteOps.createMaterialConsumption(
          reportId,
          dto.payload as unknown as CreateMaterialConsumptionDto,
        );
        return { status: 'ACCEPTED', server_payload: row };
      }

      case 'inspection': {
        // Offline inspection submission (§17.4 offline read/write; QM-1 mobile E2E #2). The payload
        // carries the full SubmitInspectionDto (project_id, checklist_id, status, inspected_at).
        const row = await this.siteOps.submitInspection(
          dto.payload as unknown as SubmitInspectionDto,
        );
        return { status: 'ACCEPTED', server_payload: row };
      }

      case 'photo_annotation': {
        // Re-editable photo markup (ADR-056; §17.5). entity_id is the file_id; the payload carries the
        // stroke list + the base version the client read. CONFLICT_FLAGGED when someone else saved in
        // between — the resolver, not this switch, decides.
        const strokes = (dto.payload['strokes'] as unknown[] | undefined) ?? [];
        const baseVersion = (dto.payload['version'] as number | undefined) ?? 0;
        const result = await this.annotations.applyPush(dto.entity_id, strokes, baseVersion);
        return {
          status: result.conflict_status as ServerSyncStatus,
          server_payload: result.annotation ?? undefined,
        };
      }

      default:
        throw new BadRequestException(`Unknown entity_type: ${dto.entity_type}`);
    }
  }

  // task.progress_percent: Max-wins (§17.5) — monotonic; GREATEST never regresses; no conflict.
  private async pushTask(dto: PushItemDto): Promise<PushResponse> {
    const incoming = Number(dto.payload['progress_percent']);
    const clamped = Math.max(0, Math.min(100, Number.isFinite(incoming) ? incoming : 0));
    const rows = await this.db.run((tx) =>
      tx.$queryRawUnsafe<Record<string, unknown>[]>(
        `UPDATE projects.tasks SET progress_percent = GREATEST(progress_percent, $1)
         WHERE task_id = $2::uuid RETURNING *`,
        clamped,
        dto.entity_id,
      ),
    );
    return { status: 'ACCEPTED', server_payload: rows[0] ?? null };
  }

  /** Record a deletion so /sync/delta can report it (mixed i+iii). Wire from entity delete paths. */
  async recordTombstone(entityType: string, entityId: string): Promise<void> {
    await this.db.run((tx) =>
      tx.$queryRawUnsafe(
        `INSERT INTO platform.sync_tombstones (tenant_id, entity_type, entity_id)
         VALUES (NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid, $1, $2::uuid)`,
        entityType,
        entityId,
      ),
    );
  }
}
