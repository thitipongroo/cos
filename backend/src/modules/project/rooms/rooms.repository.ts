// Rooms Repository — Phase 3 (spatial hierarchy, §10.2). Tenant-scoped via TenantPrismaService.

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';
import { clsTenantId } from '../../../shared/context/cls-context';
import type { CreateRoomDto } from './dto/create-room.dto';
import type { UpdateRoomDto } from './dto/update-room.dto';
import { decodeCursor, paginate, type CursorListOptions } from '../../../shared/pagination/cursor';
import { floorExistsInTenant } from '../shared/parent-existence';

export interface RoomRow {
  room_id: string;
  floor_id: string;
  tenant_id: string;
  room_number: string;
  room_type: string | null;
  area_sqm: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

@Injectable({ scope: Scope.REQUEST })
export class RoomsRepository {
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

  async floorExists(floorId: string): Promise<boolean> {
    return floorExistsInTenant(this.tenantPrisma, floorId, this.tenantId);
  }

  async create(floorId: string, dto: CreateRoomDto, createdBy: string): Promise<RoomRow> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<RoomRow[]>`
        INSERT INTO projects.rooms (floor_id, tenant_id, room_number, room_type, area_sqm, created_by)
        VALUES (
          ${floorId}::uuid, ${this.tenantId}::uuid, ${dto.room_number},
          ${dto.room_type ?? null}, ${dto.area_sqm ?? null}::decimal, ${createdBy}::uuid
        )
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async findById(roomId: string): Promise<RoomRow | null> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<RoomRow[]>`
        SELECT * FROM projects.rooms
        WHERE room_id = ${roomId}::uuid AND tenant_id = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  async list(
    floorId: string,
    opts: CursorListOptions,
  ): Promise<{ items: RoomRow[]; nextCursor: string | null }> {
    const limit = Math.min(opts.limit, 100);
    const parsed = opts.cursor ? decodeCursor(opts.cursor) : null;

    const items = await this.tenantPrisma.run(async (tx): Promise<RoomRow[]> => {
      if (parsed) {
        return await tx.$queryRaw<RoomRow[]>`
          SELECT * FROM projects.rooms
          WHERE tenant_id = ${this.tenantId}::uuid
            AND floor_id = ${floorId}::uuid
            AND (created_at, room_id) < (${parsed.createdAt}::timestamptz, ${parsed.id}::uuid)
          ORDER BY created_at DESC, room_id DESC
          LIMIT ${limit + 1}
        `;
      }
      return await tx.$queryRaw<RoomRow[]>`
        SELECT * FROM projects.rooms
        WHERE tenant_id = ${this.tenantId}::uuid
          AND floor_id = ${floorId}::uuid
        ORDER BY created_at DESC, room_id DESC
        LIMIT ${limit + 1}
      `;
    });

    return paginate(
      items,
      limit,
      (r) => r.room_id,
      (r) => r.created_at,
    );
  }

  async update(roomId: string, dto: UpdateRoomDto): Promise<RoomRow> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<RoomRow[]>`
        UPDATE projects.rooms SET
          room_number = COALESCE(${dto.room_number ?? null}, room_number),
          room_type   = COALESCE(${dto.room_type ?? null}, room_type),
          area_sqm    = COALESCE(${dto.area_sqm ?? null}::decimal, area_sqm),
          updated_at  = now()
        WHERE room_id = ${roomId}::uuid AND tenant_id = ${this.tenantId}::uuid
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async delete(roomId: string): Promise<void> {
    await this.tenantPrisma.run(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM projects.rooms
        WHERE room_id = ${roomId}::uuid AND tenant_id = ${this.tenantId}::uuid
      `;
    });
  }
}
