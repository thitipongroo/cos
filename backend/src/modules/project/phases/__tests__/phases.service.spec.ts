// Unit tests for PhasesService — CRUD + parent/not-found branches (100% line+branch).

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { Test } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { NotFoundException } from '@nestjs/common';
import { PhasesService } from '../phases.service';
import { PhasesRepository } from '../phases.repository';
import type { PhaseRow } from '../phases.repository';

const PHASE_ID = 'phase-uuid-001';
const PROJECT_ID = 'proj-uuid-001';

const baseRow: PhaseRow = {
  phase_id: PHASE_ID,
  project_id: PROJECT_ID,
  tenant_id: 'tenant-uuid-001',
  seq: 2,
  name: 'Structure',
  status: 'IN_PROGRESS',
  planned_start: '2026-04-15',
  planned_end: '2026-08-31',
  actual_start: '2026-04-20',
  actual_end: null,
  created_by: 'user-uuid-001',
  created_at: new Date('2026-07-25'),
  updated_at: new Date('2026-07-25'),
};

function makeRepo(overrides: Partial<PhasesRepository> = {}): PhasesRepository {
  return {
    projectExists: jest.fn().mockResolvedValue(true),
    create: jest.fn().mockResolvedValue(baseRow),
    findById: jest.fn().mockResolvedValue(baseRow),
    listByProject: jest.fn().mockResolvedValue([baseRow]),
    update: jest.fn().mockResolvedValue(baseRow),
    ...overrides,
  } as unknown as PhasesRepository;
}

async function build(
  repo: PhasesRepository,
  req: Record<string, unknown> = { userId: 'user-uuid-001' },
): Promise<PhasesService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PhasesService,
      { provide: PhasesRepository, useValue: repo },
      { provide: REQUEST, useValue: req },
    ],
  }).compile();
  return moduleRef.resolve(PhasesService);
}

describe('PhasesService', () => {
  describe('create()', () => {
    it('creates a phase when the parent project exists', async () => {
      const repo = makeRepo();
      const svc = await build(repo);
      const res = await svc.create(PROJECT_ID, { seq: 2, name: 'Structure' });
      expect(res).toEqual(baseRow);
      expect(repo.create).toHaveBeenCalledWith(
        PROJECT_ID,
        { seq: 2, name: 'Structure' },
        'user-uuid-001',
      );
    });

    it('throws COS-PHASE-002 when the parent project does not exist', async () => {
      const repo = makeRepo({ projectExists: jest.fn().mockResolvedValue(false) });
      const svc = await build(repo);
      await expect(svc.create(PROJECT_ID, { seq: 1, name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('uses empty userId when the request carries none (?? fallback)', async () => {
      const repo = makeRepo();
      const svc = await build(repo, {});
      await svc.create(PROJECT_ID, { seq: 1, name: 'X' });
      expect(repo.create).toHaveBeenCalledWith(PROJECT_ID, { seq: 1, name: 'X' }, '');
    });
  });

  describe('findById()', () => {
    it('returns the phase when found', async () => {
      const svc = await build(makeRepo());
      expect(await svc.findById(PHASE_ID)).toEqual(baseRow);
    });
    it('throws COS-PHASE-001 when not found', async () => {
      const svc = await build(makeRepo({ findById: jest.fn().mockResolvedValue(null) }));
      await expect(svc.findById(PHASE_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('list()', () => {
    it('returns the repository list (ordered by seq)', async () => {
      const repo = makeRepo();
      const svc = await build(repo);
      expect(await svc.list(PROJECT_ID)).toEqual([baseRow]);
      expect(repo.listByProject).toHaveBeenCalledWith(PROJECT_ID);
    });
  });

  describe('update()', () => {
    it('updates after the 404 guard passes', async () => {
      const repo = makeRepo();
      const svc = await build(repo);
      await svc.update(PHASE_ID, { status: 'COMPLETED' as never });
      expect(repo.update).toHaveBeenCalledWith(PHASE_ID, { status: 'COMPLETED' });
    });
    it('throws when the phase does not exist', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const svc = await build(repo);
      await expect(svc.update(PHASE_ID, {})).rejects.toThrow(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });
});
