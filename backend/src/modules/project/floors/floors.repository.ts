// Floors Repository — Phase 3 (spatial hierarchy, §10.2). Tenant-scoped via TenantPrismaService.
// Parameterized $queryRaw / $executeRaw only (QM-4).

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';
import { clsTenantId } from '../../../shared/context/cls-context';
import type { CreateFloorDto } from './dto/create-floor.dto';
import type { UpdateFloorDto } from './dto/update-floor.dto';
import { decodeCursor, paginate, type CursorListOptions } from '../../../shared/pagination/cursor';
import { buildingExistsInTenant } from '../shared/parent-existence';

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

@Injectable({ scope: Scope.REQUEST })
export class FloorsRepository {
  // CLS fallback is load-bearing, not cosmetic: under Fastify the REQUEST injected into a
  // Scope.REQUEST provider is not guaranteed to be the object the auth layer decorated. The auth
  // guards publish tenant_id into CLS (the same source TenantPrismaService reads for RLS), so this
  // resolves even when the request copy does not carry it.
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? clsTenantId();
  }

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    @Inject(REQUEST) private readonly request: Request & { tenantId?: string },
  ) {}

  async buildingExists(buildingId: string): Promise<boolean> {
    return buildingExistsInTenant(this.tenantPrisma, buildingId, this.tenantId);
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
    opts: CursorListOptions,
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

    return paginate(
      items,
      limit,
      (r) => r.floor_id,
      (r) => r.created_at,
    );
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
