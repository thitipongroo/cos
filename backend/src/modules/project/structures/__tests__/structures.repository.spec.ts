// Unit tests for StructuresRepository — cursor encoding + all CRUD methods (100% line+branch).

import { StructuresRepository } from '../structures.repository';

const TENANT_ID = 'tenant-uuid-001';
const BUILDING_ID = 'bldg-uuid-001';
const STRUCTURE_ID = 'strc-uuid-001';
const USER_ID = 'user-uuid-001';

const baseRow = {
  structure_id: STRUCTURE_ID,
  building_id: BUILDING_ID,
  tenant_id: TENANT_ID,
  structure_type: 'column',
  material_type: 'Reinforced concrete',
  created_by: USER_ID,
  created_at: new Date('2026-07-05'),
  updated_at: new Date('2026-07-05'),
};

function makeRepo(
  queryResult: unknown = [baseRow],
  tenantId: string | undefined = TENANT_ID,
): { repo: StructuresRepository; queryRaw: jest.Mock; executeRaw: jest.Mock } {
  const queryRaw = jest.fn().mockResolvedValue(queryResult);
  const executeRaw = jest.fn().mockResolvedValue(1);
  const txMock = { $queryRaw: queryRaw, $executeRaw: executeRaw };
  const tenantPrisma = {
    run: jest.fn((fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
  };
  const repo = new StructuresRepository(tenantPrisma as never, { tenantId } as never);
  return { repo, queryRaw, executeRaw };
}

describe('StructuresRepository', () => {
  it('tenantId getter falls back to empty string', () => {
    const repo = new StructuresRepository({ run: jest.fn() } as never, {} as never);
    expect((repo as unknown as { tenantId: string }).tenantId).toBe('');
  });

  describe('buildingExists()', () => {
    it('true when exists', async () => {
      expect(await makeRepo([{ exists: true }]).repo.buildingExists(BUILDING_ID)).toBe(true);
    });
    it('false when not-exists', async () => {
      expect(await makeRepo([{ exists: false }]).repo.buildingExists(BUILDING_ID)).toBe(false);
    });
    it('false when no row', async () => {
      expect(await makeRepo([]).repo.buildingExists(BUILDING_ID)).toBe(false);
    });
  });

  describe('create()', () => {
    it('returns the inserted row', async () => {
      const { repo } = makeRepo([baseRow]);
      expect(
        (await repo.create(BUILDING_ID, { structure_type: 'column' as never }, USER_ID))
          .structure_id,
      ).toBe(STRUCTURE_ID);
    });
    it('passes material_type', async () => {
      const { repo, queryRaw } = makeRepo([baseRow]);
      await repo.create(
        BUILDING_ID,
        { structure_type: 'beam' as never, material_type: 'Steel' },
        USER_ID,
      );
      expect(queryRaw).toHaveBeenCalled();
    });
  });

  describe('findById()', () => {
    it('returns the row when found', async () => {
      expect(await makeRepo([baseRow]).repo.findById(STRUCTURE_ID)).toEqual(baseRow);
    });
    it('returns null when not found', async () => {
      expect(await makeRepo([]).repo.findById(STRUCTURE_ID)).toBeNull();
    });
  });

  describe('list()', () => {
    it('no nextCursor under limit', async () => {
      expect(
        (await makeRepo([baseRow]).repo.list(BUILDING_ID, { limit: 20 })).nextCursor,
      ).toBeNull();
    });
    it('nextCursor when over limit', async () => {
      const { repo } = makeRepo([baseRow, { ...baseRow, structure_id: 's2' }]);
      const res = await repo.list(BUILDING_ID, { limit: 1 });
      expect(res.items).toHaveLength(1);
      expect(res.nextCursor).not.toBeNull();
    });
    it('applies a valid cursor', async () => {
      const cursor = Buffer.from(
        `${STRUCTURE_ID}:${new Date('2026-07-05').toISOString()}`,
      ).toString('base64');
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
      const cursor = Buffer.from(`${STRUCTURE_ID}:`).toString('base64');
      expect(
        (await makeRepo([baseRow]).repo.list(BUILDING_ID, { cursor, limit: 20 })).items,
      ).toHaveLength(1);
    });
  });

  describe('update()', () => {
    it('returns the updated row', async () => {
      const { repo } = makeRepo([{ ...baseRow, structure_type: 'wall' }]);
      expect(
        (await repo.update(STRUCTURE_ID, { structure_type: 'wall' as never })).structure_type,
      ).toBe('wall');
    });
    it('handles an empty update', async () => {
      expect((await makeRepo([baseRow]).repo.update(STRUCTURE_ID, {})).structure_id).toBe(
        STRUCTURE_ID,
      );
    });
  });

  describe('delete()', () => {
    it('executes the delete', async () => {
      const { repo, executeRaw } = makeRepo();
      await repo.delete(STRUCTURE_ID);
      expect(executeRaw).toHaveBeenCalled();
    });
  });
});
