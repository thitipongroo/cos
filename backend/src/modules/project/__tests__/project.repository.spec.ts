// Unit tests for ProjectRepository — cursor encoding and all CRUD methods

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { ProjectRepository } from '../project.repository';

const TENANT_ID = 'tenant-uuid-001';
const PROJECT_ID = 'proj-uuid-001';
const USER_ID = 'user-uuid-001';

const baseRow = {
  project_id: PROJECT_ID,
  tenant_id: TENANT_ID,
  project_code: 'PROJ-001',
  project_name: 'Test Project',
  project_type: 'COMMERCIAL',
  status: 'DRAFT',
  budget_amount: '1000000.0000',
  budget_currency: 'THB',
  start_date: '2026-06-01',
  end_date: '2027-12-31',
  estimated_completion_date: null,
  on_hold_reason: null,
  on_hold_at: null,
  cancellation_reason: null,
  cancelled_at: null,
  created_by: USER_ID,
  created_at: new Date('2026-05-31'),
  updated_at: new Date('2026-05-31'),
};

function makeRepo(
  queryResult: unknown = [baseRow],
  tenantId: string | undefined = TENANT_ID,
): ProjectRepository {
  const txMock = { $queryRaw: jest.fn().mockResolvedValue(queryResult) };
  const tenantPrisma = {
    run: jest.fn((fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
  };
  const request = { tenantId };
  return new ProjectRepository(tenantPrisma as never, request as never);
}

describe('ProjectRepository', () => {
  describe('constructor — tenantId fallback (line 89)', () => {
    it('uses empty string when tenantId is not in request (covers ?? right branch)', () => {
      // Must NOT use makeRepo() — default parameter replaces undefined with TENANT_ID.
      // Construct directly with a request that has no tenantId key.
      const txMock = { $queryRaw: jest.fn().mockResolvedValue([baseRow]) };
      const tenantPrisma = {
        run: jest.fn((fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
      };
      const noCtx = new ProjectRepository(tenantPrisma as never, {} as never);
      expect((noCtx as unknown as { tenantId: string }).tenantId).toBe('');
    });
  });

  describe('create()', () => {
    it('returns the inserted row', async () => {
      const repo = makeRepo([baseRow]);
      const result = await repo.create(
        {
          project_code: 'PROJ-001',
          project_name: 'Test',
          project_type: 'COMMERCIAL' as never,
        },
        USER_ID,
      );
      expect(result.project_id).toBe(PROJECT_ID);
    });
  });

  describe('findById()', () => {
    it('returns the row when found', async () => {
      const repo = makeRepo([baseRow]);
      const result = await repo.findById(PROJECT_ID);
      expect(result?.project_id).toBe(PROJECT_ID);
    });

    it('returns null when not found', async () => {
      const repo = makeRepo([]);
      const result = await repo.findById('missing');
      expect(result).toBeNull();
    });
  });

  describe('list()', () => {
    it('returns items and null nextCursor when count ≤ limit', async () => {
      const repo = makeRepo([baseRow]);
      const result = await repo.list({ limit: 20 });
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
    });

    it('returns nextCursor when count > limit', async () => {
      const rows = Array.from({ length: 21 }, (_, i) => ({
        ...baseRow,
        project_id: `proj-${i}`,
        created_at: new Date('2026-05-31'),
      }));
      const repo = makeRepo(rows);
      const result = await repo.list({ limit: 20 });
      expect(result.items).toHaveLength(20);
      expect(result.nextCursor).not.toBeNull();
    });

    it('filters by status when provided', async () => {
      const repo = makeRepo([baseRow]);
      const result = await repo.list({ limit: 20, status: 'DRAFT' });
      expect(result.items).toHaveLength(1);
    });

    it('filters by type when provided', async () => {
      const repo = makeRepo([baseRow]);
      const result = await repo.list({ limit: 20, type: 'COMMERCIAL' });
      expect(result.items).toHaveLength(1);
    });

    it('handles cursor (decoded) for pagination', async () => {
      const cursor = Buffer.from(`${PROJECT_ID}:2026-05-31T00:00:00.000Z`).toString('base64');
      const repo = makeRepo([]);
      const result = await repo.list({ limit: 20, cursor });
      expect(result.items).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
    });

    it('handles cursor with status filter', async () => {
      const cursor = Buffer.from(`${PROJECT_ID}:2026-05-31T00:00:00.000Z`).toString('base64');
      const repo = makeRepo([]);
      const result = await repo.list({ limit: 20, cursor, status: 'DRAFT' });
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('handles cursor with type filter', async () => {
      const cursor = Buffer.from(`${PROJECT_ID}:2026-05-31T00:00:00.000Z`).toString('base64');
      const repo = makeRepo([]);
      const result = await repo.list({ limit: 20, cursor, type: 'COMMERCIAL' });
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('handles cursor with both status and type filters', async () => {
      const cursor = Buffer.from(`${PROJECT_ID}:2026-05-31T00:00:00.000Z`).toString('base64');
      const repo = makeRepo([]);
      const result = await repo.list({ limit: 20, cursor, status: 'DRAFT', type: 'COMMERCIAL' });
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('handles invalid cursor gracefully (treated as no cursor)', async () => {
      const repo = makeRepo([baseRow]);
      const result = await repo.list({ limit: 20, cursor: 'not-valid-base64!!!' });
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('handles cursor missing colon — decodeCursor returns null (covers line 71 branch)', async () => {
      const noColonCursor = Buffer.from('nocolon').toString('base64');
      const repo = makeRepo([baseRow]);
      const result = await repo.list({ limit: 20, cursor: noColonCursor });
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('handles cursor with empty projectId (colon at position 0) — covers line 74 left ||', async () => {
      // Decoded = ':2026-05-31T00:00:00.000Z' → projectId = '' (falsy) → return null
      const cursor = Buffer.from(':2026-05-31T00:00:00.000Z').toString('base64');
      const repo = makeRepo([baseRow]);
      const result = await repo.list({ limit: 20, cursor });
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('handles cursor with empty createdAt — covers line 74 right ||', async () => {
      // Decoded = 'some-uuid:' → createdAt = '' (falsy) → return null
      const cursor = Buffer.from('some-uuid:').toString('base64');
      const repo = makeRepo([baseRow]);
      const result = await repo.list({ limit: 20, cursor });
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('filters by status AND type without cursor (covers line 165 branch)', async () => {
      const repo = makeRepo([baseRow]);
      const result = await repo.list({ limit: 20, status: 'DRAFT', type: 'COMMERCIAL' });
      expect(result.items).toHaveLength(1);
    });
  });

  describe('listMembers()', () => {
    it('returns member rows', async () => {
      const memberRow = { membership_id: 'm1', user_id: USER_ID, role: 'SITE_ENGINEER' };
      const repo = makeRepo([memberRow]);
      const result = await repo.listMembers(PROJECT_ID);
      expect(result[0]?.user_id).toBe(USER_ID);
    });
  });

  describe('listDocuments()', () => {
    it('returns document rows', async () => {
      const docRow = { document_id: 'd1', file_id: 'f1', uploaded_by: USER_ID };
      const repo = makeRepo([docRow]);
      const result = await repo.listDocuments(PROJECT_ID);
      expect(result[0]?.document_id).toBe('d1');
    });
  });

  describe('update()', () => {
    it('returns updated row', async () => {
      const repo = makeRepo([baseRow]);
      const result = await repo.update(PROJECT_ID, { project_name: 'Updated' });
      expect(result.project_id).toBe(PROJECT_ID);
    });

    it('passes null for undefined fields (covers ?? null branches)', async () => {
      const repo = makeRepo([baseRow]);
      // All fields undefined → ?? null branches taken for all
      const result = await repo.update(PROJECT_ID, {});
      expect(result.project_id).toBe(PROJECT_ID);
    });

    it('interpolates PM-entered estimated_completion_date into the UPDATE (§11.2)', async () => {
      // Capture the tagged-template call so we can assert the value reaches the query.
      const txMock = { $queryRaw: jest.fn().mockResolvedValue([baseRow]) };
      const tenantPrisma = {
        run: jest.fn((fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
      };
      const repo = new ProjectRepository(tenantPrisma as never, { tenantId: TENANT_ID } as never);
      await repo.update(PROJECT_ID, { estimated_completion_date: '2027-11-15' });
      // Interpolated values follow the strings array in a tagged template.
      const values = txMock.$queryRaw.mock.calls[0]!.slice(1);
      expect(values).toContain('2027-11-15');
    });
  });

  describe('updateStatus()', () => {
    it('returns row with new status', async () => {
      const updated = { ...baseRow, status: 'ACTIVE' };
      const repo = makeRepo([updated]);
      const result = await repo.updateStatus(PROJECT_ID, 'ACTIVE', {});
      expect(result.status).toBe('ACTIVE');
    });

    it('passes on_hold meta fields', async () => {
      const repo = makeRepo([{ ...baseRow, status: 'ON_HOLD' }]);
      const result = await repo.updateStatus(PROJECT_ID, 'ON_HOLD', {
        on_hold_reason: 'Funding pause',
        on_hold_at: new Date().toISOString(),
      });
      expect(result.status).toBe('ON_HOLD');
    });
  });

  describe('addMember()', () => {
    it('returns inserted member row', async () => {
      const memberRow = { membership_id: 'm1', user_id: USER_ID, role: 'SITE_ENGINEER' };
      const repo = makeRepo([memberRow]);
      const result = await repo.addMember(PROJECT_ID, USER_ID, 'SITE_ENGINEER' as never, 'admin');
      expect(result.user_id).toBe(USER_ID);
    });
  });

  describe('removeMember()', () => {
    it('completes without error', async () => {
      const txMock = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        $executeRaw: jest.fn().mockResolvedValue(1),
      };
      const tenantPrisma = {
        run: jest.fn((fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
      };
      const repo = new ProjectRepository(tenantPrisma as never, { tenantId: TENANT_ID } as never);
      await expect(repo.removeMember(PROJECT_ID, USER_ID)).resolves.toBeUndefined();
    });
  });
});
