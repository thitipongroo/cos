// Unit tests — FileLegalHoldService (ADR-090 §5).
//
// createPrismaClient is mocked so the service's own app-role client is a jest stub, the same shape
// LastSeenService's spec uses. What these assert is the part that carries the guarantee: the tenant
// GUC is set inside the SAME transaction as the UPDATE (RLS is transaction-scoped, and SET LOCAL is
// what makes it safe under PgBouncer), the tenant id is validated before it reaches a string-built
// statement, and "no row matched" is reported as false rather than as success.

// Set before the service is constructed: appDatabaseUrl() REFUSES to fall back to the superuser
// DATABASE_URL (spec §7.7, QM-18), so an unset value is a hard error rather than a silent
// RLS bypass. Same line the AuditInterceptor spec carries, for the same reason.
process.env['APP_DATABASE_URL'] = 'postgresql://app_user@localhost/db';

const mockExecuteRaw = jest.fn();
const mockExecuteRawUnsafe = jest.fn();
const mockDisconnect = jest.fn().mockResolvedValue(undefined);

// Since 2026-11-13 the service resolves the tenant's database (an ENTERPRISE tenant's files are in its
// dedicated one) and enters the transaction through enterTenantTx (the D51 pause lock on the shared
// database). Here enterTenantTx keeps only its SET LOCAL, as before, and records its arguments.
const resolveTenantDb = jest.fn();
jest.mock('../../../shared/prisma/get-db-url', () => ({
  resolveTenantDb: (id: string) => resolveTenantDb(id),
}));
const enterTenantTx = jest.fn(
  async (
    tx: { $executeRawUnsafe: (q: string) => Promise<unknown> },
    tenantId: string,
    _s: boolean,
  ) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
  },
);
jest.mock('../../../shared/prisma/tenant-tx', () => ({
  enterTenantTx: (...a: Parameters<typeof enterTenantTx>) => enterTenantTx(...a),
}));
const clientUrls: string[] = [];

jest.mock('../../../shared/prisma/create-prisma-client', () => ({
  createPrismaClient: (url: string) => (
    clientUrls.push(url),
    {
      $transaction: (fn: (tx: unknown) => unknown) =>
        fn({ $executeRaw: mockExecuteRaw, $executeRawUnsafe: mockExecuteRawUnsafe }),
      $disconnect: mockDisconnect,
    }
  ),
}));

import { FileLegalHoldService } from '../file-legal-hold.service';

const TENANT = '11111111-1111-4111-8111-111111111111';
const FILE = '44444444-4444-4444-8444-444444444444';
const ACTOR = '22222222-2222-4222-8222-222222222222';

describe('FileLegalHoldService', () => {
  let service: FileLegalHoldService;

  beforeEach(() => {
    jest.clearAllMocks();
    clientUrls.length = 0;
    resolveTenantDb.mockResolvedValue({ dedicatedDbUrl: null });
    service = new FileLegalHoldService();
  });

  it("writes an ENTERPRISE tenant's hold to its dedicated database, without the shared-only pause lock", async () => {
    resolveTenantDb.mockResolvedValue({ dedicatedDbUrl: 'postgresql://app_user@tenant-db/cos' });
    mockExecuteRaw.mockResolvedValue(1);
    await service.place({ tenantId: TENANT, fileId: FILE, reason: 'r', placedBy: ACTOR });
    expect(clientUrls).toEqual(['postgresql://app_user@tenant-db/cos']);
    expect(enterTenantTx).toHaveBeenCalledWith(expect.anything(), TENANT, false);
  });

  it('on the shared database enters through the pause lock (D51)', async () => {
    mockExecuteRaw.mockResolvedValue(1);
    await service.place({ tenantId: TENANT, fileId: FILE, reason: 'r', placedBy: ACTOR });
    expect(clientUrls).toEqual(['postgresql://app_user@localhost/db']);
    expect(enterTenantTx).toHaveBeenCalledWith(expect.anything(), TENANT, true);
  });

  it('sets the tenant GUC in the same transaction as the UPDATE', async () => {
    mockExecuteRaw.mockResolvedValue(1);

    await expect(
      service.place({ tenantId: TENANT, fileId: FILE, reason: 'Case 1/2569', placedBy: ACTOR }),
    ).resolves.toBe(true);

    // Without the SET LOCAL, RLS would see no tenant and the UPDATE would match nothing — silently.
    expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
      `SET LOCAL app.current_tenant_id = '${TENANT}'`,
    );
    expect(mockExecuteRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
      mockExecuteRaw.mock.invocationCallOrder[0]!,
    );
  });

  it('reports false when no row matched, so a caller cannot claim it archived anything', async () => {
    mockExecuteRaw.mockResolvedValue(0);
    await expect(
      service.place({ tenantId: TENANT, fileId: FILE, reason: 'Case 1/2569', placedBy: ACTOR }),
    ).resolves.toBe(false);
  });

  it('rejects an unsafe tenant id before it reaches the string-built SET LOCAL', async () => {
    // That statement is the one place a tenant id is interpolated rather than parameterised, which
    // is why assertSafeTenantId guards it.
    await expect(
      service.place({
        tenantId: "1'; DROP TABLE files.files; --",
        fileId: FILE,
        reason: 'x',
        placedBy: ACTOR,
      }),
    ).rejects.toThrow();
    expect(mockExecuteRawUnsafe).not.toHaveBeenCalled();
  });

  it('closes its client on shutdown (Rule 39)', async () => {
    // Clients are opened per database on first use (since 2026-11-13), so open one first.
    mockExecuteRaw.mockResolvedValue(1);
    await service.place({ tenantId: TENANT, fileId: FILE, reason: 'r', placedBy: ACTOR });
    await service.onModuleDestroy();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});
