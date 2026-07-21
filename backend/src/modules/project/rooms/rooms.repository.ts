// Rooms Repository — Phase 3 (spatial hierarchy, §10.2). Tenant-scoped via TenantPrismaService.

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';
import type { CreateRoomDto } from './dto/create-room.dto';
import type { UpdateRoomDto } from './dto/update-room.dto';
import { decodeCursor, encodeCursor } from '../../../shared/pagination/cursor';

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

export interface ListRoomsOptions {
  cursor?: string;
  limit: number;
}

@Injectable({ scope: Scope.REQUEST })
export class RoomsRepository {
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? '';
  }

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    @Inject(REQUEST) private readonly request: Request & { tenantId?: string },
  ) {}

  async floorExists(floorId: string): Promise<boolean> {
    const rows = await this.tenantPrisma.run(
      async (tx) =>
        await tx.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS(
          SELECT 1 FROM projects.floors
          WHERE floor_id = ${floorId}::uuid AND tenant_id = ${this.tenantId}::uuid
        ) AS exists
      `,
    );
    return rows[0]?.exists ?? false;
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
    opts: ListRoomsOptions,
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

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const nextCursor =
      hasMore && page.length > 0
        ? encodeCursor(page[page.length - 1]!.room_id, page[page.length - 1]!.created_at)
        : null;

    return { items: page, nextCursor };
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
