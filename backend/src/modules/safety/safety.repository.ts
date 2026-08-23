// Safety Repository — Phase 6 (incidents, permits, compliance)
// All DB access via TenantPrismaService (SET LOCAL app.current_tenant_id per request — ADR-008).

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';
import { clsTenantId } from '../../shared/context/cls-context';

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface IncidentRow {
  incident_id: string;
  tenant_id: string;
  project_id: string;
  task_id: string | null;
  incident_type: string;
  severity: IncidentSeverity;
  reported_by: string;
  status: IncidentStatus;
  acknowledged_by: string | null;
  acknowledged_at: Date | null;
  created_at: Date;
}

export type PermitType = 'WORK_PERMIT' | 'SAFETY_PERMIT' | 'DRAWING_APPROVAL' | 'ENTRY_PERMIT';
export type PermitStatus = 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export interface PermitRow {
  permit_id: string;
  tenant_id: string;
  project_id: string;
  permit_type: PermitType;
  permit_number: string;
  issued_by: string | null;
  valid_from: Date | null;
  valid_until: Date | null;
  status: PermitStatus;
  linked_task_id: string | null;
  created_by: string | null;
  created_at: Date;
  /** Firm performing the work. Free text, NOT an FK to procurement.vendors — see the migration. */
  contractor_name: string | null;
  description: string | null;
  /** Why status became REVOKED. NULL = never revoked, or revoked without a reason given. */
  revoke_reason: string | null;
}

export interface ComplianceSummaryRow {
  open_incidents: number;
  high_critical_incidents: number;
  expired_permits: number;
  revoked_permits: number;
}

@Injectable({ scope: Scope.REQUEST })
export class SafetyRepository {
  // CLS fallback is load-bearing, not cosmetic: under Fastify the REQUEST injected into a
  // Scope.REQUEST provider is not guaranteed to be the object the auth layer decorated. The auth
  // guards publish tenant_id into CLS (the same source TenantPrismaService reads for RLS), so this
  // resolves even when the request copy does not carry it.
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? clsTenantId();
  }

  constructor(
    private readonly db: TenantPrismaService,
    @Inject(REQUEST) private readonly request: { tenantId?: string },
  ) {}

  // ── Incidents ───────────────────────────────────────────────────────────────

  /**
   * Insert an incident under a caller-supplied id.
   *
   * ON CONFLICT DO NOTHING against the `incident_id` primary key, the same idempotency shape
   * `insertCarbonRecord` uses in site-ops: a replayed offline incident must not become a second
   * safety record. Returns null when the row already existed, so the caller can skip re-emitting
   * `safety.incident.created.v1` — re-emitting is what would re-notify the Safety Officer and re-arm
   * the §19.3 escalation timer for an incident that was already reported.
   *
   * `incident_id` is now passed explicitly rather than left to the column DEFAULT, because the
   * conflict target has to be a value the client can repeat.
   */
  async createIncident(params: {
    incident_id: string;
    project_id: string;
    incident_type: string;
    severity: string;
    reported_by: string;
    task_id?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  }): Promise<IncidentRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<IncidentRow[]>`
        INSERT INTO site_ops.incidents
          (incident_id, tenant_id, project_id, task_id, incident_type, severity, reported_by,
           latitude, longitude)
        VALUES
          (${params.incident_id}::uuid, ${this.tenantId}::uuid, ${params.project_id}::uuid,
           ${params.task_id ?? null}::uuid,
           ${params.incident_type}::text, ${params.severity}::text, ${params.reported_by}::uuid,
           ${params.latitude ?? null}::numeric, ${params.longitude ?? null}::numeric)
        ON CONFLICT (incident_id) DO NOTHING
        RETURNING *
      `,
    );
    return rows[0] ?? null;
  }

  async findIncidents(params: {
    project_id?: string;
    status?: string;
    severity?: string;
    page: number;
    limit: number;
  }): Promise<{ rows: IncidentRow[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<IncidentRow[]>`
        SELECT * FROM site_ops.incidents
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (NULLIF(${params.project_id ?? ''}, '')::uuid IS NULL OR project_id = NULLIF(${params.project_id ?? ''}, '')::uuid)
          AND (${params.status ?? null}::text IS NULL OR status = ${params.status ?? null}::text)
          AND (${params.severity ?? null}::text IS NULL OR severity = ${params.severity ?? null}::text)
        ORDER BY created_at DESC
        LIMIT ${params.limit} OFFSET ${offset}
      `,
    );
    const countRows = await this.db.run(
      (tx) =>
        tx.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM site_ops.incidents
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (NULLIF(${params.project_id ?? ''}, '')::uuid IS NULL OR project_id = NULLIF(${params.project_id ?? ''}, '')::uuid)
          AND (${params.status ?? null}::text IS NULL OR status = ${params.status ?? null}::text)
          AND (${params.severity ?? null}::text IS NULL OR severity = ${params.severity ?? null}::text)
      `,
    );
    return { rows, total: Number(countRows[0]?.count ?? 0) };
  }

  async findIncidentById(incidentId: string): Promise<IncidentRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<IncidentRow[]>`
        SELECT * FROM site_ops.incidents
        WHERE incident_id = ${incidentId}::uuid AND tenant_id = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  /** Acknowledge: OPEN → IN_PROGRESS + records the acknowledger. */
  async acknowledgeIncident(incidentId: string, acknowledgedBy: string): Promise<IncidentRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<IncidentRow[]>`
        UPDATE site_ops.incidents SET
          status = 'IN_PROGRESS',
          acknowledged_by = ${acknowledgedBy}::uuid,
          acknowledged_at = now(),
          -- /sync/delta pages safety on this column. Without it the acknowledgement stays on the
          -- server and every other handset keeps showing the incident as OPEN.
          modified_at = now()
        WHERE incident_id = ${incidentId}::uuid AND tenant_id = ${this.tenantId}::uuid
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  // ── Permits ───────────────────────────────────────────────────────────────

  async createPermit(params: {
    project_id: string;
    permit_type: string;
    permit_number: string;
    linked_task_id?: string | null;
    valid_from?: string | null;
    valid_until?: string | null;
    contractor_name?: string | null;
    description?: string | null;
    created_by: string;
  }): Promise<PermitRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<PermitRow[]>`
        INSERT INTO site_ops.permits
          (tenant_id, project_id, permit_type, permit_number, linked_task_id,
           valid_from, valid_until, contractor_name, description, created_by)
        VALUES
          (${this.tenantId}::uuid, ${params.project_id}::uuid, ${params.permit_type},
           ${params.permit_number}, ${params.linked_task_id ?? null}::uuid,
           ${params.valid_from ?? null}::date, ${params.valid_until ?? null}::date,
           ${params.contractor_name ?? null}, ${params.description ?? null},
           ${params.created_by}::uuid)
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async findPermits(params: {
    project_id?: string;
    status?: string;
    page: number;
    limit: number;
  }): Promise<{ rows: PermitRow[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<PermitRow[]>`
        SELECT * FROM site_ops.permits
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (NULLIF(${params.project_id ?? ''}, '')::uuid IS NULL OR project_id = NULLIF(${params.project_id ?? ''}, '')::uuid)
          AND (${params.status ?? null}::text IS NULL OR status = ${params.status ?? null}::text)
        ORDER BY created_at DESC
        LIMIT ${params.limit} OFFSET ${offset}
      `,
    );
    const countRows = await this.db.run(
      (tx) =>
        tx.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM site_ops.permits
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (NULLIF(${params.project_id ?? ''}, '')::uuid IS NULL OR project_id = NULLIF(${params.project_id ?? ''}, '')::uuid)
          AND (${params.status ?? null}::text IS NULL OR status = ${params.status ?? null}::text)
      `,
    );
    return { rows, total: Number(countRows[0]?.count ?? 0) };
  }

  async findPermitById(permitId: string): Promise<PermitRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<PermitRow[]>`
        SELECT * FROM site_ops.permits
        WHERE permit_id = ${permitId}::uuid AND tenant_id = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  /**
   * PENDING → ACTIVE or PENDING → REVOKED.
   *
   * `revokeReason` is written ONLY on the REVOKED branch. The CASE is not decoration: writing the
   * parameter unconditionally would let a later approve-after-revoke path erase the reason the
   * permit was revoked for. No such transition exists today (§15.5 only leaves PENDING), which is
   * exactly why the guard belongs in the statement rather than in a caller's memory.
   */
  async updatePermitStatus(
    permitId: string,
    status: 'ACTIVE' | 'REVOKED',
    revokeReason?: string | null,
  ): Promise<PermitRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<PermitRow[]>`
        UPDATE site_ops.permits
        SET status = ${status},
            revoke_reason = CASE WHEN ${status} = 'REVOKED'
                                 THEN ${revokeReason ?? null}
                                 ELSE revoke_reason END
        WHERE permit_id = ${permitId}::uuid AND tenant_id = ${this.tenantId}::uuid
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  // ── Compliance ──────────────────────────────────────────────────────────────

  /** Deterministic compliance summary: open incidents (+ HIGH/CRITICAL) and bad permits. */
  async getComplianceSummary(project_id?: string): Promise<ComplianceSummaryRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<ComplianceSummaryRow[]>`
        SELECT
          (SELECT COUNT(*)::int FROM site_ops.incidents i
             WHERE i.tenant_id = ${this.tenantId}::uuid AND i.status = 'OPEN'
               AND (${project_id ?? null}::uuid IS NULL OR i.project_id = ${project_id ?? null}::uuid)
          ) AS open_incidents,
          (SELECT COUNT(*)::int FROM site_ops.incidents i
             WHERE i.tenant_id = ${this.tenantId}::uuid AND i.status = 'OPEN'
               AND i.severity IN ('HIGH', 'CRITICAL')
               AND (${project_id ?? null}::uuid IS NULL OR i.project_id = ${project_id ?? null}::uuid)
          ) AS high_critical_incidents,
          (SELECT COUNT(*)::int FROM site_ops.permits p
             WHERE p.tenant_id = ${this.tenantId}::uuid AND p.status = 'EXPIRED'
               AND (${project_id ?? null}::uuid IS NULL OR p.project_id = ${project_id ?? null}::uuid)
          ) AS expired_permits,
          (SELECT COUNT(*)::int FROM site_ops.permits p
             WHERE p.tenant_id = ${this.tenantId}::uuid AND p.status = 'REVOKED'
               AND (${project_id ?? null}::uuid IS NULL OR p.project_id = ${project_id ?? null}::uuid)
          ) AS revoked_permits
      `,
    );
    return rows[0]!;
  }
}
