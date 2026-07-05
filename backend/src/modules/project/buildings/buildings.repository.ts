// Buildings Repository — Phase 3 (spatial hierarchy, §10.2 / §11.2).
// All DB access via TenantPrismaService (SET LOCAL app.current_tenant_id per request — ADR-008).
// Parameterized $queryRaw / $executeRaw only — never raw string interpolation (QM-4).

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';
import type { CreateBuildingDto } from './dto/create-building.dto';
import type { UpdateBuildingDto } from './dto/update-building.dto';

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

export interface ListBuildingsOptions {
  cursor?: string; // encoded: base64(building_id:created_at)
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
export class BuildingsRepository {
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? '';
  }

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    @Inject(REQUEST) private readonly request: Request & { tenantId?: string },
  ) {}

  // Parent existence check (tenant-scoped) — a building must belong to a project in this tenant.
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
    opts: ListBuildingsOptions,
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

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const nextCursor =
      hasMore && page.length > 0
        ? encodeCursor(page[page.length - 1]!.building_id, page[page.length - 1]!.created_at)
        : null;

    return { items: page, nextCursor };
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
