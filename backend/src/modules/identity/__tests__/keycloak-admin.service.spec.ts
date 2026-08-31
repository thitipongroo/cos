// Unit tests — KeycloakAdminService
// KcAdminClient is resolved via moduleNameMapper to a CJS jest.fn() stub,
// allowing per-test instance control without ESM incompatibility.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import {
  UnauthorizedException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { KeycloakAdminService } from '../keycloak-admin.service';

// @keycloak/keycloak-admin-client is ESM-only; a static default import emits a require() of an ES
// module under CommonJS (TS1479, the same trap the production service dodges via dynamic import()).
// Acquire it via require() — jest's moduleNameMapper still redirects this to the CJS mock stub
// (src/__mocks__/keycloak-admin-client.js).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const KcAdminClient = require('@keycloak/keycloak-admin-client');

const MockKcAdminClient = KcAdminClient as unknown as jest.Mock;

const TOKEN_RESPONSE = {
  access_token: 'at-abc',
  refresh_token: 'rt-abc',
  expires_in: 900,
  refresh_expires_in: 604800,
  token_type: 'Bearer',
};

describe('KeycloakAdminService', () => {
  let service: KeycloakAdminService;
  let mockFetch: jest.SpyInstance;
  let mockKcInstance: {
    auth: jest.Mock;
    users: {
      create: jest.Mock;
      del: jest.Mock;
      resetPassword: jest.Mock;
      update: jest.Mock;
      logout: jest.Mock;
      findOne: jest.Mock;
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();

    process.env['KEYCLOAK_URL'] = 'http://kc:8090';
    process.env['KEYCLOAK_ADMIN_CLIENT_ID'] = 'cos-backend';
    process.env['KEYCLOAK_ADMIN_CLIENT_SECRET'] = 'secret';

    mockKcInstance = {
      auth: jest.fn().mockResolvedValue(undefined),
      users: {
        create: jest.fn().mockResolvedValue({ id: 'kc-created-id' }),
        del: jest.fn().mockResolvedValue(undefined),
        resetPassword: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        logout: jest.fn().mockResolvedValue(undefined),
        findOne: jest.fn().mockResolvedValue({
          id: 'kc-1',
          attributes: { tenant_id: ['t-1'], user_id: ['u-1'], role: ['SITE_WORKER'] },
        }),
      },
    };
    MockKcAdminClient.mockImplementation(() => mockKcInstance);

    mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(TOKEN_RESPONSE),
      text: jest.fn().mockResolvedValue(''),
    } as unknown as Response);

    service = new KeycloakAdminService();
  });

  afterEach(() => {
    mockFetch.mockRestore();
  });

  describe('constructor fallback defaults', () => {
    it('uses hardcoded defaults when env vars are absent (covers ?? false branches)', () => {
      delete process.env['KEYCLOAK_URL'];
      delete process.env['KEYCLOAK_ADMIN_CLIENT_ID'];
      delete process.env['KEYCLOAK_ADMIN_CLIENT_SECRET'];
      const svc = new KeycloakAdminService();
      expect((svc as unknown as { baseUrl: string }).baseUrl).toBe('http://localhost:8090');
      expect((svc as unknown as { clientId: string }).clientId).toBe('cos-backend');
      expect((svc as unknown as { clientSecret: string }).clientSecret).toBe(
        'cos-backend-secret-dev',
      );
    });

    it('throws in production when KEYCLOAK_ADMIN_CLIENT_SECRET is absent (fail-fast, no dev fallback)', () => {
      const prevEnv = process.env['NODE_ENV'];
      delete process.env['KEYCLOAK_ADMIN_CLIENT_SECRET'];
      process.env['NODE_ENV'] = 'production';
      try {
        expect(() => new KeycloakAdminService()).toThrow(
          'KEYCLOAK_ADMIN_CLIENT_SECRET must be set in production',
        );
      } finally {
        process.env['NODE_ENV'] = prevEnv;
      }
    });
  });

  describe('provisionPhoneUser', () => {
    it('creates Keycloak user (Path A) and returns keycloakUserId', async () => {
      const result = await service.provisionPhoneUser(
        '+66812345678',
        'สมชาย',
        'tenant-acme',
        'tenant-uuid-1',
        'user-uuid-1',
        'SITE_WORKER',
      );
      expect(result.keycloakUserId).toBe('kc-created-id');
      expect(mockKcInstance.users.create).toHaveBeenCalledWith(
        expect.objectContaining({ username: '+66812345678', enabled: true }),
      );
    });
  });

  describe('createEmailUser', () => {
    it('creates Keycloak user (Path B) and returns keycloakUserId', async () => {
      const result = await service.createEmailUser(
        'user@example.com',
        'วิชัย',
        'tenant-acme',
        'tenant-uuid-1',
        'user-uuid-1',
        'PROJECT_MANAGER',
      );
      expect(result.keycloakUserId).toBe('kc-created-id');
      expect(mockKcInstance.users.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'user@example.com', enabled: true }),
      );
    });
  });

  describe('exchangeOtpForTokens', () => {
    it('resets password credential and calls token endpoint, returns tokens', async () => {
      const result = await service.exchangeOtpForTokens(
        'kc-uuid-1',
        '+66812345678',
        'tenant-acme',
        'ephemeral-cred',
      );
      expect(mockKcInstance.users.resetPassword).toHaveBeenCalledWith({
        id: 'kc-uuid-1',
        credential: expect.objectContaining({ value: 'ephemeral-cred' }),
      });
      expect(result.access_token).toBe('at-abc');
    });

    // OFFLINE-FIRST (TDD OQ-14). Without this scope the refresh token carries the realm's SSO idle
    // window — measured at 1800s against Keycloak 26.6.4, i.e. THIRTY MINUTES, not the seven days
    // `00_master` § PHASE 2 promises. A worker who lost signal for half an hour came back to a dead
    // refresh token and had to redo SMS OTP, on a site with no signal to receive an SMS on. With the
    // scope, `refresh_expires_in` is 0 and the token's `typ` is `Offline`.
    it('asks for offline_access, so the refresh token survives a day underground', async () => {
      await service.exchangeOtpForTokens('kc-uuid-1', '+66812345678', 'tenant-acme', 'cred');

      // The body reaches fetch() already serialised, so parse it back rather than asserting on a
      // substring — 'offline_access' would also match a value that merely contains it.
      const body = new URLSearchParams(mockFetch.mock.calls[0]![1].body as string);
      expect(body.get('scope')).toBe('offline_access');
      expect(body.get('grant_type')).toBe('password');
    });

    // Path B is a browser session. A refresh token that never expires belongs on a field handset
    // that is expected to be offline for days, not in a tab on an office desktop — and least of all
    // on a TENANT_ADMIN's. The refresh proxy must not add the scope either: an offline session is
    // established at grant time and the rotation chain carries it, so adding it here would only
    // upgrade a Path B session that was never meant to have one.
    it('does NOT put offline_access on the refresh proxy', async () => {
      await service.refreshToken('rt-abc', 'tenant-acme');

      const body = new URLSearchParams(mockFetch.mock.calls[0]![1].body as string);
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('scope')).toBeNull();
    });

    // A REFUSAL IS NOT AN OUTAGE (TDD OQ-11). The realm's `Path B only - privileged roles` execution
    // declines a TENANT_ADMIN / FINANCE account on Direct Grant, and Keycloak reports that as
    // `invalid_grant` — the same shape as a wrong password. Reporting it as 503 told the caller the
    // platform was down while it was working exactly as designed.
    it('reports a declined grant as 401, not as an outage', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            error: 'invalid_grant',
            error_description: 'Invalid user credentials',
          }),
        ),
      } as unknown as Response);

      await expect(
        service.exchangeOtpForTokens('kc-uuid-1', '+66812345678', 'tenant-acme', 'cred'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('points a declined caller at email sign-in without saying why they were declined', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue(JSON.stringify({ error: 'invalid_grant' })),
      } as unknown as Response);

      const err = (await service
        .exchangeOtpForTokens('kc-uuid-1', '+66812345678', 'tenant-acme', 'cred')
        .catch((e: unknown) => e)) as UnauthorizedException;
      const body = err.getResponse() as { error: { code: string; message: string } };

      expect(body.error.code).toBe('COS-AUTH-001');
      expect(body.error.message).toContain('email sign-in');
      // `invalid_grant` covers both "this account may not use this path" and "wrong credential".
      // Distinguishing them here would let a caller enumerate privileged accounts by phone number.
      expect(body.error.message).not.toMatch(/TENANT_ADMIN|FINANCE|privileged|role/i);
    });

    // The distinction is the OAuth error code, not the HTTP status — a broken realm and a declined
    // grant both come back 4xx/5xx. A body that is not an OAuth error at all (an HTML error page from
    // a proxy, an empty response) must stay an outage.
    it('still reports a non-OAuth error body as an outage', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 502,
        text: jest.fn().mockResolvedValue('<html>502 Bad Gateway</html>'),
      } as unknown as Response);

      await expect(
        service.exchangeOtpForTokens('kc-uuid-1', '+66812345678', 'tenant-acme', 'cred'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('still reports a DIFFERENT OAuth error as an outage', async () => {
      // `invalid_client` means our own client credentials are wrong — a misconfiguration the operator
      // must see, not something the caller can act on by switching sign-in method.
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue(JSON.stringify({ error: 'invalid_client' })),
      } as unknown as Response);

      await expect(
        service.exchangeOtpForTokens('kc-uuid-1', '+66812345678', 'tenant-acme', 'cred'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('reports a Keycloak failure as 503, not 500 (PO decision 2026-08-06)', async () => {
      // Changed from InternalServerErrorException. A tenant pointing at a realm that does not exist,
      // an account missing from the realm and Keycloak being down used to be indistinguishable from
      // a bug in our own code — all three surfaced as `500 COS-GENERAL-500`. 503 says "dependency",
      // matching what AnalyticsService already does for ClickHouse.
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('server error'),
      } as unknown as Response);
      await expect(
        service.exchangeOtpForTokens('kc-uuid-1', '+66', 'tenant-acme', 'cred'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('carries COS-AUTH-503 and leaks nothing about the account', async () => {
      // The code is what an operator alerts on; the message must stay generic, because a caller
      // must not learn from an error whether a given phone number has a Keycloak account.
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: jest.fn().mockResolvedValue('Realm not found.'),
      } as unknown as Response);
      await expect(
        service.exchangeOtpForTokens('kc-uuid-1', '+66800000001', 'missing-realm', 'cred'),
      ).rejects.toMatchObject({
        // Nested under `error` on purpose — that is the only shape GlobalExceptionFilter passes
        // through. A flat { code, message } silently becomes COS-GENERAL-503 on the wire.
        response: { error: { code: 'COS-AUTH-503', message: 'Identity provider unavailable' } },
      });
    });
  });

  describe('refreshToken', () => {
    it('calls token refresh endpoint and returns tokens', async () => {
      const result = await service.refreshToken('rt-old', 'tenant-acme');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/protocol/openid-connect/token'),
        expect.any(Object),
      );
      expect(result.refresh_token).toBe('rt-abc');
    });

    it('throws UnauthorizedException when refresh token is invalid (covers refresh error branch)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue('invalid_grant'),
      } as unknown as Response);
      await expect(service.refreshToken('bad-token', 'tenant-acme')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('revokeToken', () => {
    it('calls Keycloak logout endpoint and resolves', async () => {
      await expect(service.revokeToken('rt-abc', 'tenant-acme')).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/protocol/openid-connect/logout'),
        expect.any(Object),
      );
    });

    it('logs warn but does not throw when logout endpoint returns non-ok (covers warn branch)', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 400 } as unknown as Response);
      await expect(service.revokeToken('expired-rt', 'tenant-acme')).resolves.toBeUndefined();
    });
  });

  describe('deleteUser', () => {
    it('deletes Keycloak user by id', async () => {
      await service.deleteUser('kc-uuid-1', 'tenant-acme');
      expect(mockKcInstance.users.del).toHaveBeenCalledWith({ id: 'kc-uuid-1' });
    });
  });

  // ─── Security review F1 — deactivation must revoke access at the identity store ───────────
  describe('disableUser', () => {
    it('disables the account and terminates every live session', async () => {
      await expect(service.disableUser('kc-uuid-1', 'tenant-acme')).resolves.toBeUndefined();

      expect(mockKcInstance.users.update).toHaveBeenCalledWith(
        { id: 'kc-uuid-1' },
        { enabled: false },
      );
      // enabled:false alone only blocks NEW logins — an existing refresh token would keep minting
      // access tokens until it expired, so the sessions must be killed too.
      expect(mockKcInstance.users.logout).toHaveBeenCalledWith({ id: 'kc-uuid-1' });
    });
  });

  // ─── Security review F2 — the JWT `role` claim is mapped from this user attribute ──────────
  describe('syncUserRole', () => {
    it('rewrites the role attribute while PRESERVING tenant_id and user_id', async () => {
      await expect(
        service.syncUserRole('kc-uuid-1', 'tenant-acme', 'PROJECT_MANAGER'),
      ).resolves.toBeUndefined();

      // Keycloak REPLACES the whole attribute map when `attributes` is present, so sending only
      // { role } would silently drop the two claims every guard and RLS transaction depends on.
      expect(mockKcInstance.users.update).toHaveBeenCalledWith(
        { id: 'kc-uuid-1' },
        {
          attributes: {
            tenant_id: ['t-1'],
            user_id: ['u-1'],
            role: ['PROJECT_MANAGER'],
          },
        },
      );
    });

    it('tolerates a Keycloak user that carries no attributes yet', async () => {
      mockKcInstance.users.findOne.mockResolvedValue({ id: 'kc-1' });

      await service.syncUserRole('kc-uuid-1', 'tenant-acme', 'FINANCE');

      expect(mockKcInstance.users.update).toHaveBeenCalledWith(
        { id: 'kc-uuid-1' },
        { attributes: { role: ['FINANCE'] } },
      );
    });

    it('throws when the Keycloak user does not exist — never writes a partial attribute map', async () => {
      mockKcInstance.users.findOne.mockResolvedValue(undefined);

      await expect(service.syncUserRole('missing', 'tenant-acme', 'FINANCE')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(mockKcInstance.users.update).not.toHaveBeenCalled();
    });
  });

  describe('setTemporaryPassword', () => {
    it('admin-resets the credential as temporary=true (forces UPDATE_PASSWORD at next sign-in)', async () => {
      await expect(
        service.setTemporaryPassword('kc-uuid-1', 'tenant-acme', 'Temp-Pass-123'),
      ).resolves.toBeUndefined();
      expect(mockKcInstance.users.resetPassword).toHaveBeenCalledWith({
        id: 'kc-uuid-1',
        credential: { type: 'password', value: 'Temp-Pass-123', temporary: true },
      });
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('sends an UPDATE_PASSWORD action email with the default 900s lifespan', async () => {
      const executeActionsEmail = jest.fn().mockResolvedValue(undefined);
      (mockKcInstance.users as unknown as { executeActionsEmail: jest.Mock }).executeActionsEmail =
        executeActionsEmail;
      await expect(
        service.sendPasswordResetEmail('kc-uuid-1', 'tenant-acme'),
      ).resolves.toBeUndefined();
      expect(executeActionsEmail).toHaveBeenCalledWith({
        id: 'kc-uuid-1',
        actions: ['UPDATE_PASSWORD'],
        lifespan: 900,
      });
    });

    it('honours a caller-supplied lifespan (covers the non-default lifespanSec branch)', async () => {
      const executeActionsEmail = jest.fn().mockResolvedValue(undefined);
      (mockKcInstance.users as unknown as { executeActionsEmail: jest.Mock }).executeActionsEmail =
        executeActionsEmail;
      await service.sendPasswordResetEmail('kc-uuid-2', 'tenant-acme', 600);
      expect(executeActionsEmail).toHaveBeenCalledWith(expect.objectContaining({ lifespan: 600 }));
    });
  });

  // GDPR/PDPA erasure of the identity side. The database rows are anonymised by
  // SubjectRequestService; this is the Keycloak half, and it is irreversible by design.
  it('ignores an OAuth error body whose `error` is not a string', async () => {
    // The body is whatever the token endpoint sent. A non-string `error` — a nested object, a
    // number — must read as "no code" rather than travelling with the exception, because the caller
    // branches on that code to tell a REFUSAL from an OUTAGE.
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: jest.fn().mockResolvedValue(JSON.stringify({ error: { code: 42 } })),
      json: jest.fn().mockResolvedValue({}),
    } as unknown as Response);

    const err = await service
      .exchangeOtpForTokens('kc-1', '0812345678', 'tenant-acme', 'otp-cred')
      .catch((e: unknown) => e);
    expect((err as { oauthError?: string | null }).oauthError ?? null).toBeNull();
  });

  describe('eraseUser', () => {
    it('disables and logs the user out BEFORE scrubbing their fields', async () => {
      // The scrub is several round-trips. A live refresh token would keep minting access tokens
      // through the middle of it, so the account is closed first and emptied second.
      const order: string[] = [];
      mockKcInstance.users.update.mockImplementation(async (_where, payload) => {
        order.push('enabled' in (payload as object) ? 'disable' : 'scrub');
      });
      mockKcInstance.users.logout.mockImplementation(async () => {
        order.push('logout');
      });

      await service.eraseUser('kc-1', 'tenant-acme', 'u-1');

      expect(order).toEqual(['disable', 'logout', 'scrub']);
    });

    it('replaces every identifying field with a value derived from the cos user id', async () => {
      await service.eraseUser('kc-1', 'tenant-acme', 'u-1');

      expect(mockKcInstance.users.update).toHaveBeenNthCalledWith(
        1,
        { id: 'kc-1' },
        { enabled: false },
      );
      expect(mockKcInstance.users.update).toHaveBeenNthCalledWith(
        2,
        { id: 'kc-1' },
        {
          username: 'erased-u-1',
          // .invalid is reserved by RFC 2606 and can never be delivered to, so the row keeps a
          // unique, well-formed email without it addressing anyone.
          email: 'erased-u-1@erased.invalid',
          firstName: 'ERASED',
          lastName: 'ERASED',
          emailVerified: false,
        },
      );
    });

    it('authenticates against the tenant realm it was given', async () => {
      await service.eraseUser('kc-1', 'tenant-acme', 'u-1');
      expect(mockKcInstance.auth).toHaveBeenCalled();
    });
  });
});
