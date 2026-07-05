// Unit tests for StructuresService (100% line+branch).

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { Test } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { NotFoundException } from '@nestjs/common';
import { StructuresService } from '../structures.service';
import { StructuresRepository } from '../structures.repository';
import type { StructureRow } from '../structures.repository';
import { StructureType } from '../dto/create-structure.dto';

const STRUCTURE_ID = 'strc-uuid-001';
const BUILDING_ID = 'bldg-uuid-001';

const baseRow: StructureRow = {
  structure_id: STRUCTURE_ID,
  building_id: BUILDING_ID,
  tenant_id: 'tenant-uuid-001',
  structure_type: 'column',
  material_type: 'Reinforced concrete',
  created_by: 'user-uuid-001',
  created_at: new Date('2026-07-05'),
  updated_at: new Date('2026-07-05'),
};

function makeRepo(overrides: Partial<StructuresRepository> = {}): StructuresRepository {
  return {
    buildingExists: jest.fn().mockResolvedValue(true),
    create: jest.fn().mockResolvedValue(baseRow),
    findById: jest.fn().mockResolvedValue(baseRow),
    list: jest.fn().mockResolvedValue({ items: [baseRow], nextCursor: null }),
    update: jest.fn().mockResolvedValue(baseRow),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as StructuresRepository;
}

async function build(
  repo: StructuresRepository,
  req: Record<string, unknown> = { userId: 'user-uuid-001' },
): Promise<StructuresService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      StructuresService,
      { provide: StructuresRepository, useValue: repo },
      { provide: REQUEST, useValue: req },
    ],
  }).compile();
  return moduleRef.resolve(StructuresService);
}

describe('StructuresService', () => {
  describe('create()', () => {
    it('creates when parent building exists', async () => {
      const svc = await build(makeRepo());
      expect(await svc.create(BUILDING_ID, { structure_type: StructureType.COLUMN })).toEqual(
        baseRow,
      );
    });
    it('throws COS-STRC-002 when building missing', async () => {
      const repo = makeRepo({ buildingExists: jest.fn().mockResolvedValue(false) });
      const svc = await build(repo);
      await expect(svc.create(BUILDING_ID, { structure_type: StructureType.BEAM })).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.create).not.toHaveBeenCalled();
    });
    it('uses empty userId when request has none', async () => {
      const repo = makeRepo();
      const svc = await build(repo, {});
      await svc.create(BUILDING_ID, { structure_type: StructureType.SLAB });
      expect(repo.create).toHaveBeenCalledWith(BUILDING_ID, { structure_type: 'slab' }, '');
    });
  });

  describe('findById()', () => {
    it('returns when found', async () => {
      expect(await (await build(makeRepo())).findById(STRUCTURE_ID)).toEqual(baseRow);
    });
    it('throws COS-STRC-001 when not found', async () => {
      const svc = await build(makeRepo({ findById: jest.fn().mockResolvedValue(null) }));
      await expect(svc.findById(STRUCTURE_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('list()', () => {
    it('lists with explicit limit', async () => {
      const repo = makeRepo();
      await (await build(repo)).list(BUILDING_ID, { limit: 10 });
      expect(repo.list).toHaveBeenCalledWith(BUILDING_ID, { cursor: undefined, limit: 10 });
    });
    it('defaults limit to 20', async () => {
      const repo = makeRepo();
      await (await build(repo)).list(BUILDING_ID, {});
      expect(repo.list).toHaveBeenCalledWith(BUILDING_ID, { cursor: undefined, limit: 20 });
    });
  });

  describe('update()', () => {
    it('updates after guard passes', async () => {
      const repo = makeRepo();
      await (await build(repo)).update(STRUCTURE_ID, { material_type: 'Steel' });
      expect(repo.update).toHaveBeenCalledWith(STRUCTURE_ID, { material_type: 'Steel' });
    });
    it('throws when not found', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const svc = await build(repo);
      await expect(svc.update(STRUCTURE_ID, {})).rejects.toThrow(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('remove()', () => {
    it('deletes after guard passes', async () => {
      const repo = makeRepo();
      await (await build(repo)).remove(STRUCTURE_ID);
      expect(repo.delete).toHaveBeenCalledWith(STRUCTURE_ID);
    });
    it('throws when not found', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const svc = await build(repo);
      await expect(svc.remove(STRUCTURE_ID)).rejects.toThrow(NotFoundException);
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });
});
