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
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { KafkaProducer } from '@cos/shared';
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
  private readonly kafka = new KafkaProducer();

  constructor(
    private readonly repo: SafetyRepository,
    @Inject(REQUEST) private readonly request: { userId?: string; correlationId?: string },
  ) {
    this.correlationId = request.correlationId ?? randomUUID();
  }

  // ── Incidents ───────────────────────────────────────────────────────────────

  async createIncident(dto: CreateIncidentDto): Promise<IncidentRow> {
    const incident = await this.repo.createIncident({
      project_id: dto.project_id,
      incident_type: dto.incident_type,
      severity: dto.severity,
      task_id: dto.task_id ?? null,
      reported_by: this.userId,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
    });
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
      /* istanbul ignore next -- String(err) fallback is defensive */
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({
        event: 'kafka.publish.failed',
        event_type: eventType,
        tenant_id: this.tenantId,
        error: errMsg,
      });
    } finally {
      await this.kafka.disconnect().catch(/* istanbul ignore next */ () => undefined);
    }
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

  /** Reject a PENDING permit → REVOKED. */
  async rejectPermit(permitId: string): Promise<PermitRow> {
    const permit = await this.getPermit(permitId);
    if (permit.status !== 'PENDING') {
      throw new UnprocessableEntityException({
        code: 'COS-SAFE-003',
        message: `Permit is ${permit.status}; only PENDING permits can be rejected`,
      });
    }
    return this.repo.updatePermitStatus(permitId, 'REVOKED');
  }

  // ── Compliance ──────────────────────────────────────────────────────────────

  async getCompliance(project_id?: string): Promise<ComplianceSummaryRow> {
    return this.repo.getComplianceSummary(project_id);
  }
}
