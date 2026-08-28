// Buildings Repository — Phase 3 (spatial hierarchy, §10.2 / §11.2).
// All DB access via TenantPrismaService (SET LOCAL app.current_tenant_id per request — ADR-008).
// Parameterized $queryRaw / $executeRaw only — never raw string interpolation (QM-4).

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';
import { clsTenantId } from '../../../shared/context/cls-context';
import type { CreateBuildingDto } from './dto/create-building.dto';
import type { UpdateBuildingDto } from './dto/update-building.dto';
import { decodeCursor, paginate, type CursorListOptions } from '../../../shared/pagination/cursor';
import { projectExistsInTenant } from '../public/parent-existence';

export interface BuildingRow {
  building_id: string;
  project_id: string;
  tenant_id: string;
  building_name: string;
  building_type: string | null;
  total_floors: number | null;
  location: string | null;
  status: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

@Injectable({ scope: Scope.REQUEST })
export class BuildingsRepository {
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

  // Parent existence check (tenant-scoped) — a building must belong to a project in this tenant.
  async projectExists(projectId: string): Promise<boolean> {
    return projectExistsInTenant(this.tenantPrisma, projectId, this.tenantId);
  }

  async create(projectId: string, dto: CreateBuildingDto, createdBy: string): Promise<BuildingRow> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<BuildingRow[]>`
        INSERT INTO projects.buildings (
          project_id, tenant_id, building_name, building_type, total_floors, location, status, created_by
        ) VALUES (
          ${projectId}::uuid, ${this.tenantId}::uuid, ${dto.building_name},
          ${dto.building_type ?? null}, ${dto.total_floors ?? null}::int,
          ${dto.location ?? null}, ${dto.status ?? null}, ${createdBy}::uuid
        )
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async findById(buildingId: string): Promise<BuildingRow | null> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<BuildingRow[]>`
        SELECT * FROM projects.buildings
        WHERE building_id = ${buildingId}::uuid AND tenant_id = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  async list(
    projectId: string,
    opts: CursorListOptions,
  ): Promise<{ items: BuildingRow[]; nextCursor: string | null }> {
    const limit = Math.min(opts.limit, 100);
    const parsed = opts.cursor ? decodeCursor(opts.cursor) : null;

    const items = await this.tenantPrisma.run(async (tx): Promise<BuildingRow[]> => {
      if (parsed) {
        return await tx.$queryRaw<BuildingRow[]>`
          SELECT * FROM projects.buildings
          WHERE tenant_id = ${this.tenantId}::uuid
            AND project_id = ${projectId}::uuid
            AND (created_at, building_id) < (${parsed.createdAt}::timestamptz, ${parsed.id}::uuid)
          ORDER BY created_at DESC, building_id DESC
          LIMIT ${limit + 1}
        `;
      }
      return await tx.$queryRaw<BuildingRow[]>`
        SELECT * FROM projects.buildings
        WHERE tenant_id = ${this.tenantId}::uuid
          AND project_id = ${projectId}::uuid
        ORDER BY created_at DESC, building_id DESC
        LIMIT ${limit + 1}
      `;
    });

    return paginate(
      items,
      limit,
      (r) => r.building_id,
      (r) => r.created_at,
    );
  }

  async update(buildingId: string, dto: UpdateBuildingDto): Promise<BuildingRow> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<BuildingRow[]>`
        UPDATE projects.buildings SET
          building_name = COALESCE(${dto.building_name ?? null}, building_name),
          building_type = COALESCE(${dto.building_type ?? null}, building_type),
          total_floors  = COALESCE(${dto.total_floors ?? null}::int, total_floors),
          location      = COALESCE(${dto.location ?? null}, location),
          status        = COALESCE(${dto.status ?? null}, status),
          updated_at    = now()
        WHERE building_id = ${buildingId}::uuid AND tenant_id = ${this.tenantId}::uuid
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async delete(buildingId: string): Promise<void> {
    await this.tenantPrisma.run(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM projects.buildings
        WHERE building_id = ${buildingId}::uuid AND tenant_id = ${this.tenantId}::uuid
      `;
    });
  }
}
