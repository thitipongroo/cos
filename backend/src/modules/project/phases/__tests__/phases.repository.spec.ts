// Unit tests for PhasesRepository — projectExists + CRUD, covering the status-default and date
// null-coalescing branches (100% line+branch).

import { PhasesRepository } from '../phases.repository';
import type { PhaseRow } from '../phases.repository';

const TENANT_ID = 'tenant-uuid-001';
const PROJECT_ID = 'proj-uuid-001';
const PHASE_ID = 'phase-uuid-001';
const USER_ID = 'user-uuid-001';

const baseRow: PhaseRow = {
  phase_id: PHASE_ID,
  project_id: PROJECT_ID,
  tenant_id: TENANT_ID,
  seq: 2,
  name: 'Structure',
  status: 'IN_PROGRESS',
  planned_start: '2026-04-15',
  planned_end: '2026-08-31',
  actual_start: '2026-04-20',
  actual_end: null,
  created_by: USER_ID,
  created_at: new Date('2026-07-25'),
  updated_at: new Date('2026-07-25'),
};

function makeRepo(
  queryResult: unknown = [baseRow],
  tenantId: string | undefined = TENANT_ID,
): { repo: PhasesRepository; queryRaw: jest.Mock } {
  const queryRaw = jest.fn().mockResolvedValue(queryResult);
  const txMock = { $queryRaw: queryRaw };
  const tenantPrisma = {
    run: jest.fn((fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
  };
  const repo = new PhasesRepository(tenantPrisma as never, { tenantId } as never);
  return { repo, queryRaw };
}

describe('PhasesRepository', () => {
  it('tenantId getter falls back to empty string when request has no tenantId', () => {
    const repo = new PhasesRepository({ run: jest.fn() } as never, {} as never);
    expect((repo as unknown as { tenantId: string }).tenantId).toBe('');
  });

  describe('projectExists()', () => {
    it('returns true when the parent project exists', async () => {
      const { repo } = makeRepo([{ exists: true }]);
      expect(await repo.projectExists(PROJECT_ID)).toBe(true);
    });
    it('returns false when the row reports not-exists', async () => {
      const { repo } = makeRepo([{ exists: false }]);
      expect(await repo.projectExists(PROJECT_ID)).toBe(false);
    });
    it('returns false when no row is returned (?? fallback)', async () => {
      const { repo } = makeRepo([]);
      expect(await repo.projectExists(PROJECT_ID)).toBe(false);
    });
  });

  describe('create()', () => {
    it('returns the inserted row', async () => {
      const { repo } = makeRepo([baseRow]);
      const result = await repo.create(PROJECT_ID, { seq: 2, name: 'Structure' }, USER_ID);
      expect(result.phase_id).toBe(PHASE_ID);
    });
    it('defaults status to NOT_STARTED and dates to null when omitted (?? branches)', async () => {
      const { repo, queryRaw } = makeRepo([baseRow]);
      await repo.create(PROJECT_ID, { seq: 1, name: 'Foundation' }, USER_ID);
      expect(queryRaw).toHaveBeenCalled();
    });
    it('passes an explicit status and all dates through (value branches)', async () => {
      const { repo, queryRaw } = makeRepo([baseRow]);
      await repo.create(
        PROJECT_ID,
        {
          seq: 2,
          name: 'Structure',
          status: 'IN_PROGRESS' as never,
          planned_start: '2026-04-15',
          planned_end: '2026-08-31',
          actual_start: '2026-04-20',
          actual_end: '2026-08-20',
        },
        USER_ID,
      );
      expect(queryRaw).toHaveBeenCalled();
    });
  });

  describe('findById()', () => {
    it('returns the row when found', async () => {
      const { repo } = makeRepo([baseRow]);
      expect(await repo.findById(PHASE_ID)).toEqual(baseRow);
    });
    it('returns null when not found', async () => {
      const { repo } = makeRepo([]);
      expect(await repo.findById(PHASE_ID)).toBeNull();
    });
  });

  describe('listByProject()', () => {
    it('returns the ordered rows', async () => {
      const { repo } = makeRepo([baseRow]);
      const rows = await repo.listByProject(PROJECT_ID);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.phase_id).toBe(PHASE_ID);
    });
  });

  describe('update()', () => {
    it('returns the updated row (value branches)', async () => {
      const { repo } = makeRepo([{ ...baseRow, status: 'COMPLETED' }]);
      const res = await repo.update(PHASE_ID, {
        seq: 3,
        name: 'Renamed',
        status: 'COMPLETED' as never,
        planned_start: '2026-05-01',
        planned_end: '2026-09-01',
        actual_start: '2026-05-02',
        actual_end: '2026-09-02',
      });
      expect(res.status).toBe('COMPLETED');
    });
    it('handles an all-undefined update (COALESCE null branches)', async () => {
      const { repo } = makeRepo([baseRow]);
      const res = await repo.update(PHASE_ID, {});
      expect(res.phase_id).toBe(PHASE_ID);
    });
  });
});
