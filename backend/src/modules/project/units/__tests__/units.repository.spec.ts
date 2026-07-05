// Unit tests for UnitsRepository — parent lookup, cursor encoding + CRUD (100% line+branch).

import { UnitsRepository } from '../units.repository';

const TENANT_ID = 'tenant-uuid-001';
const BUILDING_ID = 'bldg-uuid-001';
const PROJECT_ID = 'proj-uuid-001';
const UNIT_ID = 'unit-uuid-001';
const USER_ID = 'user-uuid-001';

const baseRow = {
  unit_id: UNIT_ID,
  tenant_id: TENANT_ID,
  building_id: BUILDING_ID,
  project_id: PROJECT_ID,
  unit_number: 'A-1201',
  unit_type: '2BR',
  status: 'AVAILABLE',
  created_by: USER_ID,
  created_at: new Date('2026-07-05'),
  updated_at: new Date('2026-07-05'),
};

function makeRepo(
  queryResult: unknown = [baseRow],
  tenantId: string | undefined = TENANT_ID,
): { repo: UnitsRepository; queryRaw: jest.Mock; executeRaw: jest.Mock } {
  const queryRaw = jest.fn().mockResolvedValue(queryResult);
  const executeRaw = jest.fn().mockResolvedValue(1);
  const txMock = { $queryRaw: queryRaw, $executeRaw: executeRaw };
  const tenantPrisma = {
    run: jest.fn((fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
  };
  const repo = new UnitsRepository(tenantPrisma as never, { tenantId } as never);
  return { repo, queryRaw, executeRaw };
}

describe('UnitsRepository', () => {
  it('tenantId getter falls back to empty string', () => {
    const repo = new UnitsRepository({ run: jest.fn() } as never, {} as never);
    expect((repo as unknown as { tenantId: string }).tenantId).toBe('');
  });

  describe('parentProjectOfBuilding()', () => {
    it('returns the building project_id when found', async () => {
      const { repo } = makeRepo([{ project_id: PROJECT_ID }]);
      expect(await repo.parentProjectOfBuilding(BUILDING_ID)).toBe(PROJECT_ID);
    });
    it('returns null when the building is not found (?? fallback)', async () => {
      const { repo } = makeRepo([]);
      expect(await repo.parentProjectOfBuilding(BUILDING_ID)).toBeNull();
    });
  });

  describe('create()', () => {
    it('returns the inserted row', async () => {
      const { repo } = makeRepo([baseRow]);
      expect(
        (await repo.create(BUILDING_ID, PROJECT_ID, { unit_number: 'A-1' }, USER_ID)).unit_id,
      ).toBe(UNIT_ID);
    });
    it('passes optional fields', async () => {
      const { repo, queryRaw } = makeRepo([baseRow]);
      await repo.create(
        BUILDING_ID,
        PROJECT_ID,
        { unit_number: 'A-1', unit_type: '1BR', status: 'SOLD' },
        USER_ID,
      );
      expect(queryRaw).toHaveBeenCalled();
    });
  });

  describe('findById()', () => {
    it('returns the row when found', async () => {
      expect(await makeRepo([baseRow]).repo.findById(UNIT_ID)).toEqual(baseRow);
    });
    it('returns null when not found', async () => {
      expect(await makeRepo([]).repo.findById(UNIT_ID)).toBeNull();
    });
  });

  describe('list()', () => {
    it('no nextCursor under limit', async () => {
      expect(
        (await makeRepo([baseRow]).repo.list(BUILDING_ID, { limit: 20 })).nextCursor,
      ).toBeNull();
    });
    it('nextCursor when over limit', async () => {
      const { repo } = makeRepo([baseRow, { ...baseRow, unit_id: 'u2' }]);
      const res = await repo.list(BUILDING_ID, { limit: 1 });
      expect(res.items).toHaveLength(1);
      expect(res.nextCursor).not.toBeNull();
    });
    it('applies a valid cursor', async () => {
      const cursor = Buffer.from(`${UNIT_ID}:${new Date('2026-07-05').toISOString()}`).toString(
        'base64',
      );
      expect(
        (await makeRepo([baseRow]).repo.list(BUILDING_ID, { cursor, limit: 20 })).items,
      ).toHaveLength(1);
    });
    it('ignores a cursor with no colon', async () => {
      const cursor = Buffer.from('nocolon').toString('base64');
      expect(
        (await makeRepo([baseRow]).repo.list(BUILDING_ID, { cursor, limit: 20 })).items,
      ).toHaveLength(1);
    });
    it('ignores a cursor with empty id', async () => {
      const cursor = Buffer.from(':2026-07-05T00:00:00.000Z').toString('base64');
      expect(
        (await makeRepo([baseRow]).repo.list(BUILDING_ID, { cursor, limit: 20 })).items,
      ).toHaveLength(1);
    });
    it('ignores a cursor with empty createdAt', async () => {
      const cursor = Buffer.from(`${UNIT_ID}:`).toString('base64');
      expect(
        (await makeRepo([baseRow]).repo.list(BUILDING_ID, { cursor, limit: 20 })).items,
      ).toHaveLength(1);
    });
  });

  describe('update()', () => {
    it('returns the updated row', async () => {
      const { repo } = makeRepo([{ ...baseRow, status: 'SOLD' }]);
      expect((await repo.update(UNIT_ID, { status: 'SOLD' })).status).toBe('SOLD');
    });
    it('handles an empty update', async () => {
      expect((await makeRepo([baseRow]).repo.update(UNIT_ID, {})).unit_id).toBe(UNIT_ID);
    });
  });

  describe('delete()', () => {
    it('executes the delete', async () => {
      const { repo, executeRaw } = makeRepo();
      await repo.delete(UNIT_ID);
      expect(executeRaw).toHaveBeenCalled();
    });
  });
});
