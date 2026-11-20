import {
  projectExistsInTenant,
  buildingExistsInTenant,
  floorExistsInTenant,
  projectStatusInTenant,
} from '../parent-existence';
import type { TenantPrismaService } from '../../../tenant/prisma/tenant-prisma.service';

const TENANT_ID = 'tenant-uuid-001';
const ID = 'parent-uuid-001';

// tenantPrisma.run(fn) → fn(tx); tx.$queryRaw resolves to the seeded rows.
function makePrisma(queryResult: unknown): TenantPrismaService {
  const txMock = { $queryRaw: jest.fn().mockResolvedValue(queryResult) };
  return {
    run: jest.fn((fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
  } as unknown as TenantPrismaService;
}

describe.each([
  ['projectExistsInTenant', projectExistsInTenant],
  ['buildingExistsInTenant', buildingExistsInTenant],
  ['floorExistsInTenant', floorExistsInTenant],
] as const)('%s', (_name, fn) => {
  it('returns true when the parent exists', async () => {
    expect(await fn(makePrisma([{ exists: true }]), ID, TENANT_ID)).toBe(true);
  });

  it('returns false when reported not-exists', async () => {
    expect(await fn(makePrisma([{ exists: false }]), ID, TENANT_ID)).toBe(false);
  });

  it('returns false when no row is returned (?? fallback)', async () => {
    expect(await fn(makePrisma([]), ID, TENANT_ID)).toBe(false);
  });
});

// plan CS: the status, for refusing new procurement on a closed project; null for no such project in the tenant.
describe('projectStatusInTenant', () => {
  it("returns the project's status, asking with the tenant filtered explicitly", async () => {
    const txMock = { $queryRaw: jest.fn().mockResolvedValue([{ status: 'CANCELLED' }]) };
    const prisma = {
      run: jest.fn((fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
    } as unknown as TenantPrismaService;
    expect(await projectStatusInTenant(prisma, ID, TENANT_ID)).toBe('CANCELLED');
    const sql = (txMock.$queryRaw.mock.calls[0]![0] as string[]).join('?').replace(/\s+/g, ' ');
    expect(sql).toContain('FROM projects.projects');
    expect(sql).toContain('WHERE project_id = ?::uuid AND tenant_id = ?::uuid');
    expect(txMock.$queryRaw.mock.calls[0]!.slice(1)).toEqual([ID, TENANT_ID]);
  });

  it('returns null when there is no such project', async () => {
    expect(await projectStatusInTenant(makePrisma([]), ID, TENANT_ID)).toBeNull();
  });
});
