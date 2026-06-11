// Unit tests — KeycloakAdminService
// KcAdminClient is resolved via moduleNameMapper to a CJS jest.fn() stub,
// allowing per-test instance control without ESM incompatibility.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import KcAdminClient from '@keycloak/keycloak-admin-client';
import { UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { KeycloakAdminService } from '../keycloak-admin.service';

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
    users: { create: jest.Mock; del: jest.Mock; resetPassword: jest.Mock };
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
});
