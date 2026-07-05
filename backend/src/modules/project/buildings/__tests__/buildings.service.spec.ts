// Unit tests for BuildingsService — CRUD + parent/not-found branches (100% line+branch).

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { Test } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { NotFoundException } from '@nestjs/common';
import { BuildingsService } from '../buildings.service';
import { BuildingsRepository } from '../buildings.repository';
import type { BuildingRow } from '../buildings.repository';

const BUILDING_ID = 'bldg-uuid-001';
const PROJECT_ID = 'proj-uuid-001';

const baseRow: BuildingRow = {
  building_id: BUILDING_ID,
  project_id: PROJECT_ID,
  tenant_id: 'tenant-uuid-001',
  building_name: 'Tower A',
  building_type: 'RESIDENTIAL',
  total_floors: 30,
  location: null,
  status: null,
  created_by: 'user-uuid-001',
  created_at: new Date('2026-07-05'),
  updated_at: new Date('2026-07-05'),
};

function makeRepo(overrides: Partial<BuildingsRepository> = {}): BuildingsRepository {
  return {
    projectExists: jest.fn().mockResolvedValue(true),
    create: jest.fn().mockResolvedValue(baseRow),
    findById: jest.fn().mockResolvedValue(baseRow),
    list: jest.fn().mockResolvedValue({ items: [baseRow], nextCursor: null }),
    update: jest.fn().mockResolvedValue(baseRow),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as BuildingsRepository;
}

async function build(
  repo: BuildingsRepository,
  req: Record<string, unknown> = { userId: 'user-uuid-001' },
): Promise<BuildingsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      BuildingsService,
      { provide: BuildingsRepository, useValue: repo },
      { provide: REQUEST, useValue: req },
    ],
  }).compile();
  return moduleRef.resolve(BuildingsService);
}

describe('BuildingsService', () => {
  describe('create()', () => {
    it('creates a building when the parent project exists', async () => {
      const repo = makeRepo();
      const svc = await build(repo);
      const res = await svc.create(PROJECT_ID, { building_name: 'Tower A' });
      expect(res).toEqual(baseRow);
      expect(repo.create).toHaveBeenCalledWith(
        PROJECT_ID,
        { building_name: 'Tower A' },
        'user-uuid-001',
      );
    });

    it('throws COS-BLDG-002 when the parent project does not exist', async () => {
      const repo = makeRepo({ projectExists: jest.fn().mockResolvedValue(false) });
      const svc = await build(repo);
      await expect(svc.create(PROJECT_ID, { building_name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('uses empty userId when the request carries none (?? fallback)', async () => {
      const repo = makeRepo();
      const svc = await build(repo, {});
      await svc.create(PROJECT_ID, { building_name: 'X' });
      expect(repo.create).toHaveBeenCalledWith(PROJECT_ID, { building_name: 'X' }, '');
    });
  });

  describe('findById()', () => {
    it('returns the building when found', async () => {
      const svc = await build(makeRepo());
      expect(await svc.findById(BUILDING_ID)).toEqual(baseRow);
    });
    it('throws COS-BLDG-001 when not found', async () => {
      const svc = await build(makeRepo({ findById: jest.fn().mockResolvedValue(null) }));
      await expect(svc.findById(BUILDING_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('list()', () => {
    it('lists with an explicit limit', async () => {
      const repo = makeRepo();
      const svc = await build(repo);
      await svc.list(PROJECT_ID, { limit: 10 });
      expect(repo.list).toHaveBeenCalledWith(PROJECT_ID, { cursor: undefined, limit: 10 });
    });
    it('defaults the limit to 20 when omitted', async () => {
      const repo = makeRepo();
      const svc = await build(repo);
      await svc.list(PROJECT_ID, {});
      expect(repo.list).toHaveBeenCalledWith(PROJECT_ID, { cursor: undefined, limit: 20 });
    });
  });

  describe('update()', () => {
    it('updates after the 404 guard passes', async () => {
      const repo = makeRepo();
      const svc = await build(repo);
      await svc.update(BUILDING_ID, { building_name: 'Renamed' });
      expect(repo.update).toHaveBeenCalledWith(BUILDING_ID, { building_name: 'Renamed' });
    });
    it('throws when the building does not exist', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const svc = await build(repo);
      await expect(svc.update(BUILDING_ID, {})).rejects.toThrow(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('remove()', () => {
    it('deletes after the 404 guard passes', async () => {
      const repo = makeRepo();
      const svc = await build(repo);
      await svc.remove(BUILDING_ID);
      expect(repo.delete).toHaveBeenCalledWith(BUILDING_ID);
    });
    it('throws when the building does not exist', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const svc = await build(repo);
      await expect(svc.remove(BUILDING_ID)).rejects.toThrow(NotFoundException);
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });
});
