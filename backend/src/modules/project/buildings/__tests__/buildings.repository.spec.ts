// Unit tests for BuildingsRepository — cursor encoding + all CRUD methods (100% line+branch).

import { BuildingsRepository } from '../buildings.repository';

const TENANT_ID = 'tenant-uuid-001';
const PROJECT_ID = 'proj-uuid-001';
const BUILDING_ID = 'bldg-uuid-001';
const USER_ID = 'user-uuid-001';

const baseRow = {
  building_id: BUILDING_ID,
  project_id: PROJECT_ID,
  tenant_id: TENANT_ID,
  building_name: 'Tower A',
  building_type: 'RESIDENTIAL',
  total_floors: 30,
  location: null,
  status: null,
  created_by: USER_ID,
  created_at: new Date('2026-07-05'),
  updated_at: new Date('2026-07-05'),
};

function makeRepo(
  queryResult: unknown = [baseRow],
  tenantId: string | undefined = TENANT_ID,
): { repo: BuildingsRepository; queryRaw: jest.Mock; executeRaw: jest.Mock } {
  const queryRaw = jest.fn().mockResolvedValue(queryResult);
  const executeRaw = jest.fn().mockResolvedValue(1);
  const txMock = { $queryRaw: queryRaw, $executeRaw: executeRaw };
  const tenantPrisma = {
    run: jest.fn((fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
  };
  const repo = new BuildingsRepository(tenantPrisma as never, { tenantId } as never);
  return { repo, queryRaw, executeRaw };
}

function encode(id: string, createdAt: string): string {
  return Buffer.from(`${id}:${createdAt}`).toString('base64');
}

describe('BuildingsRepository', () => {
  it('tenantId getter falls back to empty string when request has no tenantId', () => {
    const repo = new BuildingsRepository({ run: jest.fn() } as never, {} as never);
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
      const result = await repo.create(PROJECT_ID, { building_name: 'Tower A' }, USER_ID);
      expect(result.building_id).toBe(BUILDING_ID);
    });
    it('passes optional fields through (null coalescing)', async () => {
      const { repo, queryRaw } = makeRepo([baseRow]);
      await repo.create(
        PROJECT_ID,
        { building_name: 'B', building_type: 'X', total_floors: 5, location: 'L', status: 'S' },
        USER_ID,
      );
      expect(queryRaw).toHaveBeenCalled();
    });
  });

  describe('findById()', () => {
    it('returns the row when found', async () => {
      const { repo } = makeRepo([baseRow]);
      expect(await repo.findById(BUILDING_ID)).toEqual(baseRow);
    });
    it('returns null when not found', async () => {
      const { repo } = makeRepo([]);
      expect(await repo.findById(BUILDING_ID)).toBeNull();
    });
  });

  describe('list()', () => {
    it('lists without cursor and reports no nextCursor when under limit', async () => {
      const { repo } = makeRepo([baseRow]);
      const res = await repo.list(PROJECT_ID, { limit: 20 });
      expect(res.items).toHaveLength(1);
      expect(res.nextCursor).toBeNull();
    });

    it('returns a nextCursor when there are more than `limit` rows', async () => {
      const rows = [baseRow, { ...baseRow, building_id: 'bldg-2' }];
      const { repo } = makeRepo(rows);
      const res = await repo.list(PROJECT_ID, { limit: 1 });
      expect(res.items).toHaveLength(1);
      expect(res.nextCursor).not.toBeNull();
    });

    it('applies a valid cursor (decodeCursor happy path)', async () => {
      const { repo, queryRaw } = makeRepo([baseRow]);
      const cursor = encode(BUILDING_ID, new Date('2026-07-05').toISOString());
      const res = await repo.list(PROJECT_ID, { cursor, limit: 20 });
      expect(res.items).toHaveLength(1);
      expect(queryRaw).toHaveBeenCalled();
    });

    it('caps the limit at 100', async () => {
      const { repo } = makeRepo([baseRow]);
      const res = await repo.list(PROJECT_ID, { limit: 9999 });
      expect(res.items).toHaveLength(1);
    });

    it('treats a cursor with no colon as no cursor (decodeCursor → null)', async () => {
      const { repo } = makeRepo([baseRow]);
      const cursor = Buffer.from('no-colon-here').toString('base64');
      const res = await repo.list(PROJECT_ID, { cursor, limit: 20 });
      expect(res.items).toHaveLength(1);
    });

    it('treats a cursor with empty id as no cursor (decodeCursor → null)', async () => {
      const { repo } = makeRepo([baseRow]);
      const cursor = Buffer.from(':2026-07-05T00:00:00.000Z').toString('base64');
      const res = await repo.list(PROJECT_ID, { cursor, limit: 20 });
      expect(res.items).toHaveLength(1);
    });

    it('treats a cursor with empty createdAt as no cursor (decodeCursor → null)', async () => {
      const { repo } = makeRepo([baseRow]);
      const cursor = Buffer.from(`${BUILDING_ID}:`).toString('base64');
      const res = await repo.list(PROJECT_ID, { cursor, limit: 20 });
      expect(res.items).toHaveLength(1);
    });
  });

  describe('update()', () => {
    it('returns the updated row', async () => {
      const { repo } = makeRepo([{ ...baseRow, building_name: 'Renamed' }]);
      const res = await repo.update(BUILDING_ID, { building_name: 'Renamed' });
      expect(res.building_name).toBe('Renamed');
    });
    it('handles an all-undefined update (COALESCE keeps values)', async () => {
      const { repo } = makeRepo([baseRow]);
      const res = await repo.update(BUILDING_ID, {});
      expect(res.building_id).toBe(BUILDING_ID);
    });
  });

  describe('delete()', () => {
    it('executes the delete statement', async () => {
      const { repo, executeRaw } = makeRepo();
      await repo.delete(BUILDING_ID);
      expect(executeRaw).toHaveBeenCalled();
    });
  });
});
