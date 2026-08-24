// Unit tests for RisksRepository — projectExists + CRUD + all four list-filter branches (100%).

import { RisksRepository } from '../risks.repository';
import type { RiskRow } from '../risks.repository';

const TENANT_ID = 'tenant-uuid-001';
const PROJECT_ID = 'proj-uuid-001';
const RISK_ID = 'risk-uuid-001';
const USER_ID = 'user-uuid-001';

const baseRow: RiskRow = {
  risk_id: RISK_ID,
  project_id: PROJECT_ID,
  tenant_id: TENANT_ID,
  title: 'Ground water ingress',
  description: null,
  category: 'TECHNICAL',
  likelihood: 3,
  impact: 4,
  risk_score: 12,
  mitigation: null,
  owner: null,
  status: 'OPEN',
  source: 'MANUAL',
  created_by: USER_ID,
  created_at: new Date('2026-07-25'),
  updated_at: new Date('2026-07-25'),
};

function makeRepo(
  queryResult: unknown = [baseRow],
  tenantId: string | undefined = TENANT_ID,
): { repo: RisksRepository; queryRaw: jest.Mock } {
  const queryRaw = jest.fn().mockResolvedValue(queryResult);
  const txMock = { $queryRaw: queryRaw };
  const tenantPrisma = {
    run: jest.fn((fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
  };
  const repo = new RisksRepository(tenantPrisma as never, { tenantId } as never);
  return { repo, queryRaw };
}

describe('RisksRepository', () => {
  it('tenantId getter falls back to empty string when request has no tenantId', () => {
    const repo = new RisksRepository({ run: jest.fn() } as never, {} as never);
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
      const res = await repo.create(
        PROJECT_ID,
        { title: 'X', category: 'SAFETY' as never, likelihood: 3, impact: 4 },
        USER_ID,
      );
      expect(res.risk_id).toBe(RISK_ID);
    });
    it('passes optional fields through (null-coalescing value branches)', async () => {
      const { repo, queryRaw } = makeRepo([baseRow]);
      await repo.create(
        PROJECT_ID,
        {
          title: 'X',
          category: 'SAFETY' as never,
          likelihood: 2,
          impact: 2,
          description: 'd',
          mitigation: 'm',
          owner: 'owner-uuid',
        },
        USER_ID,
      );
      expect(queryRaw).toHaveBeenCalled();
    });
    it('accepts an explicit source (AI_SUGGESTED feed path)', async () => {
      const { repo, queryRaw } = makeRepo([{ ...baseRow, source: 'AI_SUGGESTED' }]);
      const res = await repo.create(
        PROJECT_ID,
        { title: 'X', category: 'SCHEDULE' as never, likelihood: 4, impact: 4 },
        USER_ID,
        'AI_SUGGESTED',
      );
      expect(res.source).toBe('AI_SUGGESTED');
      expect(queryRaw).toHaveBeenCalled();
    });
  });

  describe('findById()', () => {
    it('returns the row when found', async () => {
      const { repo } = makeRepo([baseRow]);
      expect(await repo.findById(RISK_ID)).toEqual(baseRow);
    });
    it('returns null when not found', async () => {
      const { repo } = makeRepo([]);
      expect(await repo.findById(RISK_ID)).toBeNull();
    });
  });

  describe('list() — four filter branches', () => {
    it('filters by status AND category', async () => {
      const { repo, queryRaw } = makeRepo([baseRow]);
      const rows = await repo.list(PROJECT_ID, { status: 'OPEN', category: 'TECHNICAL' });
      expect(rows).toHaveLength(1);
      expect(queryRaw).toHaveBeenCalled();
    });
    it('filters by status only', async () => {
      const { repo } = makeRepo([baseRow]);
      expect(await repo.list(PROJECT_ID, { status: 'OPEN' })).toHaveLength(1);
    });
    it('filters by category only', async () => {
      const { repo } = makeRepo([baseRow]);
      expect(await repo.list(PROJECT_ID, { category: 'TECHNICAL' })).toHaveLength(1);
    });
    it('lists all when no filter', async () => {
      const { repo } = makeRepo([baseRow]);
      expect(await repo.list(PROJECT_ID, {})).toHaveLength(1);
    });
  });

  describe('update()', () => {
    it('returns the updated row (value branches)', async () => {
      const { repo } = makeRepo([{ ...baseRow, title: 'Renamed' }]);
      const res = await repo.update(RISK_ID, {
        title: 'Renamed',
        description: 'd',
        category: 'SAFETY' as never,
        likelihood: 5,
        impact: 5,
        mitigation: 'm',
        owner: 'owner-uuid',
      });
      expect(res.title).toBe('Renamed');
    });
    it('handles an all-undefined update (COALESCE null branches)', async () => {
      const { repo } = makeRepo([baseRow]);
      expect((await repo.update(RISK_ID, {})).risk_id).toBe(RISK_ID);
    });
  });

  describe('updateStatus()', () => {
    it('returns the row with the new status', async () => {
      const { repo } = makeRepo([{ ...baseRow, status: 'MITIGATING' }]);
      expect((await repo.updateStatus(RISK_ID, 'MITIGATING')).status).toBe('MITIGATING');
    });
  });
});
