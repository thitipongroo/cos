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

jest.mock('../../../shared/prisma/create-prisma-client', () => ({
  createPrismaClient: () => ({
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({ $executeRaw: mockExecuteRaw, $executeRawUnsafe: mockExecuteRawUnsafe }),
    $disconnect: mockDisconnect,
  }),
}));

import { FileLegalHoldService } from '../file-legal-hold.service';

const TENANT = '11111111-1111-4111-8111-111111111111';
const FILE = '44444444-4444-4444-8444-444444444444';
const ACTOR = '22222222-2222-4222-8222-222222222222';

describe('FileLegalHoldService', () => {
  let service: FileLegalHoldService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FileLegalHoldService();
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
    await service.onModuleDestroy();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});
