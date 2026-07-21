// Assets Repository — Phase 3 (§11.2 asset/handover domain). Tenant-scoped via TenantPrismaService.

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';
import type { CreateAssetDto } from './dto/create-asset.dto';
import type { UpdateAssetDto } from './dto/update-asset.dto';
import { decodeCursor, encodeCursor } from '../../../shared/pagination/cursor';

export interface AssetRow {
  asset_id: string;
  tenant_id: string;
  project_id: string;
  asset_type: string | null;
  handover_date: string | null;
  warranty_expiry: string | null;
  maintenance_status: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface ListAssetsOptions {
  cursor?: string;
  limit: number;
}

@Injectable({ scope: Scope.REQUEST })
export class AssetsRepository {
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? '';
  }

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    @Inject(REQUEST) private readonly request: Request & { tenantId?: string },
  ) {}

  async projectExists(projectId: string): Promise<boolean> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS(
          SELECT 1 FROM projects.projects
          WHERE project_id = ${projectId}::uuid AND tenant_id = ${this.tenantId}::uuid
        ) AS exists
      `,
    );
    return rows[0]?.exists ?? false;
  }

  async create(projectId: string, dto: CreateAssetDto, createdBy: string): Promise<AssetRow> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<AssetRow[]>`
        INSERT INTO projects.assets (
          tenant_id, project_id, asset_type, handover_date, warranty_expiry, maintenance_status, created_by
        ) VALUES (
          ${this.tenantId}::uuid, ${projectId}::uuid, ${dto.asset_type ?? null},
          ${dto.handover_date ?? null}::date, ${dto.warranty_expiry ?? null}::date,
          ${dto.maintenance_status ?? null}, ${createdBy}::uuid
        )
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async findById(assetId: string): Promise<AssetRow | null> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<AssetRow[]>`
        SELECT * FROM projects.assets
        WHERE asset_id = ${assetId}::uuid AND tenant_id = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  async list(
    projectId: string,
    opts: ListAssetsOptions,
  ): Promise<{ items: AssetRow[]; nextCursor: string | null }> {
    const limit = Math.min(opts.limit, 100);
    const parsed = opts.cursor ? decodeCursor(opts.cursor) : null;

    const items = await this.tenantPrisma.run(async (tx): Promise<AssetRow[]> => {
      if (parsed) {
        return await tx.$queryRaw<AssetRow[]>`
          SELECT * FROM projects.assets
          WHERE tenant_id = ${this.tenantId}::uuid
            AND project_id = ${projectId}::uuid
            AND (created_at, asset_id) < (${parsed.createdAt}::timestamptz, ${parsed.id}::uuid)
          ORDER BY created_at DESC, asset_id DESC
          LIMIT ${limit + 1}
        `;
      }
      return await tx.$queryRaw<AssetRow[]>`
        SELECT * FROM projects.assets
        WHERE tenant_id = ${this.tenantId}::uuid
          AND project_id = ${projectId}::uuid
        ORDER BY created_at DESC, asset_id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const nextCursor =
      hasMore && page.length > 0
        ? encodeCursor(page[page.length - 1]!.asset_id, page[page.length - 1]!.created_at)
        : null;

    return { items: page, nextCursor };
  }

  async update(assetId: string, dto: UpdateAssetDto): Promise<AssetRow> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<AssetRow[]>`
        UPDATE projects.assets SET
          asset_type         = COALESCE(${dto.asset_type ?? null}, asset_type),
          handover_date      = COALESCE(${dto.handover_date ?? null}::date, handover_date),
          warranty_expiry    = COALESCE(${dto.warranty_expiry ?? null}::date, warranty_expiry),
          maintenance_status = COALESCE(${dto.maintenance_status ?? null}, maintenance_status),
          updated_at         = now()
        WHERE asset_id = ${assetId}::uuid AND tenant_id = ${this.tenantId}::uuid
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async delete(assetId: string): Promise<void> {
    await this.tenantPrisma.run(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM projects.assets
        WHERE asset_id = ${assetId}::uuid AND tenant_id = ${this.tenantId}::uuid
      `;
    });
  }
}
