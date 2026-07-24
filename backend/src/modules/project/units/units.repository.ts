// Units Repository — Phase 3 (§11.2). Tenant-scoped via TenantPrismaService.
// A unit belongs to a building; its project_id is derived from the parent building
// (a unit's project is always its building's project).

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';
import type { CreateUnitDto } from './dto/create-unit.dto';
import type { UpdateUnitDto } from './dto/update-unit.dto';
import { decodeCursor, paginate, type CursorListOptions } from '../../../shared/pagination/cursor';

export interface UnitRow {
  unit_id: string;
  tenant_id: string;
  building_id: string;
  project_id: string;
  unit_number: string;
  unit_type: string | null;
  status: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

@Injectable({ scope: Scope.REQUEST })
export class UnitsRepository {
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? '';
  }

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    @Inject(REQUEST) private readonly request: Request & { tenantId?: string },
  ) {}

  // Returns the parent building's project_id (tenant-scoped), or null when the building
  // does not exist in this tenant.
  async parentProjectOfBuilding(buildingId: string): Promise<string | null> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<Array<{ project_id: string }>>`
        SELECT project_id FROM projects.buildings
        WHERE building_id = ${buildingId}::uuid AND tenant_id = ${this.tenantId}::uuid
      `,
    );
    return rows[0]?.project_id ?? null;
  }

  async create(
    buildingId: string,
    projectId: string,
    dto: CreateUnitDto,
    createdBy: string,
  ): Promise<UnitRow> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<UnitRow[]>`
        INSERT INTO projects.units (
          tenant_id, building_id, project_id, unit_number, unit_type, status, created_by
        ) VALUES (
          ${this.tenantId}::uuid, ${buildingId}::uuid, ${projectId}::uuid, ${dto.unit_number},
          ${dto.unit_type ?? null}, ${dto.status ?? null}, ${createdBy}::uuid
        )
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async findById(unitId: string): Promise<UnitRow | null> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<UnitRow[]>`
        SELECT * FROM projects.units
        WHERE unit_id = ${unitId}::uuid AND tenant_id = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  async list(
    buildingId: string,
    opts: CursorListOptions,
  ): Promise<{ items: UnitRow[]; nextCursor: string | null }> {
    const limit = Math.min(opts.limit, 100);
    const parsed = opts.cursor ? decodeCursor(opts.cursor) : null;

    const items = await this.tenantPrisma.run(async (tx): Promise<UnitRow[]> => {
      if (parsed) {
        return await tx.$queryRaw<UnitRow[]>`
          SELECT * FROM projects.units
          WHERE tenant_id = ${this.tenantId}::uuid
            AND building_id = ${buildingId}::uuid
            AND (created_at, unit_id) < (${parsed.createdAt}::timestamptz, ${parsed.id}::uuid)
          ORDER BY created_at DESC, unit_id DESC
          LIMIT ${limit + 1}
        `;
      }
      return await tx.$queryRaw<UnitRow[]>`
        SELECT * FROM projects.units
        WHERE tenant_id = ${this.tenantId}::uuid
          AND building_id = ${buildingId}::uuid
        ORDER BY created_at DESC, unit_id DESC
        LIMIT ${limit + 1}
      `;
    });

    return paginate(
      items,
      limit,
      (r) => r.unit_id,
      (r) => r.created_at,
    );
  }

  async update(unitId: string, dto: UpdateUnitDto): Promise<UnitRow> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<UnitRow[]>`
        UPDATE projects.units SET
          unit_number = COALESCE(${dto.unit_number ?? null}, unit_number),
          unit_type   = COALESCE(${dto.unit_type ?? null}, unit_type),
          status      = COALESCE(${dto.status ?? null}, status),
          updated_at  = now()
        WHERE unit_id = ${unitId}::uuid AND tenant_id = ${this.tenantId}::uuid
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async delete(unitId: string): Promise<void> {
    await this.tenantPrisma.run(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM projects.units
        WHERE unit_id = ${unitId}::uuid AND tenant_id = ${this.tenantId}::uuid
      `;
    });
  }
}
