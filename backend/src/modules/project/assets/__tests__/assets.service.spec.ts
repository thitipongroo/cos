// Unit tests for AssetsService (100% line+branch).

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { Test } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { NotFoundException } from '@nestjs/common';
import { AssetsService } from '../assets.service';
import { AssetsRepository } from '../assets.repository';
import type { AssetRow } from '../assets.repository';

const ASSET_ID = 'asset-uuid-001';
const PROJECT_ID = 'proj-uuid-001';

const baseRow: AssetRow = {
  asset_id: ASSET_ID,
  tenant_id: 'tenant-uuid-001',
  project_id: PROJECT_ID,
  asset_type: 'HVAC_UNIT',
  handover_date: '2027-01-15',
  warranty_expiry: '2032-01-15',
  maintenance_status: 'OPERATIONAL',
  created_by: 'user-uuid-001',
  created_at: new Date('2026-07-05'),
  updated_at: new Date('2026-07-05'),
};

function makeRepo(overrides: Partial<AssetsRepository> = {}): AssetsRepository {
  return {
    projectExists: jest.fn().mockResolvedValue(true),
    create: jest.fn().mockResolvedValue(baseRow),
    findById: jest.fn().mockResolvedValue(baseRow),
    list: jest.fn().mockResolvedValue({ items: [baseRow], nextCursor: null }),
    update: jest.fn().mockResolvedValue(baseRow),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as AssetsRepository;
}

async function build(
  repo: AssetsRepository,
  req: Record<string, unknown> = { userId: 'user-uuid-001' },
): Promise<AssetsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      AssetsService,
      { provide: AssetsRepository, useValue: repo },
      { provide: REQUEST, useValue: req },
    ],
  }).compile();
  return moduleRef.resolve(AssetsService);
}

describe('AssetsService', () => {
  describe('create()', () => {
    it('creates when parent project exists', async () => {
      expect(await (await build(makeRepo())).create(PROJECT_ID, {})).toEqual(baseRow);
    });
    it('throws COS-ASST-002 when project missing', async () => {
      const repo = makeRepo({ projectExists: jest.fn().mockResolvedValue(false) });
      const svc = await build(repo);
      await expect(svc.create(PROJECT_ID, {})).rejects.toThrow(NotFoundException);
      expect(repo.create).not.toHaveBeenCalled();
    });
    it('uses empty userId when request has none', async () => {
      const repo = makeRepo();
      const svc = await build(repo, {});
      await svc.create(PROJECT_ID, {});
      expect(repo.create).toHaveBeenCalledWith(PROJECT_ID, {}, '');
    });
  });

  describe('findById()', () => {
    it('returns when found', async () => {
      expect(await (await build(makeRepo())).findById(ASSET_ID)).toEqual(baseRow);
    });
    it('throws COS-ASST-001 when not found', async () => {
      const svc = await build(makeRepo({ findById: jest.fn().mockResolvedValue(null) }));
      await expect(svc.findById(ASSET_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('list()', () => {
    it('lists with explicit limit', async () => {
      const repo = makeRepo();
      await (await build(repo)).list(PROJECT_ID, { limit: 10 });
      expect(repo.list).toHaveBeenCalledWith(PROJECT_ID, { cursor: undefined, limit: 10 });
    });
    it('defaults limit to 20', async () => {
      const repo = makeRepo();
      await (await build(repo)).list(PROJECT_ID, {});
      expect(repo.list).toHaveBeenCalledWith(PROJECT_ID, { cursor: undefined, limit: 20 });
    });
  });

  describe('update()', () => {
    it('updates after guard passes', async () => {
      const repo = makeRepo();
      await (await build(repo)).update(ASSET_ID, { maintenance_status: 'DUE' });
      expect(repo.update).toHaveBeenCalledWith(ASSET_ID, { maintenance_status: 'DUE' });
    });
    it('throws when not found', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const svc = await build(repo);
      await expect(svc.update(ASSET_ID, {})).rejects.toThrow(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('remove()', () => {
    it('deletes after guard passes', async () => {
      const repo = makeRepo();
      await (await build(repo)).remove(ASSET_ID);
      expect(repo.delete).toHaveBeenCalledWith(ASSET_ID);
    });
    it('throws when not found', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const svc = await build(repo);
      await expect(svc.remove(ASSET_ID)).rejects.toThrow(NotFoundException);
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });
});
