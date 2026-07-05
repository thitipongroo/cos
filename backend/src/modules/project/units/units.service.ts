// Units Service — Phase 3 (§11.2). Full CRUD, tenant-scoped. No Kafka events (PO decision 2026-07-05).
// project_id is derived from the parent building on create.

import { Injectable, Scope, Inject, NotFoundException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { createLogger } from '@cos/logger';
import { UnitsRepository } from './units.repository';
import type { UnitRow } from './units.repository';
import type { CreateUnitDto } from './dto/create-unit.dto';
import type { UpdateUnitDto } from './dto/update-unit.dto';
import type { ListUnitsDto } from './dto/list-units.dto';

const logger = createLogger('units-service');

@Injectable({ scope: Scope.REQUEST })
export class UnitsService {
  private get userId(): string {
    return (this.request as { userId?: string }).userId ?? '';
  }
  private readonly correlationId: string;

  constructor(
    private readonly repo: UnitsRepository,
    @Inject(REQUEST) private readonly request: Request & { userId?: string },
  ) {
    this.correlationId = randomUUID();
  }

  private notFound(): never {
    throw new NotFoundException({
      error: {
        code: 'COS-UNIT-001',
        message: 'Unit not found',
        messageKey: 'unit.error.notFound',
        traceId: this.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async create(buildingId: string, dto: CreateUnitDto): Promise<UnitRow> {
    const projectId = await this.repo.parentProjectOfBuilding(buildingId);
    if (!projectId) {
      throw new NotFoundException({
        error: {
          code: 'COS-UNIT-002',
          message: 'Parent building not found',
          messageKey: 'unit.error.buildingNotFound',
          traceId: this.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }
    const unit = await this.repo.create(buildingId, projectId, dto, this.userId);
    logger.info(
      { building_id: buildingId, unit_id: unit.unit_id, correlation_id: this.correlationId },
      'unit.created',
    );
    return unit;
  }

  async findById(unitId: string): Promise<UnitRow> {
    const unit = await this.repo.findById(unitId);
    if (!unit) this.notFound();
    return unit;
  }

  list(
    buildingId: string,
    dto: ListUnitsDto,
  ): Promise<{ items: UnitRow[]; nextCursor: string | null }> {
    const limit = Math.min(Number(dto.limit) || 20, 100);
    return this.repo.list(buildingId, { cursor: dto.cursor, limit });
  }

  async update(unitId: string, dto: UpdateUnitDto): Promise<UnitRow> {
    await this.findById(unitId); // 404 guard
    return this.repo.update(unitId, dto);
  }

  async remove(unitId: string): Promise<void> {
    await this.findById(unitId); // 404 guard
    await this.repo.delete(unitId);
    logger.info({ unit_id: unitId, correlation_id: this.correlationId }, 'unit.deleted');
  }
}
