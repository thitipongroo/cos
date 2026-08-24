// Project Phases Service — Phase 3 amendment (ADR-070).
// Tenant-scoped CRUD subset (create / list / update). No Kafka events — phases are project
// backing/structure data (same treatment as buildings/floors). Error structure follows QM-10.

import { Injectable, Scope, Inject, NotFoundException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { createLogger } from '@cos/logger';
import { PhasesRepository } from './phases.repository';
import type { PhaseRow } from './phases.repository';
import type { CreatePhaseDto } from './dto/create-phase.dto';
import type { UpdatePhaseDto } from './dto/update-phase.dto';

const logger = createLogger('phases-service');

@Injectable({ scope: Scope.REQUEST })
export class PhasesService {
  private get userId(): string {
    return (this.request as { userId?: string }).userId ?? '';
  }
  private readonly correlationId: string;

  constructor(
    private readonly repo: PhasesRepository,
    @Inject(REQUEST) private readonly request: Request & { userId?: string },
  ) {
    this.correlationId = randomUUID();
  }

  private notFound(): never {
    throw new NotFoundException({
      error: {
        code: 'COS-PHASE-001',
        message: 'Project phase not found',
        messageKey: 'phase.error.notFound',
        traceId: this.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async create(projectId: string, dto: CreatePhaseDto): Promise<PhaseRow> {
    if (!(await this.repo.projectExists(projectId))) {
      throw new NotFoundException({
        error: {
          code: 'COS-PHASE-002',
          message: 'Parent project not found',
          messageKey: 'phase.error.projectNotFound',
          traceId: this.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }
    const phase = await this.repo.create(projectId, dto, this.userId);
    logger.info(
      { project_id: projectId, phase_id: phase.phase_id, correlation_id: this.correlationId },
      'phase.created',
    );
    return phase;
  }

  async findById(phaseId: string): Promise<PhaseRow> {
    const phase = await this.repo.findById(phaseId);
    if (!phase) this.notFound();
    return phase;
  }

  // Ordered by seq (ADR-070). Returns the whole list; the current phase is derived by the consumer.
  list(projectId: string): Promise<PhaseRow[]> {
    return this.repo.listByProject(projectId);
  }

  async update(phaseId: string, dto: UpdatePhaseDto): Promise<PhaseRow> {
    await this.findById(phaseId); // 404 guard
    const updated = await this.repo.update(phaseId, dto);
    logger.info({ phase_id: phaseId, correlation_id: this.correlationId }, 'phase.updated');
    return updated;
  }
}
