// Unit tests for FloorsRepository — cursor encoding + all CRUD methods (100% line+branch).

import { FloorsRepository } from '../floors.repository';

const TENANT_ID = 'tenant-uuid-001';
const BUILDING_ID = 'bldg-uuid-001';
const FLOOR_ID = 'floor-uuid-001';
const USER_ID = 'user-uuid-001';

const baseRow = {
  floor_id: FLOOR_ID,
  building_id: BUILDING_ID,
  tenant_id: TENANT_ID,
  floor_number: 5,
  gross_area_sqm: '1250.50',
  created_by: USER_ID,
  created_at: new Date('2026-07-05'),
  updated_at: new Date('2026-07-05'),
};

function makeRepo(
  queryResult: unknown = [baseRow],
  tenantId: string | undefined = TENANT_ID,
): { repo: FloorsRepository; queryRaw: jest.Mock; executeRaw: jest.Mock } {
  const queryRaw = jest.fn().mockResolvedValue(queryResult);
  const executeRaw = jest.fn().mockResolvedValue(1);
  const txMock = { $queryRaw: queryRaw, $executeRaw: executeRaw };
  const tenantPrisma = {
    run: jest.fn((fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
  };
  const repo = new FloorsRepository(tenantPrisma as never, { tenantId } as never);
  return { repo, queryRaw, executeRaw };
}

describe('FloorsRepository', () => {
  it('tenantId getter falls back to empty string', () => {
    const repo = new FloorsRepository({ run: jest.fn() } as never, {} as never);
    expect((repo as unknown as { tenantId: string }).tenantId).toBe('');
  });

  describe('buildingExists()', () => {
    it('returns true when the parent building exists', async () => {
      const { repo } = makeRepo([{ exists: true }]);
      expect(await repo.buildingExists(BUILDING_ID)).toBe(true);
    });
    it('returns false when reported not-exists', async () => {
      const { repo } = makeRepo([{ exists: false }]);
      expect(await repo.buildingExists(BUILDING_ID)).toBe(false);
    });
    it('returns false when no row (?? fallback)', async () => {
      const { repo } = makeRepo([]);
      expect(await repo.buildingExists(BUILDING_ID)).toBe(false);
    });
  });

  describe('create()', () => {
    it('returns the inserted row', async () => {
      const { repo } = makeRepo([baseRow]);
      const res = await repo.create(BUILDING_ID, { floor_number: 5 }, USER_ID);
      expect(res.floor_id).toBe(FLOOR_ID);
    });
    it('passes gross_area_sqm through', async () => {
      const { repo, queryRaw } = makeRepo([baseRow]);
      await repo.create(BUILDING_ID, { floor_number: 5, gross_area_sqm: '10.00' }, USER_ID);
      expect(queryRaw).toHaveBeenCalled();
    });
  });

  describe('findById()', () => {
    it('returns the row when found', async () => {
      const { repo } = makeRepo([baseRow]);
      expect(await repo.findById(FLOOR_ID)).toEqual(baseRow);
    });
    it('returns null when not found', async () => {
      const { repo } = makeRepo([]);
      expect(await repo.findById(FLOOR_ID)).toBeNull();
    });
  });

  describe('list()', () => {
    it('lists without cursor, no nextCursor under limit', async () => {
      const { repo } = makeRepo([baseRow]);
      const res = await repo.list(BUILDING_ID, { limit: 20 });
      expect(res.nextCursor).toBeNull();
    });
    it('returns a nextCursor when over limit', async () => {
      const { repo } = makeRepo([baseRow, { ...baseRow, floor_id: 'f2' }]);
      const res = await repo.list(BUILDING_ID, { limit: 1 });
      expect(res.items).toHaveLength(1);
      expect(res.nextCursor).not.toBeNull();
    });
    it('applies a valid cursor', async () => {
      const { repo } = makeRepo([baseRow]);
      const cursor = Buffer.from(`${FLOOR_ID}:${new Date('2026-07-05').toISOString()}`).toString(
        'base64',
      );
      const res = await repo.list(BUILDING_ID, { cursor, limit: 20 });
      expect(res.items).toHaveLength(1);
    });
    it('ignores a cursor with no colon', async () => {
      const { repo } = makeRepo([baseRow]);
      const cursor = Buffer.from('nocolon').toString('base64');
      const res = await repo.list(BUILDING_ID, { cursor, limit: 20 });
      expect(res.items).toHaveLength(1);
    });
    it('ignores a cursor with empty id', async () => {
      const { repo } = makeRepo([baseRow]);
      const cursor = Buffer.from(':2026-07-05T00:00:00.000Z').toString('base64');
      const res = await repo.list(BUILDING_ID, { cursor, limit: 20 });
      expect(res.items).toHaveLength(1);
    });
    it('ignores a cursor with empty createdAt', async () => {
      const { repo } = makeRepo([baseRow]);
      const cursor = Buffer.from(`${FLOOR_ID}:`).toString('base64');
      const res = await repo.list(BUILDING_ID, { cursor, limit: 20 });
      expect(res.items).toHaveLength(1);
    });
  });

  describe('update()', () => {
    it('returns the updated row', async () => {
      const { repo } = makeRepo([{ ...baseRow, floor_number: 9 }]);
      const res = await repo.update(FLOOR_ID, { floor_number: 9 });
      expect(res.floor_number).toBe(9);
    });
    it('handles an empty update', async () => {
      const { repo } = makeRepo([baseRow]);
      expect((await repo.update(FLOOR_ID, {})).floor_id).toBe(FLOOR_ID);
    });
  });

  describe('delete()', () => {
    it('executes the delete', async () => {
      const { repo, executeRaw } = makeRepo();
      await repo.delete(FLOOR_ID);
      expect(executeRaw).toHaveBeenCalled();
    });
  });
});
