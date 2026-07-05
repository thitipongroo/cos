// Floors Repository — Phase 3 (spatial hierarchy, §10.2). Tenant-scoped via TenantPrismaService.
// Parameterized $queryRaw / $executeRaw only (QM-4).

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';
import type { CreateFloorDto } from './dto/create-floor.dto';
import type { UpdateFloorDto } from './dto/update-floor.dto';

export interface FloorRow {
  floor_id: string;
  building_id: string;
  tenant_id: string;
  floor_number: number;
  gross_area_sqm: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface ListFloorsOptions {
  cursor?: string;
  limit: number;
}

function encodeCursor(id: string, createdAt: Date): string {
  return Buffer.from(`${id}:${createdAt.toISOString()}`).toString('base64');
}

function decodeCursor(cursor: string): { id: string; createdAt: string } | null {
  const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
  const colonIdx = decoded.indexOf(':');
  if (colonIdx === -1) return null;
  const id = decoded.slice(0, colonIdx);
  const createdAt = decoded.slice(colonIdx + 1);
  if (!id || !createdAt) return null;
  return { id, createdAt };
}

@Injectable({ scope: Scope.REQUEST })
export class FloorsRepository {
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? '';
  }

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    @Inject(REQUEST) private readonly request: Request & { tenantId?: string },
  ) {}

  async buildingExists(buildingId: string): Promise<boolean> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS(
          SELECT 1 FROM projects.buildings
          WHERE building_id = ${buildingId}::uuid AND tenant_id = ${this.tenantId}::uuid
        ) AS exists
      `,
    );
    return rows[0]?.exists ?? false;
  }

  async create(buildingId: string, dto: CreateFloorDto, createdBy: string): Promise<FloorRow> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<FloorRow[]>`
        INSERT INTO projects.floors (building_id, tenant_id, floor_number, gross_area_sqm, created_by)
        VALUES (
          ${buildingId}::uuid, ${this.tenantId}::uuid, ${dto.floor_number}::int,
          ${dto.gross_area_sqm ?? null}::decimal, ${createdBy}::uuid
        )
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async findById(floorId: string): Promise<FloorRow | null> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<FloorRow[]>`
        SELECT * FROM projects.floors
        WHERE floor_id = ${floorId}::uuid AND tenant_id = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  async list(
    buildingId: string,
    opts: ListFloorsOptions,
  ): Promise<{ items: FloorRow[]; nextCursor: string | null }> {
    const limit = Math.min(opts.limit, 100);
    const parsed = opts.cursor ? decodeCursor(opts.cursor) : null;

    const items = await this.tenantPrisma.run(async (tx): Promise<FloorRow[]> => {
      if (parsed) {
        return await tx.$queryRaw<FloorRow[]>`
          SELECT * FROM projects.floors
          WHERE tenant_id = ${this.tenantId}::uuid
            AND building_id = ${buildingId}::uuid
            AND (created_at, floor_id) < (${parsed.createdAt}::timestamptz, ${parsed.id}::uuid)
          ORDER BY created_at DESC, floor_id DESC
          LIMIT ${limit + 1}
        `;
      }
      return await tx.$queryRaw<FloorRow[]>`
        SELECT * FROM projects.floors
        WHERE tenant_id = ${this.tenantId}::uuid
          AND building_id = ${buildingId}::uuid
        ORDER BY created_at DESC, floor_id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const nextCursor =
      hasMore && page.length > 0
        ? encodeCursor(page[page.length - 1]!.floor_id, page[page.length - 1]!.created_at)
        : null;

    return { items: page, nextCursor };
  }

  async update(floorId: string, dto: UpdateFloorDto): Promise<FloorRow> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<FloorRow[]>`
        UPDATE projects.floors SET
          floor_number   = COALESCE(${dto.floor_number ?? null}::int, floor_number),
          gross_area_sqm = COALESCE(${dto.gross_area_sqm ?? null}::decimal, gross_area_sqm),
          updated_at     = now()
        WHERE floor_id = ${floorId}::uuid AND tenant_id = ${this.tenantId}::uuid
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async delete(floorId: string): Promise<void> {
    await this.tenantPrisma.run(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM projects.floors
        WHERE floor_id = ${floorId}::uuid AND tenant_id = ${this.tenantId}::uuid
      `;
    });
  }
}
