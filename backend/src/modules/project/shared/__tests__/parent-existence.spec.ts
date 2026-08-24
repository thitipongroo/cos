import {
  projectExistsInTenant,
  buildingExistsInTenant,
  floorExistsInTenant,
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
