// Assets Service — Phase 3 (§11.2). Full CRUD, tenant-scoped. No Kafka events (PO decision 2026-07-05).

import { Injectable, Scope, Inject, NotFoundException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { createLogger } from '@cos/logger';
import { AssetsRepository } from './assets.repository';
import type { AssetRow } from './assets.repository';
import type { CreateAssetDto } from './dto/create-asset.dto';
import type { UpdateAssetDto } from './dto/update-asset.dto';
import type { ListAssetsDto } from './dto/list-assets.dto';

const logger = createLogger('assets-service');

@Injectable({ scope: Scope.REQUEST })
export class AssetsService {
  private get userId(): string {
    return (this.request as { userId?: string }).userId ?? '';
  }
  private readonly correlationId: string;

  constructor(
    private readonly repo: AssetsRepository,
    @Inject(REQUEST) private readonly request: Request & { userId?: string },
  ) {
    this.correlationId = randomUUID();
  }

  private notFound(): never {
    throw new NotFoundException({
      error: {
        code: 'COS-ASST-001',
        message: 'Asset not found',
        messageKey: 'asset.error.notFound',
        traceId: this.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async create(projectId: string, dto: CreateAssetDto): Promise<AssetRow> {
    if (!(await this.repo.projectExists(projectId))) {
      throw new NotFoundException({
        error: {
          code: 'COS-ASST-002',
          message: 'Parent project not found',
          messageKey: 'asset.error.projectNotFound',
          traceId: this.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }
    const asset = await this.repo.create(projectId, dto, this.userId);
    logger.info(
      { project_id: projectId, asset_id: asset.asset_id, correlation_id: this.correlationId },
      'asset.created',
    );
    return asset;
  }

  async findById(assetId: string): Promise<AssetRow> {
    const asset = await this.repo.findById(assetId);
    if (!asset) this.notFound();
    return asset;
  }

  list(
    projectId: string,
    dto: ListAssetsDto,
  ): Promise<{ items: AssetRow[]; nextCursor: string | null }> {
    const limit = Math.min(Number(dto.limit) || 20, 100);
    return this.repo.list(projectId, { cursor: dto.cursor, limit });
  }

  async update(assetId: string, dto: UpdateAssetDto): Promise<AssetRow> {
    await this.findById(assetId); // 404 guard
    return this.repo.update(assetId, dto);
  }

  async remove(assetId: string): Promise<void> {
    await this.findById(assetId); // 404 guard
    await this.repo.delete(assetId);
    logger.info({ asset_id: assetId, correlation_id: this.correlationId }, 'asset.deleted');
  }
}
