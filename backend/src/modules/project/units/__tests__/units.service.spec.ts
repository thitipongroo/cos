// Unit tests for UnitsService (100% line+branch).

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { Test } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { NotFoundException } from '@nestjs/common';
import { UnitsService } from '../units.service';
import { UnitsRepository } from '../units.repository';
import type { UnitRow } from '../units.repository';

const UNIT_ID = 'unit-uuid-001';
const BUILDING_ID = 'bldg-uuid-001';
const PROJECT_ID = 'proj-uuid-001';

const baseRow: UnitRow = {
  unit_id: UNIT_ID,
  tenant_id: 'tenant-uuid-001',
  building_id: BUILDING_ID,
  project_id: PROJECT_ID,
  unit_number: 'A-1201',
  unit_type: '2BR',
  status: 'AVAILABLE',
  created_by: 'user-uuid-001',
  created_at: new Date('2026-07-05'),
  updated_at: new Date('2026-07-05'),
};

function makeRepo(overrides: Partial<UnitsRepository> = {}): UnitsRepository {
  return {
    parentProjectOfBuilding: jest.fn().mockResolvedValue(PROJECT_ID),
    create: jest.fn().mockResolvedValue(baseRow),
    findById: jest.fn().mockResolvedValue(baseRow),
    list: jest.fn().mockResolvedValue({ items: [baseRow], nextCursor: null }),
    update: jest.fn().mockResolvedValue(baseRow),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as UnitsRepository;
}

async function build(
  repo: UnitsRepository,
  req: Record<string, unknown> = { userId: 'user-uuid-001' },
): Promise<UnitsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      UnitsService,
      { provide: UnitsRepository, useValue: repo },
      { provide: REQUEST, useValue: req },
    ],
  }).compile();
  return moduleRef.resolve(UnitsService);
}

describe('UnitsService', () => {
  describe('create()', () => {
    it('creates with the project_id derived from the parent building', async () => {
      const repo = makeRepo();
      const svc = await build(repo);
      expect(await svc.create(BUILDING_ID, { unit_number: 'A-1' })).toEqual(baseRow);
      expect(repo.create).toHaveBeenCalledWith(
        BUILDING_ID,
        PROJECT_ID,
        { unit_number: 'A-1' },
        'user-uuid-001',
      );
    });
    it('throws COS-UNIT-002 when parent building missing', async () => {
      const repo = makeRepo({ parentProjectOfBuilding: jest.fn().mockResolvedValue(null) });
      const svc = await build(repo);
      await expect(svc.create(BUILDING_ID, { unit_number: 'A-1' })).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.create).not.toHaveBeenCalled();
    });
    it('uses empty userId when request has none', async () => {
      const repo = makeRepo();
      const svc = await build(repo, {});
      await svc.create(BUILDING_ID, { unit_number: 'A-1' });
      expect(repo.create).toHaveBeenCalledWith(BUILDING_ID, PROJECT_ID, { unit_number: 'A-1' }, '');
    });
  });

  describe('findById()', () => {
    it('returns when found', async () => {
      expect(await (await build(makeRepo())).findById(UNIT_ID)).toEqual(baseRow);
    });
    it('throws COS-UNIT-001 when not found', async () => {
      const svc = await build(makeRepo({ findById: jest.fn().mockResolvedValue(null) }));
      await expect(svc.findById(UNIT_ID)).rejects.toThrow(NotFoundException);
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
      await (await build(repo)).update(UNIT_ID, { status: 'SOLD' });
      expect(repo.update).toHaveBeenCalledWith(UNIT_ID, { status: 'SOLD' });
    });
    it('throws when not found', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const svc = await build(repo);
      await expect(svc.update(UNIT_ID, {})).rejects.toThrow(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('remove()', () => {
    it('deletes after guard passes', async () => {
      const repo = makeRepo();
      await (await build(repo)).remove(UNIT_ID);
      expect(repo.delete).toHaveBeenCalledWith(UNIT_ID);
    });
    it('throws when not found', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const svc = await build(repo);
      await expect(svc.remove(UNIT_ID)).rejects.toThrow(NotFoundException);
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });
});
