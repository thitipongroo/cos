// Floors Service — Phase 3. Full CRUD, tenant-scoped. No Kafka events (PO decision 2026-07-05).

import { Injectable, Scope, Inject, NotFoundException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { createLogger } from '@cos/logger';
import { FloorsRepository } from './floors.repository';
import type { FloorRow } from './floors.repository';
import type { CreateFloorDto } from './dto/create-floor.dto';
import type { UpdateFloorDto } from './dto/update-floor.dto';
import type { ListFloorsDto } from './dto/list-floors.dto';

const logger = createLogger('floors-service');

@Injectable({ scope: Scope.REQUEST })
export class FloorsService {
  private get userId(): string {
    return (this.request as { userId?: string }).userId ?? '';
  }
  private readonly correlationId: string;

  constructor(
    private readonly repo: FloorsRepository,
    @Inject(REQUEST) private readonly request: Request & { userId?: string },
  ) {
    this.correlationId = randomUUID();
  }

  private notFound(): never {
    throw new NotFoundException({
      error: {
        code: 'COS-FLOR-001',
        message: 'Floor not found',
        messageKey: 'floor.error.notFound',
        traceId: this.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async create(buildingId: string, dto: CreateFloorDto): Promise<FloorRow> {
    if (!(await this.repo.buildingExists(buildingId))) {
      throw new NotFoundException({
        error: {
          code: 'COS-FLOR-002',
          message: 'Parent building not found',
          messageKey: 'floor.error.buildingNotFound',
          traceId: this.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }
    const floor = await this.repo.create(buildingId, dto, this.userId);
    logger.info(
      { building_id: buildingId, floor_id: floor.floor_id, correlation_id: this.correlationId },
      'floor.created',
    );
    return floor;
  }

  async findById(floorId: string): Promise<FloorRow> {
    const floor = await this.repo.findById(floorId);
    if (!floor) this.notFound();
    return floor;
  }

  list(
    buildingId: string,
    dto: ListFloorsDto,
  ): Promise<{ items: FloorRow[]; nextCursor: string | null }> {
    const limit = Math.min(Number(dto.limit) || 20, 100);
    return this.repo.list(buildingId, { cursor: dto.cursor, limit });
  }

  async update(floorId: string, dto: UpdateFloorDto): Promise<FloorRow> {
    await this.findById(floorId); // 404 guard
    return this.repo.update(floorId, dto);
  }

  async remove(floorId: string): Promise<void> {
    await this.findById(floorId); // 404 guard
    await this.repo.delete(floorId);
    logger.info({ floor_id: floorId, correlation_id: this.correlationId }, 'floor.deleted');
  }
}
