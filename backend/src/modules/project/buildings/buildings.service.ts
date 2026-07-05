// Buildings Service — Phase 3 (spatial hierarchy).
// Full CRUD, tenant-scoped. No Kafka events (backing/reference data — PO decision 2026-07-05).
// Error structure follows QM-10.

import { Injectable, Scope, Inject, NotFoundException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { createLogger } from '@cos/logger';
import { BuildingsRepository } from './buildings.repository';
import type { BuildingRow } from './buildings.repository';
import type { CreateBuildingDto } from './dto/create-building.dto';
import type { UpdateBuildingDto } from './dto/update-building.dto';
import type { ListBuildingsDto } from './dto/list-buildings.dto';

const logger = createLogger('buildings-service');

@Injectable({ scope: Scope.REQUEST })
export class BuildingsService {
  private get userId(): string {
    return (this.request as { userId?: string }).userId ?? '';
  }
  private readonly correlationId: string;

  constructor(
    private readonly repo: BuildingsRepository,
    @Inject(REQUEST) private readonly request: Request & { userId?: string },
  ) {
    this.correlationId = randomUUID();
  }

  private notFound(): never {
    throw new NotFoundException({
      error: {
        code: 'COS-BLDG-001',
        message: 'Building not found',
        messageKey: 'building.error.notFound',
        traceId: this.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async create(projectId: string, dto: CreateBuildingDto): Promise<BuildingRow> {
    if (!(await this.repo.projectExists(projectId))) {
      throw new NotFoundException({
        error: {
          code: 'COS-BLDG-002',
          message: 'Parent project not found',
          messageKey: 'building.error.projectNotFound',
          traceId: this.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }
    const building = await this.repo.create(projectId, dto, this.userId);
    logger.info(
      {
        project_id: projectId,
        building_id: building.building_id,
        correlation_id: this.correlationId,
      },
      'building.created',
    );
    return building;
  }

  async findById(buildingId: string): Promise<BuildingRow> {
    const building = await this.repo.findById(buildingId);
    if (!building) this.notFound();
    return building;
  }

  list(
    projectId: string,
    dto: ListBuildingsDto,
  ): Promise<{ items: BuildingRow[]; nextCursor: string | null }> {
    const limit = Math.min(Number(dto.limit) || 20, 100);
    return this.repo.list(projectId, { cursor: dto.cursor, limit });
  }

  async update(buildingId: string, dto: UpdateBuildingDto): Promise<BuildingRow> {
    await this.findById(buildingId); // 404 guard
    return this.repo.update(buildingId, dto);
  }

  async remove(buildingId: string): Promise<void> {
    await this.findById(buildingId); // 404 guard
    await this.repo.delete(buildingId);
    logger.info(
      { building_id: buildingId, correlation_id: this.correlationId },
      'building.deleted',
    );
  }
}
