// Project Risk Service — ADR-065 (risk register). Tenant-scoped CRUD + status transitions, and it
// emits RiskRaised / RiskStatusChanged (ADR-065 §Events; §15/§16) via the shared KafkaProducer, the
// same posture as ProjectService. Error structure follows QM-10.

import { Injectable, Scope, Inject, NotFoundException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { EventOutboxService } from '../../../shared/events/event-outbox.service';
import { createLogger } from '@cos/logger';
import { RisksRepository } from './risks.repository';
import type { RiskRow } from './risks.repository';
import type { CreateRiskDto } from './dto/create-risk.dto';
import type { SuggestedRiskInput } from './ai-risk-mapping';
import { SYSTEM_ACTOR_ID } from '../../../shared/system-actor';
import type { UpdateRiskDto } from './dto/update-risk.dto';
import type { RiskStatusDto } from './dto/risk-status.dto';
import type { ListRisksDto } from './dto/list-risks.dto';

const logger = createLogger('risks-service');

@Injectable({ scope: Scope.REQUEST })
export class RisksService {
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? '';
  }
  private get userId(): string {
    return (this.request as { userId?: string }).userId ?? '';
  }
  private readonly correlationId: string;

  constructor(
    private readonly repo: RisksRepository,
    @Inject(REQUEST) private readonly request: Request & { tenantId?: string; userId?: string },
    private readonly outbox: EventOutboxService,
  ) {
    this.correlationId = randomUUID();
  }

  private notFound(): never {
    throw new NotFoundException({
      error: {
        code: 'COS-RISK-001',
        message: 'Project risk not found',
        messageKey: 'risk.error.notFound',
        traceId: this.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async create(projectId: string, dto: CreateRiskDto): Promise<RiskRow> {
    if (!(await this.repo.projectExists(projectId))) {
      throw new NotFoundException({
        error: {
          code: 'COS-RISK-002',
          message: 'Parent project not found',
          messageKey: 'risk.error.projectNotFound',
          traceId: this.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }
    const risk = await this.repo.create(projectId, dto, this.userId);

    await this.publishEvent('construction.project.risk_raised.v1', {
      project_id: risk.project_id,
      risk_id: risk.risk_id,
      title: risk.title,
      category: risk.category,
      likelihood: risk.likelihood,
      impact: risk.impact,
      risk_score: risk.risk_score,
      source: risk.source,
    });

    logger.info(
      { project_id: projectId, risk_id: risk.risk_id, correlation_id: this.correlationId },
      'risk.raised',
    );
    return risk;
  }

  /**
   * Create an AI-suggested risk from the delay-risk feed (ADR-065). created_by is the system actor
   * (no human author); source is AI_SUGGESTED. Returns null when the project no longer exists, so the
   * consumer skips rather than failing. Emits RiskRaised like any raised risk (humans triage it).
   */
  async createSuggested(projectId: string, input: SuggestedRiskInput): Promise<RiskRow | null> {
    if (!(await this.repo.projectExists(projectId))) return null;

    const dto = {
      title: input.title,
      description: input.description,
      category: input.category as unknown as CreateRiskDto['category'],
      likelihood: input.likelihood,
      impact: input.impact,
    } as CreateRiskDto;
    const risk = await this.repo.create(projectId, dto, SYSTEM_ACTOR_ID, 'AI_SUGGESTED');

    await this.publishEvent('construction.project.risk_raised.v1', {
      project_id: risk.project_id,
      risk_id: risk.risk_id,
      title: risk.title,
      category: risk.category,
      likelihood: risk.likelihood,
      impact: risk.impact,
      risk_score: risk.risk_score,
      source: risk.source,
    });

    logger.info(
      { project_id: projectId, risk_id: risk.risk_id, correlation_id: this.correlationId },
      'risk.ai_suggested',
    );
    return risk;
  }

  async findById(riskId: string): Promise<RiskRow> {
    const risk = await this.repo.findById(riskId);
    if (!risk) this.notFound();
    return risk;
  }

  // Highest-risk first (ADR-065 heat map); returns the whole filtered list.
  list(projectId: string, dto: ListRisksDto): Promise<RiskRow[]> {
    return this.repo.list(projectId, { status: dto.status, category: dto.category });
  }

  async update(riskId: string, dto: UpdateRiskDto): Promise<RiskRow> {
    await this.findById(riskId); // 404 guard
    return this.repo.update(riskId, dto);
  }

  async updateStatus(riskId: string, dto: RiskStatusDto): Promise<RiskRow> {
    const existing = await this.findById(riskId); // 404 guard + from_status
    const updated = await this.repo.updateStatus(riskId, dto.status);

    await this.publishEvent('construction.project.risk_status_changed.v1', {
      project_id: updated.project_id,
      risk_id: updated.risk_id,
      from_status: existing.status,
      to_status: updated.status,
    });

    logger.info(
      {
        risk_id: riskId,
        from: existing.status,
        to: updated.status,
        correlation_id: this.correlationId,
      },
      'risk.status_changed',
    );
    return updated;
  }

  /** Queue a domain event. The outbox the old comment here promised now exists. */
  private async publishEvent<T>(eventType: string, payload: T): Promise<void> {
    await this.outbox.publish<T>({
      event_type: eventType,
      event_version: '1.0',
      tenant_id: this.tenantId,
      actor_id: this.userId,
      occurred_at: new Date().toISOString(),
      correlation_id: this.correlationId,
      payload,
    });
  }
}
