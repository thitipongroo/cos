// enterTenantTx (D51, 2026-11-13): on the shared database it takes the tenant's pause lock shared and
// refuses an inactive tenant; on a dedicated one it only scopes the transaction. The lock's effect —
// that a pause waits for transactions in flight and later ones are refused — needs real Postgres:
// test/provisioning/07-tenant-pause-drain.integration.spec.ts.

import { enterTenantTx, tenantLockName } from '../tenant-tx';
import { TenantInactiveError, TenantMovedError } from '../get-db-url';

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000001';

function tx(rows: Array<{ is_active: boolean; moved?: boolean }>) {
  const calls: string[] = [];
  return {
    calls,
    $executeRawUnsafe: jest.fn(async (q: string) => {
      calls.push(q);
      return 0;
    }),
    $executeRaw: jest.fn(async (q: TemplateStringsArray, ...v: unknown[]) => {
      calls.push(`${q.join('?')} [${v.join(',')}]`);
      return 1;
    }),
    $queryRaw: jest.fn(async (q: TemplateStringsArray) => {
      calls.push(q.join('?'));
      return rows as never;
    }),
  };
}

describe('enterTenantTx', () => {
  it('on the shared database: SET LOCAL, then the shared lock, then is_active — in that order', async () => {
    const t = tx([{ is_active: true }]);
    await enterTenantTx(t, TENANT, true);
    expect(t.calls[0]).toBe(`SET LOCAL app.current_tenant_id = '${TENANT}'`);
    expect(t.calls[1]).toContain('pg_advisory_xact_lock_shared(hashtextextended(');
    expect(t.calls[1]).toContain(tenantLockName(TENANT));
    expect(t.calls[2]).toContain('SELECT is_active, dedicated_db_url IS NOT NULL AS moved');
    expect(t.calls[2]).toContain('FROM platform.tenants');
  });

  it.each([
    ['inactive', [{ is_active: false }]],
    ['unknown', []],
  ] as const)('refuses an %s tenant', async (reason, rows) => {
    const err = await enterTenantTx(tx([...rows]), TENANT, true).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TenantInactiveError);
    expect((err as TenantInactiveError).reason).toBe(reason);
  });

  it('refuses a tenant already switched to its dedicated database (retry routes it there)', async () => {
    const err = await enterTenantTx(tx([{ is_active: true, moved: true }]), TENANT, true).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(TenantMovedError);
  });

  it('on a dedicated database: only SET LOCAL (its platform.tenants is empty)', async () => {
    const t = tx([]);
    await enterTenantTx(t, TENANT, false);
    expect(t.calls).toEqual([`SET LOCAL app.current_tenant_id = '${TENANT}'`]);
  });
});
