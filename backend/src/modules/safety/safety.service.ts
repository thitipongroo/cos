// Safety Service — Phase 6 (incidents, permits, compliance)
// Permit approval follows §15.5: Site Engineer initiates → Safety Officer approves →
// PM is final for SAFETY_PERMIT. Status enum (§11) has no intermediate state, so a SAFETY_PERMIT
// becomes ACTIVE only on a PM/Admin approval; other permit types activate on Safety Officer
// approval (ADR-027).

import {
  Injectable,
  Scope,
  Inject,
  NotFoundException,
  UnprocessableEntityException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { EventOutboxService } from '../../shared/events/event-outbox.service';
import { createLogger } from '@cos/logger';
import { clsUserId, clsTenantId } from '../../shared/context/cls-context';
import { SafetyRepository } from './safety.repository';
import type { IncidentRow, PermitRow, ComplianceSummaryRow } from './safety.repository';
import type { CreateIncidentDto, CreatePermitDto } from './dto/safety.dto';

const logger = createLogger('safety-service');

@Injectable({ scope: Scope.REQUEST })
export class SafetyService {
  // Resolve the caller's user_id lazily. TenantContextInterceptor publishes `req.userId`, but under
  // @nestjs/platform-fastify that mutation does not reliably reach a Scope.REQUEST provider's injected
  // REQUEST (the request is cloned), so fall back to CLS (set reliably by JwtAuthGuard). Reading in a
  // getter (not the constructor) guarantees CLS is active at call time. `req.user?.user_id` — the old
  // source — was always undefined here → reported_by='' → Postgres 22P02 on ::uuid. (Matches workforce.)
  private get userId(): string {
    return (this.request as { userId?: string }).userId || clsUserId();
  }

  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId || clsTenantId();
  }

  private readonly correlationId: string;

  constructor(
    private readonly repo: SafetyRepository,
    @Inject(REQUEST) private readonly request: { userId?: string; correlationId?: string },
    private readonly outbox: EventOutboxService,
  ) {
    this.correlationId = request.correlationId ?? randomUUID();
  }

  // ── Incidents ───────────────────────────────────────────────────────────────

  /**
   * Report an incident, at most once per client id.
   *
   * Use the client-provided id when present (offline create; mirrors `createIssue`'s G-M11 handling),
   * else generate. The repository inserts ON CONFLICT DO NOTHING, so a REPLAY of the same queued
   * mutation — which `/sync/push` will do after a timeout, or after any retry — resolves to the
   * incident that already exists instead of filing a second one.
   *
   * The early return on a replay is the point of the whole thing: it skips the event, and with it the
   * duplicate Safety Officer notification and the second §19.3 escalation timer.
   */
  async createIncident(dto: CreateIncidentDto): Promise<IncidentRow> {
    const incidentId = dto.client_id ?? randomUUID();
    const incident = await this.repo.createIncident({
      incident_id: incidentId,
      project_id: dto.project_id,
      incident_type: dto.incident_type,
      severity: dto.severity,
      task_id: dto.task_id ?? null,
      reported_by: this.userId,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
    });

    if (!incident) {
      // Already reported. Read it back so the caller still gets the row it asked for.
      const existing = await this.repo.findIncidentById(incidentId);
      if (existing) {
        logger.info({ incident_id: incidentId }, 'incident.reported.duplicate_ignored');
        return existing;
      }
      // The id conflicted but is not visible here, so it belongs to another tenant — RLS hides the
      // row while the primary key still rejects the insert. Vanishingly unlikely with client-side
      // UUIDv4, and a conflict the caller must be told about rather than a silent success.
      throw new ConflictException({
        error: {
          code: 'COS-SAFETY-409',
          message: 'incident_id is already in use',
          messageKey: 'safety.incident.duplicateId',
        },
      });
    }

    logger.info({ incident_id: incident.incident_id, severity: dto.severity }, 'incident.reported');

    // Emit safety.incident.created.v1 (§19.3) — the Notification Service consumes this to notify the
    // Safety Officer + PM and to arm the 30-minute unacknowledged-escalation timer.
    await this.emitEvent('safety.incident.created.v1', {
      incident_id: incident.incident_id,
      project_id: incident.project_id,
      incident_type: dto.incident_type,
      severity: dto.severity,
      task_id: dto.task_id ?? null,
      reported_by: this.userId,
    });
    return incident;
  }

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

  async listIncidents(params: {
    project_id?: string;
    status?: string;
    severity?: string;
    page: number;
    limit: number;
  }): Promise<{ items: IncidentRow[]; total: number; page: number; limit: number }> {
    const { rows, total } = await this.repo.findIncidents(params);
    return { items: rows, total, page: params.page, limit: params.limit };
  }

  async acknowledgeIncident(incidentId: string): Promise<IncidentRow> {
    const incident = await this.repo.findIncidentById(incidentId);
    if (!incident) {
      throw new NotFoundException({
        error: { code: 'COS-SAFE-001', message: 'Incident not found' },
      });
    }
    const updated = await this.repo.acknowledgeIncident(incidentId, this.userId);
    logger.info({ incident_id: incidentId, by: this.userId }, 'incident.acknowledged');
    return updated;
  }

  // ── Permits ───────────────────────────────────────────────────────────────

  async createPermit(dto: CreatePermitDto): Promise<PermitRow> {
    return this.repo.createPermit({
      project_id: dto.project_id,
      permit_type: dto.permit_type,
      permit_number: dto.permit_number,
      linked_task_id: dto.linked_task_id ?? null,
      valid_from: dto.valid_from ?? null,
      valid_until: dto.valid_until ?? null,
      contractor_name: dto.contractor_name ?? null,
      description: dto.description ?? null,
      created_by: this.userId,
    });
  }

  async listPermits(params: {
    project_id?: string;
    status?: string;
    page: number;
    limit: number;
  }): Promise<{ items: PermitRow[]; total: number; page: number; limit: number }> {
    const { rows, total } = await this.repo.findPermits(params);
    return { items: rows, total, page: params.page, limit: params.limit };
  }

  async getPermit(permitId: string): Promise<PermitRow> {
    const permit = await this.repo.findPermitById(permitId);
    if (!permit) {
      throw new NotFoundException({ error: { code: 'COS-SAFE-002', message: 'Permit not found' } });
    }
    return permit;
  }

  /** Approve a PENDING permit → ACTIVE (§15.5: SAFETY_PERMIT requires PM/Admin as final). */
  async approvePermit(
    permitId: string,
    tier: 'SAFETY_OFFICER' | 'PROJECT_MANAGER' | 'TENANT_ADMIN',
  ): Promise<PermitRow> {
    const permit = await this.getPermit(permitId);
    if (permit.status !== 'PENDING') {
      throw new UnprocessableEntityException({
        code: 'COS-SAFE-003',
        message: `Permit is ${permit.status}; only PENDING permits can be approved`,
      });
    }
    if (permit.permit_type === 'SAFETY_PERMIT' && tier === 'SAFETY_OFFICER') {
      throw new ForbiddenException({
        error: {
          code: 'COS-SAFE-004',
          message: 'Safety permits require PM (final) approval',
        },
      });
    }
    const updated = await this.repo.updatePermitStatus(permitId, 'ACTIVE');
    logger.info({ permit_id: permitId, tier }, 'permit.approved');
    return updated;
  }

  /**
   * Reject a PENDING permit → REVOKED.
   *
   * `reason` is optional because the endpoint took no body at all until 2026-08-13 and a client
   * that still sends `{}` must keep working (QM-2). Absent, the row stores NULL rather than an
   * invented string — "no reason was given" and "the reason was blank" are the same fact here, and
   * neither is "rejected for cause".
   */
  async rejectPermit(permitId: string, reason?: string): Promise<PermitRow> {
    const permit = await this.getPermit(permitId);
    if (permit.status !== 'PENDING') {
      throw new UnprocessableEntityException({
        code: 'COS-SAFE-003',
        message: `Permit is ${permit.status}; only PENDING permits can be rejected`,
      });
    }
    return this.repo.updatePermitStatus(permitId, 'REVOKED', reason ?? null);
  }

  // ── Compliance ──────────────────────────────────────────────────────────────

  async getCompliance(project_id?: string): Promise<ComplianceSummaryRow> {
    return this.repo.getComplianceSummary(project_id);
  }
}
