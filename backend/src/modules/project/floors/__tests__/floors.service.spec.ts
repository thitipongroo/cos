// Unit tests for FloorsService (100% line+branch).

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { Test } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { NotFoundException } from '@nestjs/common';
import { FloorsService } from '../floors.service';
import { FloorsRepository } from '../floors.repository';
import type { FloorRow } from '../floors.repository';

const FLOOR_ID = 'floor-uuid-001';
const BUILDING_ID = 'bldg-uuid-001';

const baseRow: FloorRow = {
  floor_id: FLOOR_ID,
  building_id: BUILDING_ID,
  tenant_id: 'tenant-uuid-001',
  floor_number: 5,
  gross_area_sqm: '1250.50',
  created_by: 'user-uuid-001',
  created_at: new Date('2026-07-05'),
  updated_at: new Date('2026-07-05'),
};

function makeRepo(overrides: Partial<FloorsRepository> = {}): FloorsRepository {
  return {
    buildingExists: jest.fn().mockResolvedValue(true),
    create: jest.fn().mockResolvedValue(baseRow),
    findById: jest.fn().mockResolvedValue(baseRow),
    list: jest.fn().mockResolvedValue({ items: [baseRow], nextCursor: null }),
    update: jest.fn().mockResolvedValue(baseRow),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as FloorsRepository;
}

async function build(
  repo: FloorsRepository,
  req: Record<string, unknown> = { userId: 'user-uuid-001' },
): Promise<FloorsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      FloorsService,
      { provide: FloorsRepository, useValue: repo },
      { provide: REQUEST, useValue: req },
    ],
  }).compile();
  return moduleRef.resolve(FloorsService);
}

describe('FloorsService', () => {
  describe('create()', () => {
    it('creates when the parent building exists', async () => {
      const repo = makeRepo();
      const svc = await build(repo);
      expect(await svc.create(BUILDING_ID, { floor_number: 5 })).toEqual(baseRow);
    });
    it('throws COS-FLOR-002 when parent building missing', async () => {
      const repo = makeRepo({ buildingExists: jest.fn().mockResolvedValue(false) });
      const svc = await build(repo);
      await expect(svc.create(BUILDING_ID, { floor_number: 5 })).rejects.toThrow(NotFoundException);
      expect(repo.create).not.toHaveBeenCalled();
    });
    it('uses empty userId when request has none', async () => {
      const repo = makeRepo();
      const svc = await build(repo, {});
      await svc.create(BUILDING_ID, { floor_number: 5 });
      expect(repo.create).toHaveBeenCalledWith(BUILDING_ID, { floor_number: 5 }, '');
    });
  });

  describe('findById()', () => {
    it('returns when found', async () => {
      const svc = await build(makeRepo());
      expect(await svc.findById(FLOOR_ID)).toEqual(baseRow);
    });
    it('throws COS-FLOR-001 when not found', async () => {
      const svc = await build(makeRepo({ findById: jest.fn().mockResolvedValue(null) }));
      await expect(svc.findById(FLOOR_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('list()', () => {
    it('lists with explicit limit', async () => {
      const repo = makeRepo();
      const svc = await build(repo);
      await svc.list(BUILDING_ID, { limit: 10 });
      expect(repo.list).toHaveBeenCalledWith(BUILDING_ID, { cursor: undefined, limit: 10 });
    });
    it('defaults limit to 20', async () => {
      const repo = makeRepo();
      const svc = await build(repo);
      await svc.list(BUILDING_ID, {});
      expect(repo.list).toHaveBeenCalledWith(BUILDING_ID, { cursor: undefined, limit: 20 });
    });
  });

  describe('update()', () => {
    it('updates after guard passes', async () => {
      const repo = makeRepo();
      const svc = await build(repo);
      await svc.update(FLOOR_ID, { floor_number: 9 });
      expect(repo.update).toHaveBeenCalledWith(FLOOR_ID, { floor_number: 9 });
    });
    it('throws when not found', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const svc = await build(repo);
      await expect(svc.update(FLOOR_ID, {})).rejects.toThrow(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('remove()', () => {
    it('deletes after guard passes', async () => {
      const repo = makeRepo();
      const svc = await build(repo);
      await svc.remove(FLOOR_ID);
      expect(repo.delete).toHaveBeenCalledWith(FLOOR_ID);
    });
    it('throws when not found', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const svc = await build(repo);
      await expect(svc.remove(FLOOR_ID)).rejects.toThrow(NotFoundException);
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });
});
