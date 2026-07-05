// Structures Repository — Phase 3 (spatial hierarchy, §10.2). Tenant-scoped via TenantPrismaService.

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';
import type { CreateStructureDto } from './dto/create-structure.dto';
import type { UpdateStructureDto } from './dto/update-structure.dto';

export interface StructureRow {
  structure_id: string;
  building_id: string;
  tenant_id: string;
  structure_type: string;
  material_type: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface ListStructuresOptions {
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
export class StructuresRepository {
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

  async create(
    buildingId: string,
    dto: CreateStructureDto,
    createdBy: string,
  ): Promise<StructureRow> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<StructureRow[]>`
        INSERT INTO projects.structures (building_id, tenant_id, structure_type, material_type, created_by)
        VALUES (
          ${buildingId}::uuid, ${this.tenantId}::uuid, ${dto.structure_type},
          ${dto.material_type ?? null}, ${createdBy}::uuid
        )
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async findById(structureId: string): Promise<StructureRow | null> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<StructureRow[]>`
        SELECT * FROM projects.structures
        WHERE structure_id = ${structureId}::uuid AND tenant_id = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  async list(
    buildingId: string,
    opts: ListStructuresOptions,
  ): Promise<{ items: StructureRow[]; nextCursor: string | null }> {
    const limit = Math.min(opts.limit, 100);
    const parsed = opts.cursor ? decodeCursor(opts.cursor) : null;

    const items = await this.tenantPrisma.run(async (tx): Promise<StructureRow[]> => {
      if (parsed) {
        return await tx.$queryRaw<StructureRow[]>`
          SELECT * FROM projects.structures
          WHERE tenant_id = ${this.tenantId}::uuid
            AND building_id = ${buildingId}::uuid
            AND (created_at, structure_id) < (${parsed.createdAt}::timestamptz, ${parsed.id}::uuid)
          ORDER BY created_at DESC, structure_id DESC
          LIMIT ${limit + 1}
        `;
      }
      return await tx.$queryRaw<StructureRow[]>`
        SELECT * FROM projects.structures
        WHERE tenant_id = ${this.tenantId}::uuid
          AND building_id = ${buildingId}::uuid
        ORDER BY created_at DESC, structure_id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const nextCursor =
      hasMore && page.length > 0
        ? encodeCursor(page[page.length - 1]!.structure_id, page[page.length - 1]!.created_at)
        : null;

    return { items: page, nextCursor };
  }

  async update(structureId: string, dto: UpdateStructureDto): Promise<StructureRow> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<StructureRow[]>`
        UPDATE projects.structures SET
          structure_type = COALESCE(${dto.structure_type ?? null}, structure_type),
          material_type  = COALESCE(${dto.material_type ?? null}, material_type),
          updated_at     = now()
        WHERE structure_id = ${structureId}::uuid AND tenant_id = ${this.tenantId}::uuid
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async delete(structureId: string): Promise<void> {
    await this.tenantPrisma.run(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM projects.structures
        WHERE structure_id = ${structureId}::uuid AND tenant_id = ${this.tenantId}::uuid
      `;
    });
  }
}
