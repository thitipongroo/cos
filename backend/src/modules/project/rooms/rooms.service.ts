// Rooms Service — Phase 3. Full CRUD, tenant-scoped. No Kafka events (PO decision 2026-07-05).

import { Injectable, Scope, Inject, NotFoundException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { createLogger } from '@cos/logger';
import { RoomsRepository } from './rooms.repository';
import type { RoomRow } from './rooms.repository';
import type { CreateRoomDto } from './dto/create-room.dto';
import type { UpdateRoomDto } from './dto/update-room.dto';
import type { ListRoomsDto } from './dto/list-rooms.dto';

const logger = createLogger('rooms-service');

@Injectable({ scope: Scope.REQUEST })
export class RoomsService {
  private get userId(): string {
    return (this.request as { userId?: string }).userId ?? '';
  }
  private readonly correlationId: string;

  constructor(
    private readonly repo: RoomsRepository,
    @Inject(REQUEST) private readonly request: Request & { userId?: string },
  ) {
    this.correlationId = randomUUID();
  }

  private notFound(): never {
    throw new NotFoundException({
      error: {
        code: 'COS-ROOM-001',
        message: 'Room not found',
        messageKey: 'room.error.notFound',
        traceId: this.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  async create(floorId: string, dto: CreateRoomDto): Promise<RoomRow> {
    if (!(await this.repo.floorExists(floorId))) {
      throw new NotFoundException({
        error: {
          code: 'COS-ROOM-002',
          message: 'Parent floor not found',
          messageKey: 'room.error.floorNotFound',
          traceId: this.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }
    const room = await this.repo.create(floorId, dto, this.userId);
    logger.info(
      { floor_id: floorId, room_id: room.room_id, correlation_id: this.correlationId },
      'room.created',
    );
    return room;
  }

  async findById(roomId: string): Promise<RoomRow> {
    const room = await this.repo.findById(roomId);
    if (!room) this.notFound();
    return room;
  }

  list(
    floorId: string,
    dto: ListRoomsDto,
  ): Promise<{ items: RoomRow[]; nextCursor: string | null }> {
    const limit = Math.min(Number(dto.limit) || 20, 100);
    return this.repo.list(floorId, { cursor: dto.cursor, limit });
  }

  async update(roomId: string, dto: UpdateRoomDto): Promise<RoomRow> {
    await this.findById(roomId); // 404 guard
    return this.repo.update(roomId, dto);
  }

  async remove(roomId: string): Promise<void> {
    await this.findById(roomId); // 404 guard
    await this.repo.delete(roomId);
    logger.info({ room_id: roomId, correlation_id: this.correlationId }, 'room.deleted');
  }
}
