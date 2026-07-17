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

interface EntityRegistryEntry {
  table: string; // schema-qualified
  deltaColumn: string;
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

  async delta(sinceIso: string, entityTypes: string[]): Promise<DeltaResponse> {
    const types = entityTypes.filter((t) => ENTITY_REGISTRY[t]);
    const updated: Record<string, unknown>[] = [];

    for (const type of types) {
      const entry = ENTITY_REGISTRY[type]!;
      const rows = await this.db.run((tx) =>
        tx.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT * FROM ${entry.table} WHERE ${entry.deltaColumn} > $1::timestamptz`,
          sinceIso,
        ),
      );
      for (const row of rows) updated.push({ entity_type: type, ...row });
    }

    const tombstones =
      types.length === 0
        ? []
        : await this.db.run((tx) =>
            tx.$queryRawUnsafe<{ entity_id: string }[]>(
              `SELECT entity_id FROM platform.sync_tombstones
               WHERE entity_type = ANY($1::text[]) AND deleted_at > $2::timestamptz`,
              types,
              sinceIso,
            ),
          );

    return {
      updated,
      deleted: tombstones.map((t) => t.entity_id),
      server_timestamp: new Date().toISOString(),
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
