// Structures Service — Phase 3. Full CRUD, tenant-scoped. No Kafka events (PO decision 2026-07-05).

import { Injectable, Scope, Inject, NotFoundException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { createLogger } from '@cos/logger';
import { StructuresRepository } from './structures.repository';
import type { StructureRow } from './structures.repository';
import type { CreateStructureDto } from './dto/create-structure.dto';
import type { UpdateStructureDto } from './dto/update-structure.dto';
import type { ListStructuresDto } from './dto/list-structures.dto';

const logger = createLogger('structures-service');

@Injectable({ scope: Scope.REQUEST })
export class StructuresService {
  private get userId(): string {
    return (this.request as { userId?: string }).userId ?? '';
  }
  private readonly correlationId: string;

  constructor(
    private readonly repo: StructuresRepository,
    @Inject(REQUEST) private readonly request: Request & { userId?: string },
  ) {
    this.correlationId = randomUUID();
  }

  private notFound(): never {
    throw new NotFoundException({
      error: {
        code: 'COS-STRC-001',
        message: 'Structure not found',
        messageKey: 'structure.error.notFound',
        traceId: this.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async create(buildingId: string, dto: CreateStructureDto): Promise<StructureRow> {
    if (!(await this.repo.buildingExists(buildingId))) {
      throw new NotFoundException({
        error: {
          code: 'COS-STRC-002',
          message: 'Parent building not found',
          messageKey: 'structure.error.buildingNotFound',
          traceId: this.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }
    const structure = await this.repo.create(buildingId, dto, this.userId);
    logger.info(
      {
        building_id: buildingId,
        structure_id: structure.structure_id,
        correlation_id: this.correlationId,
      },
      'structure.created',
    );
    return structure;
  }

  async findById(structureId: string): Promise<StructureRow> {
    const structure = await this.repo.findById(structureId);
    if (!structure) this.notFound();
    return structure;
  }

  list(
    buildingId: string,
    dto: ListStructuresDto,
  ): Promise<{ items: StructureRow[]; nextCursor: string | null }> {
    const limit = Math.min(Number(dto.limit) || 20, 100);
    return this.repo.list(buildingId, { cursor: dto.cursor, limit });
  }

  async update(structureId: string, dto: UpdateStructureDto): Promise<StructureRow> {
    await this.findById(structureId); // 404 guard
    return this.repo.update(structureId, dto);
  }

  async remove(structureId: string): Promise<void> {
    await this.findById(structureId); // 404 guard
    await this.repo.delete(structureId);
    logger.info(
      { structure_id: structureId, correlation_id: this.correlationId },
      'structure.deleted',
    );
  }
}
