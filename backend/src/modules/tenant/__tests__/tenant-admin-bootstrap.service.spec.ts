// Unit tests for TenantAdminBootstrapService — the first TENANT_ADMIN of a tenant (ADR-110).

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
    $disconnect: jest.fn(),
  })),
}));

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CosRole } from '@cos/types';
import {
  ADMIN_INVITE_LIFESPAN_SEC,
  BOOTSTRAP_ADMIN_FLAG,
  RESEND_COOLDOWN_SEC,
  TENANT_ADMIN_ERROR,
  TenantAdminBootstrapService,
} from '../tenant-admin-bootstrap.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const KC_ID = 'kc-admin-1';
const REALM = 'construction-os';
const EMAIL = 'somchai@acme.co.th';
const JUSTIFICATION = 'Trial request TR-0042 from construction-os.io — first admin.';

type Mock = jest.Mock;
const sqlOf = (call: unknown[]) => (call[0] as TemplateStringsArray).join('?');
const callsMatching = (mock: Mock, text: string) =>
  mock.mock.calls.filter((c) => sqlOf(c as unknown[]).includes(text));

function makeTx() {
  return { $queryRaw: jest.fn(), $executeRaw: jest.fn(), $executeRawUnsafe: jest.fn() };
}

describe('TenantAdminBootstrapService', () => {
  let service: TenantAdminBootstrapService;
  let prisma: { $queryRaw: Mock; $executeRaw: Mock; $transaction: Mock; $disconnect: Mock };
  let users: { createUser: Mock };
  let keycloak: {
    sendPasswordResetEmail: Mock;
    hasAnyCredential: Mock;
    deleteUser: Mock;
    disableUser: Mock;
  };
  let tx: ReturnType<typeof makeTx>;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = makeTx();
    users = {
      // Runs the hook the way UserService does: inside the transaction, after the insert.
      createUser: jest.fn(async (_dto, _tenantId, _actorId, inTransaction) => {
        const created = { user_id: USER_ID, keycloak_user_id: KC_ID, email: EMAIL };
        await inTransaction?.(tx, created);
        return created;
      }),
    };
    keycloak = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      hasAnyCredential: jest.fn().mockResolvedValue(false),
      deleteUser: jest.fn().mockResolvedValue(undefined),
      disableUser: jest.fn().mockResolvedValue(undefined),
    };
    service = new TenantAdminBootstrapService(users as never, keycloak as never);
    prisma = (service as unknown as { prisma: typeof prisma }).prisma;
  });

  it('exports the flag, the 72-hour lifespan and the COS-TADM codes', () => {
    expect(BOOTSTRAP_ADMIN_FLAG).toBe('s1.tenant.bootstrap-admin');
    expect(ADMIN_INVITE_LIFESPAN_SEC).toBe(259_200);
    expect(TENANT_ADMIN_ERROR).toEqual({
      ALREADY_HAS_ADMIN: 'COS-TADM-001',
      INVITE_NOT_RESENDABLE: 'COS-TADM-002',
      INVITE_NOT_CANCELLABLE: 'COS-TADM-003',
      LAST_ADMIN: 'COS-TADM-004',
      RESEND_TOO_SOON: 'COS-TADM-005',
    });
    expect(RESEND_COOLDOWN_SEC).toBe(300);
  });

  it('disconnects Prisma on shutdown', async () => {
    await service.onModuleDestroy();
    expect(prisma.$disconnect).toHaveBeenCalled();
  });

  describe('bootstrap', () => {
    const run = () =>
      service.bootstrap(
        TENANT_ID,
        { email: EMAIL, display_name: 'สมชาย' },
        ACTOR_ID,
        JUSTIFICATION,
      );

    const activeTenant = () =>
      prisma.$queryRaw
        .mockResolvedValueOnce([{ is_active: true, keycloak_realm: REALM }])
        .mockResolvedValueOnce([]); // pre-check: no administrator

    it('creates a Path B TENANT_ADMIN, audits it and sends a 72-hour invitation', async () => {
      activeTenant();
      tx.$queryRaw.mockResolvedValueOnce([{ user_id: USER_ID, never_signed_in: true }]); // only the new row
      const before = Date.now();

      const result = await run();

      expect(users.createUser).toHaveBeenCalledWith(
        { email: EMAIL, display_name: 'สมชาย', role: CosRole.TENANT_ADMIN },
        TENANT_ID,
        ACTOR_ID,
        expect.any(Function),
      );
      // Lock, then the re-check, then the audit row — all inside the insert transaction.
      const lock = callsMatching(tx.$executeRaw, 'pg_advisory_xact_lock');
      expect(lock).toHaveLength(1);
      expect(lock[0]![1]).toBe(`cos:tenant-admin:${TENANT_ID}`);
      const audit = callsMatching(tx.$executeRaw, 'platform.audit_logs');
      expect(audit).toHaveLength(1);
      expect(audit[0]![3]).toBe('tenant.bootstrap_admin');
      expect(JSON.parse(audit[0]![5] as string)).toEqual({
        justification: JUSTIFICATION,
        user_id: USER_ID,
      });
      expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.current_tenant_id = '${TENANT_ID}'`,
      );

      expect(keycloak.sendPasswordResetEmail).toHaveBeenCalledWith(KC_ID, REALM, 259_200);
      expect(result).toMatchObject({ user_id: USER_ID, email: EMAIL, invite_sent: true });
      const expires = result.invite_expires_at!.getTime();
      expect(expires).toBeGreaterThanOrEqual(before + 259_200_000);
      expect(expires).toBeLessThanOrEqual(Date.now() + 259_200_000);
    });

    it('404 for an unknown tenant, before anything is created', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      await expect(run()).rejects.toBeInstanceOf(NotFoundException);
      expect(users.createUser).not.toHaveBeenCalled();
    });

    it('400 for a deactivated tenant', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ is_active: false, keycloak_realm: REALM }]);
      await expect(run()).rejects.toBeInstanceOf(BadRequestException);
      expect(users.createUser).not.toHaveBeenCalled();
    });

    it('409 COS-TADM-001 when the tenant already has an administrator — Keycloak is not touched', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([{ is_active: true, keycloak_realm: REALM }])
        .mockResolvedValueOnce([{ user_id: 'existing', never_signed_in: false }]);

      const err = await run().catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toMatchObject({
        error: { code: 'COS-TADM-001', messageKey: 'admin.tenantAdmin.error.alreadyHasAdmin' },
      });
      expect(users.createUser).not.toHaveBeenCalled();
    });

    it('409 COS-TADM-001 when a concurrent bootstrap committed first — refused under the lock, no audit', async () => {
      activeTenant();
      tx.$queryRaw.mockResolvedValueOnce([
        { user_id: USER_ID, never_signed_in: true },
        { user_id: 'won-the-race', never_signed_in: true },
      ]);

      await expect(run()).rejects.toMatchObject({
        response: { error: { code: 'COS-TADM-001' } },
      });
      expect(callsMatching(tx.$executeRaw, 'platform.audit_logs')).toHaveLength(0);
      expect(keycloak.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('keeps the account and reports invite_sent false when the email cannot be sent', async () => {
      activeTenant();
      tx.$queryRaw.mockResolvedValueOnce([]);
      keycloak.sendPasswordResetEmail.mockRejectedValueOnce(new Error('SMTP down'));

      const result = await run();

      expect(result).toEqual({
        user_id: USER_ID,
        email: EMAIL,
        invite_sent: false,
        invite_expires_at: null,
      });
    });

    it('reports invite_sent false for a non-Error rejection too', async () => {
      activeTenant();
      tx.$queryRaw.mockResolvedValueOnce([]);
      keycloak.sendPasswordResetEmail.mockRejectedValueOnce('timeout');

      expect((await run()).invite_sent).toBe(false);
    });
  });

  // Resend and cancel share one precondition: phase 1 reads on the client and asks Keycloak; phase 2 re-checks
  // under the lock in a transaction. Reads in order — client: tenant · admins · account · bootstrap row;
  // transaction: tenant FOR SHARE · admins.
  const ONE = [{ user_id: USER_ID, never_signed_in: true }];
  const reads = (
    over: {
      tenant?: unknown[];
      admins?: unknown[];
      user?: unknown[];
      bootstrapped?: unknown[];
      adminsNow?: unknown[];
      /** Seconds since the tenant's latest invitation (resend only); null = none. Default: long ago. */
      ageSeconds?: number | null;
    } = {},
  ) => {
    prisma.$queryRaw
      .mockResolvedValueOnce(over.tenant ?? [{ is_active: true, keycloak_realm: REALM }])
      .mockResolvedValueOnce(over.admins ?? ONE)
      .mockResolvedValueOnce(over.user ?? [{ keycloak_user_id: KC_ID, email: EMAIL }]);
    // The bootstrap-row read runs in its own transaction (it needs the RLS GUC), then phase 2.
    tx.$queryRaw
      .mockResolvedValueOnce(over.bootstrapped ?? [{ found: 1 }])
      .mockResolvedValueOnce([{ is_active: true, keycloak_realm: REALM }])
      .mockResolvedValueOnce(over.adminsNow ?? ONE)
      .mockResolvedValueOnce([
        { age_seconds: over.ageSeconds === undefined ? 3_600 : over.ageSeconds },
      ]);
  };

  const refusalOf = async (p: Promise<unknown>) => {
    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    return (err as ConflictException).getResponse() as {
      error: { code: string; details: { tenant_admin_count: number; reason: string } };
    };
  };

  describe('resendInvite', () => {
    const run = () => service.resendInvite(TENANT_ID, ACTOR_ID, JUSTIFICATION);

    beforeEach(() => {
      prisma.$transaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) =>
        fn(tx),
      );
    });

    it('asks Keycloak outside the transaction, re-checks under the lock, audits, then emails', async () => {
      reads();
      const order: string[] = [];
      keycloak.hasAnyCredential.mockImplementationOnce(async () => {
        order.push('keycloak-read');
        return false;
      });
      prisma.$transaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => {
        order.push('tx');
        return fn(tx);
      });
      tx.$executeRawUnsafe.mockImplementation(async () => {
        order.push('guc');
      });
      tx.$executeRaw.mockImplementation(async (strings: TemplateStringsArray) => {
        const sql = strings.join('?');
        if (sql.includes('pg_advisory_xact_lock')) order.push('lock');
        if (sql.includes('platform.audit_logs')) order.push('audit');
      });
      keycloak.sendPasswordResetEmail.mockImplementationOnce(async () => {
        order.push('email');
      });

      const result = await run();

      // tx 1: the bootstrap-row read (GUC first, for audit_logs' RLS); then Keycloak, outside any transaction;
      // tx 2: lock, GUC, re-check, cooldown, audit; the email after commit.
      expect(order).toEqual([
        'tx',
        'guc',
        'keycloak-read',
        'tx',
        'lock',
        'guc',
        'guc',
        'audit',
        'email',
      ]);
      expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.current_tenant_id = '${TENANT_ID}'`,
      );
      expect(sqlOf(prisma.$queryRaw.mock.calls[2] as unknown[])).toContain('AND is_active');
      const bootstrapRead = tx.$queryRaw.mock.calls[0] as unknown[];
      expect(sqlOf(bootstrapRead)).toContain("action = 'tenant.bootstrap_admin'");
      expect(bootstrapRead).toContain(USER_ID);
      expect(sqlOf(tx.$queryRaw.mock.calls[1] as unknown[])).toContain('FOR SHARE');
      expect(keycloak.hasAnyCredential).toHaveBeenCalledWith(KC_ID, REALM);
      const audit = callsMatching(tx.$executeRaw, 'platform.audit_logs');
      expect(audit[0]![3]).toBe('tenant.resend_admin_invite');
      expect(JSON.parse(audit[0]![5] as string)).toEqual({
        justification: JUSTIFICATION,
        user_id: USER_ID,
      });
      expect(keycloak.sendPasswordResetEmail).toHaveBeenCalledWith(KC_ID, REALM, 259_200);
      expect(result).toMatchObject({ user_id: USER_ID, email: EMAIL, invite_sent: true });
      expect(result.invite_expires_at).toBeInstanceOf(Date);
    });

    // Round 4 (D12): at most one invitation per tenant every 5 minutes, read from the audit trail under the lock.
    it('429 COS-TADM-005 within 5 minutes of the last invitation — nothing written or sent', async () => {
      reads({ ageSeconds: 120 });
      const err = await run().catch((e: unknown) => e);
      expect((err as { getStatus: () => number }).getStatus()).toBe(429);
      expect((err as { getResponse: () => unknown }).getResponse()).toEqual({
        error: {
          code: 'COS-TADM-005',
          message:
            'An invitation was sent a moment ago. Wait a few minutes before sending another.',
          messageKey: 'admin.tenantAdmin.error.resendTooSoon',
          details: { retry_after_seconds: 180 },
        },
      });
      const cooldownRead = sqlOf(tx.$queryRaw.mock.calls[3] as unknown[]);
      expect(cooldownRead).toContain(
        "action IN ('tenant.bootstrap_admin', 'tenant.resend_admin_invite')",
      );
      // A send that failed after the last invitation releases the cooldown at once.
      expect(cooldownRead).toContain("action = 'tenant.admin_invite_not_sent'");
      expect(cooldownRead).toContain('clock_timestamp()');
      expect(callsMatching(tx.$executeRaw, 'platform.audit_logs')).toHaveLength(0);
      expect(keycloak.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it.each([
      ['exactly 5 minutes', 300],
      ['no earlier invitation on record', null],
    ])('sends after %s', async (_l, age) => {
      reads({ ageSeconds: age });
      expect((await run()).invite_sent).toBe(true);
    });

    it('refuses with the full COS-TADM-002 envelope', async () => {
      reads({ admins: [] });
      expect(await refusalOf(run())).toEqual({
        error: {
          code: 'COS-TADM-002',
          message:
            'The invitation can be resent only to the tenant administrator created by Construction OS, while it is unused.',
          messageKey: 'admin.tenantAdmin.error.notResendable',
          details: { tenant_admin_count: 0, reason: 'admin_count' },
        },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it.each([
      ['two administrators', { admins: [...ONE, { user_id: 'b' }] }, 2, 'admin_count'],
      ['an account no longer active', { user: [] }, 1, 'admin_count'],
      ['a customer-made administrator', { bootstrapped: [] }, 1, 'not_bootstrapped'],
    ])('409 for %s, before the lock is taken', async (_l, over, count, reason) => {
      reads(over);
      expect((await refusalOf(run())).error.details).toEqual({ tenant_admin_count: count, reason });
      expect(callsMatching(tx.$executeRaw, 'pg_advisory_xact_lock')).toHaveLength(0);
      expect(keycloak.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('409 invitation_used once the account holds any credential', async () => {
      reads();
      keycloak.hasAnyCredential.mockResolvedValueOnce(true);
      expect((await refusalOf(run())).error.details.reason).toBe('invitation_used');
      expect(callsMatching(tx.$executeRaw, 'pg_advisory_xact_lock')).toHaveLength(0);
    });

    it('409 when another administrator appeared before the lock — nothing written', async () => {
      reads({ adminsNow: [...ONE, { user_id: 'new' }] });
      expect((await refusalOf(run())).error.details).toEqual({
        tenant_admin_count: 2,
        reason: 'admin_count',
      });
      expect(callsMatching(tx.$executeRaw, 'platform.audit_logs')).toHaveLength(0);
    });

    it('409 when the only administrator is now someone else', async () => {
      reads({ adminsNow: [{ user_id: 'other', never_signed_in: true }] });
      expect((await refusalOf(run())).error.details.reason).toBe('admin_count');
    });

    it('a failed email still leaves the recorded request and reports invite_sent false', async () => {
      reads();
      keycloak.sendPasswordResetEmail.mockRejectedValueOnce(new Error('SMTP down'));
      expect(await run()).toEqual({
        user_id: USER_ID,
        email: EMAIL,
        invite_sent: false,
        invite_expires_at: null,
      });
      // The request, then the failure — which releases the cooldown for the next resend.
      expect(callsMatching(tx.$executeRaw, 'platform.audit_logs').map((c) => c[3])).toEqual([
        'tenant.resend_admin_invite',
        'tenant.admin_invite_not_sent',
      ]);
    });

    it('a failure to record the failed send is logged, not thrown', async () => {
      reads();
      keycloak.sendPasswordResetEmail.mockRejectedValueOnce(new Error('SMTP down'));
      let calls = 0;
      prisma.$transaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => {
        calls += 1;
        if (calls === 3) throw new Error('db down'); // tx 3 = the not-sent record
        return fn(tx);
      });
      expect((await run()).invite_sent).toBe(false);
    });

    it('a non-Error failure to record it is logged the same way', async () => {
      reads();
      keycloak.sendPasswordResetEmail.mockRejectedValueOnce(new Error('SMTP down'));
      let calls = 0;
      prisma.$transaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => {
        calls += 1;
        if (calls === 3) throw 'db down';
        return fn(tx);
      });
      expect((await run()).invite_sent).toBe(false);
    });

    it('404 / 400 for an unknown or deactivated tenant', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      await expect(run()).rejects.toBeInstanceOf(NotFoundException);
      prisma.$queryRaw.mockResolvedValueOnce([{ is_active: false, keycloak_realm: REALM }]);
      await expect(run()).rejects.toBeInstanceOf(BadRequestException);
    });

    it('400 when the tenant was deactivated between the phases', async () => {
      reads();
      tx.$queryRaw
        .mockReset()
        .mockResolvedValueOnce([{ found: 1 }])
        .mockResolvedValueOnce([{ is_active: false, keycloak_realm: REALM }]);
      await expect(run()).rejects.toBeInstanceOf(BadRequestException);
      expect(callsMatching(tx.$executeRaw, 'platform.audit_logs')).toHaveLength(0);
    });
  });

  // Round 2 (D6): a mistyped address is fixed by cancelling the unused invitation, then bootstrapping again.
  describe('cancelInvite', () => {
    const run = () => service.cancelInvite(TENANT_ID, ACTOR_ID, JUSTIFICATION);

    beforeEach(() => {
      prisma.$transaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) =>
        fn(tx),
      );
    });

    it('deactivates and audits in one transaction, then deletes the Keycloak account', async () => {
      reads();
      const order: string[] = [];
      tx.$executeRaw.mockImplementation(async (strings: TemplateStringsArray) => {
        const sql = strings.join('?');
        if (sql.includes('pg_advisory_xact_lock')) order.push('lock');
        if (sql.includes('UPDATE platform.users')) order.push('deactivate');
        if (sql.includes('platform.audit_logs')) order.push('audit');
      });
      keycloak.deleteUser.mockImplementationOnce(async () => {
        order.push('keycloak');
      });

      const result = await run();

      expect(order).toEqual(['lock', 'deactivate', 'audit', 'keycloak']);
      const deactivate = callsMatching(tx.$executeRaw, 'UPDATE platform.users')[0]!;
      expect(sqlOf(deactivate)).toContain('is_active = false');
      expect(deactivate).toContain(USER_ID);
      const audit = callsMatching(tx.$executeRaw, 'platform.audit_logs');
      expect(audit[0]![3]).toBe('tenant.cancel_admin_invite');
      expect(JSON.parse(audit[0]![5] as string)).toEqual({
        justification: JUSTIFICATION,
        user_id: USER_ID,
      });
      expect(keycloak.deleteUser).toHaveBeenCalledWith(KC_ID, REALM);
      expect(keycloak.disableUser).not.toHaveBeenCalled();
      expect(keycloak.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(result).toEqual({ user_id: USER_ID, email: EMAIL, keycloak: 'deleted' });
    });

    it('a Keycloak 404 means the account is already gone', async () => {
      reads();
      keycloak.deleteUser.mockRejectedValueOnce({ response: { status: 404 } });
      expect((await run()).keycloak).toBe('deleted');
      expect(keycloak.disableUser).not.toHaveBeenCalled();
    });

    it('disables the Keycloak account when the delete fails', async () => {
      reads();
      keycloak.deleteUser.mockRejectedValueOnce(new Error('keycloak busy'));
      expect((await run()).keycloak).toBe('disabled');
      expect(keycloak.disableUser).toHaveBeenCalledWith(KC_ID, REALM);
    });

    it('reports failed when both the delete and the disable fail', async () => {
      reads();
      keycloak.deleteUser.mockRejectedValueOnce('timeout');
      keycloak.disableUser.mockRejectedValueOnce(new Error('keycloak down'));
      expect((await run()).keycloak).toBe('failed');
    });

    it('reports failed for a non-Error disable failure too', async () => {
      reads();
      keycloak.deleteUser.mockRejectedValueOnce(null);
      keycloak.disableUser.mockRejectedValueOnce('down');
      expect((await run()).keycloak).toBe('failed');
    });

    it('refuses with the full COS-TADM-003 envelope and writes nothing', async () => {
      reads({ bootstrapped: [] });
      expect(await refusalOf(run())).toEqual({
        error: {
          code: 'COS-TADM-003',
          message:
            'Only an unused invitation to the tenant administrator created by Construction OS can be cancelled.',
          messageKey: 'admin.tenantAdmin.error.notCancellable',
          details: { tenant_admin_count: 1, reason: 'not_bootstrapped' },
        },
      });
      expect(keycloak.deleteUser).not.toHaveBeenCalled();
    });

    it('409 COS-TADM-003 once the invitation has been used', async () => {
      reads();
      keycloak.hasAnyCredential.mockResolvedValueOnce(true);
      expect((await refusalOf(run())).error).toMatchObject({
        code: 'COS-TADM-003',
        details: { reason: 'invitation_used' },
      });
    });
  });
});
