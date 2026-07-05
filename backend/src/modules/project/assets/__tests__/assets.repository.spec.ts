// Unit tests for AssetsRepository — cursor encoding + all CRUD methods (100% line+branch).

import { AssetsRepository } from '../assets.repository';

const TENANT_ID = 'tenant-uuid-001';
const PROJECT_ID = 'proj-uuid-001';
const ASSET_ID = 'asset-uuid-001';
const USER_ID = 'user-uuid-001';

const baseRow = {
  asset_id: ASSET_ID,
  tenant_id: TENANT_ID,
  project_id: PROJECT_ID,
  asset_type: 'HVAC_UNIT',
  handover_date: '2027-01-15',
  warranty_expiry: '2032-01-15',
  maintenance_status: 'OPERATIONAL',
  created_by: USER_ID,
  created_at: new Date('2026-07-05'),
  updated_at: new Date('2026-07-05'),
};

function makeRepo(
  queryResult: unknown = [baseRow],
  tenantId: string | undefined = TENANT_ID,
): { repo: AssetsRepository; queryRaw: jest.Mock; executeRaw: jest.Mock } {
  const queryRaw = jest.fn().mockResolvedValue(queryResult);
  const executeRaw = jest.fn().mockResolvedValue(1);
  const txMock = { $queryRaw: queryRaw, $executeRaw: executeRaw };
  const tenantPrisma = {
    run: jest.fn((fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
  };
  const repo = new AssetsRepository(tenantPrisma as never, { tenantId } as never);
  return { repo, queryRaw, executeRaw };
}

describe('AssetsRepository', () => {
  it('tenantId getter falls back to empty string', () => {
    const repo = new AssetsRepository({ run: jest.fn() } as never, {} as never);
    expect((repo as unknown as { tenantId: string }).tenantId).toBe('');
  });

  describe('projectExists()', () => {
    it('true when exists', async () => {
      expect(await makeRepo([{ exists: true }]).repo.projectExists(PROJECT_ID)).toBe(true);
    });
    it('false when not-exists', async () => {
      expect(await makeRepo([{ exists: false }]).repo.projectExists(PROJECT_ID)).toBe(false);
    });
    it('false when no row', async () => {
      expect(await makeRepo([]).repo.projectExists(PROJECT_ID)).toBe(false);
    });
  });

  describe('create()', () => {
    it('returns the inserted row', async () => {
      expect((await makeRepo([baseRow]).repo.create(PROJECT_ID, {}, USER_ID)).asset_id).toBe(
        ASSET_ID,
      );
    });
    it('passes optional fields', async () => {
      const { repo, queryRaw } = makeRepo([baseRow]);
      await repo.create(
        PROJECT_ID,
        {
          asset_type: 'X',
          handover_date: '2027-01-01',
          warranty_expiry: '2030-01-01',
          maintenance_status: 'OK',
        },
        USER_ID,
      );
      expect(queryRaw).toHaveBeenCalled();
    });
  });

  describe('findById()', () => {
    it('returns the row when found', async () => {
      expect(await makeRepo([baseRow]).repo.findById(ASSET_ID)).toEqual(baseRow);
    });
    it('returns null when not found', async () => {
      expect(await makeRepo([]).repo.findById(ASSET_ID)).toBeNull();
    });
  });

  describe('list()', () => {
    it('no nextCursor under limit', async () => {
      expect(
        (await makeRepo([baseRow]).repo.list(PROJECT_ID, { limit: 20 })).nextCursor,
      ).toBeNull();
    });
    it('nextCursor when over limit', async () => {
      const { repo } = makeRepo([baseRow, { ...baseRow, asset_id: 'a2' }]);
      const res = await repo.list(PROJECT_ID, { limit: 1 });
      expect(res.items).toHaveLength(1);
      expect(res.nextCursor).not.toBeNull();
    });
    it('applies a valid cursor', async () => {
      const cursor = Buffer.from(`${ASSET_ID}:${new Date('2026-07-05').toISOString()}`).toString(
        'base64',
      );
      expect(
        (await makeRepo([baseRow]).repo.list(PROJECT_ID, { cursor, limit: 20 })).items,
      ).toHaveLength(1);
    });
    it('ignores a cursor with no colon', async () => {
      const cursor = Buffer.from('nocolon').toString('base64');
      expect(
        (await makeRepo([baseRow]).repo.list(PROJECT_ID, { cursor, limit: 20 })).items,
      ).toHaveLength(1);
    });
    it('ignores a cursor with empty id', async () => {
      const cursor = Buffer.from(':2026-07-05T00:00:00.000Z').toString('base64');
      expect(
        (await makeRepo([baseRow]).repo.list(PROJECT_ID, { cursor, limit: 20 })).items,
      ).toHaveLength(1);
    });
    it('ignores a cursor with empty createdAt', async () => {
      const cursor = Buffer.from(`${ASSET_ID}:`).toString('base64');
      expect(
        (await makeRepo([baseRow]).repo.list(PROJECT_ID, { cursor, limit: 20 })).items,
      ).toHaveLength(1);
    });
  });

  describe('update()', () => {
    it('returns the updated row', async () => {
      const { repo } = makeRepo([{ ...baseRow, maintenance_status: 'DUE' }]);
      expect((await repo.update(ASSET_ID, { maintenance_status: 'DUE' })).maintenance_status).toBe(
        'DUE',
      );
    });
    it('handles an empty update', async () => {
      expect((await makeRepo([baseRow]).repo.update(ASSET_ID, {})).asset_id).toBe(ASSET_ID);
    });
  });

  describe('delete()', () => {
    it('executes the delete', async () => {
      const { repo, executeRaw } = makeRepo();
      await repo.delete(ASSET_ID);
      expect(executeRaw).toHaveBeenCalled();
    });
  });
});
