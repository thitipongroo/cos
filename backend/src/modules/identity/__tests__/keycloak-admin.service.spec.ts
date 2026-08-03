// Unit tests — KeycloakAdminService
// KcAdminClient is resolved via moduleNameMapper to a CJS jest.fn() stub,
// allowing per-test instance control without ESM incompatibility.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
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

    it('throws InternalServerErrorException when token endpoint fails (covers non-refresh error branch)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('server error'),
      } as unknown as Response);
      await expect(
        service.exchangeOtpForTokens('kc-uuid-1', '+66', 'tenant-acme', 'cred'),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
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
});
