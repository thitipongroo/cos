// Unit tests for RoomsService (100% line+branch).

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { Test } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { NotFoundException } from '@nestjs/common';
import { RoomsService } from '../rooms.service';
import { RoomsRepository } from '../rooms.repository';
import type { RoomRow } from '../rooms.repository';

const ROOM_ID = 'room-uuid-001';
const FLOOR_ID = 'floor-uuid-001';

const baseRow: RoomRow = {
  room_id: ROOM_ID,
  floor_id: FLOOR_ID,
  tenant_id: 'tenant-uuid-001',
  room_number: '12-A',
  room_type: 'BEDROOM',
  area_sqm: '24.50',
  created_by: 'user-uuid-001',
  created_at: new Date('2026-07-05'),
  updated_at: new Date('2026-07-05'),
};

function makeRepo(overrides: Partial<RoomsRepository> = {}): RoomsRepository {
  return {
    floorExists: jest.fn().mockResolvedValue(true),
    create: jest.fn().mockResolvedValue(baseRow),
    findById: jest.fn().mockResolvedValue(baseRow),
    list: jest.fn().mockResolvedValue({ items: [baseRow], nextCursor: null }),
    update: jest.fn().mockResolvedValue(baseRow),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as RoomsRepository;
}

async function build(
  repo: RoomsRepository,
  req: Record<string, unknown> = { userId: 'user-uuid-001' },
): Promise<RoomsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      RoomsService,
      { provide: RoomsRepository, useValue: repo },
      { provide: REQUEST, useValue: req },
    ],
  }).compile();
  return moduleRef.resolve(RoomsService);
}

describe('RoomsService', () => {
  describe('create()', () => {
    it('creates when parent floor exists', async () => {
      const svc = await build(makeRepo());
      expect(await svc.create(FLOOR_ID, { room_number: '1' })).toEqual(baseRow);
    });
    it('throws COS-ROOM-002 when floor missing', async () => {
      const repo = makeRepo({ floorExists: jest.fn().mockResolvedValue(false) });
      const svc = await build(repo);
      await expect(svc.create(FLOOR_ID, { room_number: '1' })).rejects.toThrow(NotFoundException);
      expect(repo.create).not.toHaveBeenCalled();
    });
    it('uses empty userId when request has none', async () => {
      const repo = makeRepo();
      const svc = await build(repo, {});
      await svc.create(FLOOR_ID, { room_number: '1' });
      expect(repo.create).toHaveBeenCalledWith(FLOOR_ID, { room_number: '1' }, '');
    });
  });

  describe('findById()', () => {
    it('returns when found', async () => {
      expect(await (await build(makeRepo())).findById(ROOM_ID)).toEqual(baseRow);
    });
    it('throws COS-ROOM-001 when not found', async () => {
      const svc = await build(makeRepo({ findById: jest.fn().mockResolvedValue(null) }));
      await expect(svc.findById(ROOM_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('list()', () => {
    it('lists with explicit limit', async () => {
      const repo = makeRepo();
      await (await build(repo)).list(FLOOR_ID, { limit: 10 });
      expect(repo.list).toHaveBeenCalledWith(FLOOR_ID, { cursor: undefined, limit: 10 });
    });
    it('defaults limit to 20', async () => {
      const repo = makeRepo();
      await (await build(repo)).list(FLOOR_ID, {});
      expect(repo.list).toHaveBeenCalledWith(FLOOR_ID, { cursor: undefined, limit: 20 });
    });
  });

  describe('update()', () => {
    it('updates after guard passes', async () => {
      const repo = makeRepo();
      await (await build(repo)).update(ROOM_ID, { room_number: '2' });
      expect(repo.update).toHaveBeenCalledWith(ROOM_ID, { room_number: '2' });
    });
    it('throws when not found', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const svc = await build(repo);
      await expect(svc.update(ROOM_ID, {})).rejects.toThrow(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('remove()', () => {
    it('deletes after guard passes', async () => {
      const repo = makeRepo();
      await (await build(repo)).remove(ROOM_ID);
      expect(repo.delete).toHaveBeenCalledWith(ROOM_ID);
    });
    it('throws when not found', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const svc = await build(repo);
      await expect(svc.remove(ROOM_ID)).rejects.toThrow(NotFoundException);
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });
});
