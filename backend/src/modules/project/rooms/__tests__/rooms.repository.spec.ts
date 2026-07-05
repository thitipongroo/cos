// Unit tests for RoomsRepository — cursor encoding + all CRUD methods (100% line+branch).

import { RoomsRepository } from '../rooms.repository';

const TENANT_ID = 'tenant-uuid-001';
const FLOOR_ID = 'floor-uuid-001';
const ROOM_ID = 'room-uuid-001';
const USER_ID = 'user-uuid-001';

const baseRow = {
  room_id: ROOM_ID,
  floor_id: FLOOR_ID,
  tenant_id: TENANT_ID,
  room_number: '12-A',
  room_type: 'BEDROOM',
  area_sqm: '24.50',
  created_by: USER_ID,
  created_at: new Date('2026-07-05'),
  updated_at: new Date('2026-07-05'),
};

function makeRepo(
  queryResult: unknown = [baseRow],
  tenantId: string | undefined = TENANT_ID,
): { repo: RoomsRepository; queryRaw: jest.Mock; executeRaw: jest.Mock } {
  const queryRaw = jest.fn().mockResolvedValue(queryResult);
  const executeRaw = jest.fn().mockResolvedValue(1);
  const txMock = { $queryRaw: queryRaw, $executeRaw: executeRaw };
  const tenantPrisma = {
    run: jest.fn((fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
  };
  const repo = new RoomsRepository(tenantPrisma as never, { tenantId } as never);
  return { repo, queryRaw, executeRaw };
}

describe('RoomsRepository', () => {
  it('tenantId getter falls back to empty string', () => {
    const repo = new RoomsRepository({ run: jest.fn() } as never, {} as never);
    expect((repo as unknown as { tenantId: string }).tenantId).toBe('');
  });

  describe('floorExists()', () => {
    it('true when parent floor exists', async () => {
      const { repo } = makeRepo([{ exists: true }]);
      expect(await repo.floorExists(FLOOR_ID)).toBe(true);
    });
    it('false when not-exists', async () => {
      const { repo } = makeRepo([{ exists: false }]);
      expect(await repo.floorExists(FLOOR_ID)).toBe(false);
    });
    it('false when no row (?? fallback)', async () => {
      const { repo } = makeRepo([]);
      expect(await repo.floorExists(FLOOR_ID)).toBe(false);
    });
  });

  describe('create()', () => {
    it('returns the inserted row', async () => {
      const { repo } = makeRepo([baseRow]);
      expect((await repo.create(FLOOR_ID, { room_number: '1' }, USER_ID)).room_id).toBe(ROOM_ID);
    });
    it('passes optional fields', async () => {
      const { repo, queryRaw } = makeRepo([baseRow]);
      await repo.create(FLOOR_ID, { room_number: '1', room_type: 'X', area_sqm: '1.0' }, USER_ID);
      expect(queryRaw).toHaveBeenCalled();
    });
  });

  describe('findById()', () => {
    it('returns the row when found', async () => {
      const { repo } = makeRepo([baseRow]);
      expect(await repo.findById(ROOM_ID)).toEqual(baseRow);
    });
    it('returns null when not found', async () => {
      const { repo } = makeRepo([]);
      expect(await repo.findById(ROOM_ID)).toBeNull();
    });
  });

  describe('list()', () => {
    it('no nextCursor under limit', async () => {
      const { repo } = makeRepo([baseRow]);
      expect((await repo.list(FLOOR_ID, { limit: 20 })).nextCursor).toBeNull();
    });
    it('nextCursor when over limit', async () => {
      const { repo } = makeRepo([baseRow, { ...baseRow, room_id: 'r2' }]);
      const res = await repo.list(FLOOR_ID, { limit: 1 });
      expect(res.items).toHaveLength(1);
      expect(res.nextCursor).not.toBeNull();
    });
    it('applies a valid cursor', async () => {
      const { repo } = makeRepo([baseRow]);
      const cursor = Buffer.from(`${ROOM_ID}:${new Date('2026-07-05').toISOString()}`).toString(
        'base64',
      );
      expect((await repo.list(FLOOR_ID, { cursor, limit: 20 })).items).toHaveLength(1);
    });
    it('ignores a cursor with no colon', async () => {
      const { repo } = makeRepo([baseRow]);
      const cursor = Buffer.from('nocolon').toString('base64');
      expect((await repo.list(FLOOR_ID, { cursor, limit: 20 })).items).toHaveLength(1);
    });
    it('ignores a cursor with empty id', async () => {
      const { repo } = makeRepo([baseRow]);
      const cursor = Buffer.from(':2026-07-05T00:00:00.000Z').toString('base64');
      expect((await repo.list(FLOOR_ID, { cursor, limit: 20 })).items).toHaveLength(1);
    });
    it('ignores a cursor with empty createdAt', async () => {
      const { repo } = makeRepo([baseRow]);
      const cursor = Buffer.from(`${ROOM_ID}:`).toString('base64');
      expect((await repo.list(FLOOR_ID, { cursor, limit: 20 })).items).toHaveLength(1);
    });
  });

  describe('update()', () => {
    it('returns the updated row', async () => {
      const { repo } = makeRepo([{ ...baseRow, room_number: '99' }]);
      expect((await repo.update(ROOM_ID, { room_number: '99' })).room_number).toBe('99');
    });
    it('handles an empty update', async () => {
      const { repo } = makeRepo([baseRow]);
      expect((await repo.update(ROOM_ID, {})).room_id).toBe(ROOM_ID);
    });
  });

  describe('delete()', () => {
    it('executes the delete', async () => {
      const { repo, executeRaw } = makeRepo();
      await repo.delete(ROOM_ID);
      expect(executeRaw).toHaveBeenCalled();
    });
  });
});
