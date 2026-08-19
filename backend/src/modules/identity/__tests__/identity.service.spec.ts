// Unit tests for IdentityService — Keycloak Direct Grant (Path A), refresh proxy, logout proxy

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $queryRaw: jest.fn(),
    $disconnect: jest.fn(),
  })),
}));

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { IdentityService } from '../identity.service';
import { KeycloakAdminService } from '../keycloak-admin.service';
import { PrismaClient } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';
import type { KeycloakTokenResponse } from '../keycloak-admin.service';

const mockKeycloakResponse: KeycloakTokenResponse = {
  access_token: 'new-access-token',
  refresh_token: 'new-refresh-token',
  expires_in: 900,
  refresh_expires_in: 604800,
  token_type: 'Bearer',
};

const mockUser = {
  user_id: 'user-uuid-1',
  tenant_id: 'tenant-uuid-1',
  keycloak_user_id: 'kc-uuid-1',
  role: 'SITE_WORKER',
  keycloak_realm: 'tenant-acme',
};

// Build a minimal JWT with a JSON payload for testing extractRealmFromToken
function buildJwt(payload: object): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `header.${b64}.signature`;
}

describe('IdentityService', () => {
  let service: IdentityService;
  let keycloakAdmin: jest.Mocked<KeycloakAdminService>;
  let prismaMock: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    keycloakAdmin = {
      exchangeOtpForTokens: jest.fn(),
      refreshToken: jest.fn(),
      revokeToken: jest.fn(),
    } as unknown as jest.Mocked<KeycloakAdminService>;

    service = new IdentityService(keycloakAdmin);
    prismaMock = (service as unknown as { prisma: jest.Mocked<PrismaClient> }).prisma;
  });

  describe('issueTokensForPhone', () => {
    it('issues access + refresh tokens via Keycloak Direct Grant', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([mockUser]);
      keycloakAdmin.exchangeOtpForTokens.mockResolvedValue(mockKeycloakResponse);

      const result = await service.issueTokensForPhone('+66812345678');

      expect(keycloakAdmin.exchangeOtpForTokens).toHaveBeenCalledWith(
        mockUser.keycloak_user_id,
        '+66812345678',
        mockUser.keycloak_realm,
        expect.any(String), // ephemeral UUID — generated fresh each call
      );
      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 900,
        refreshExpiresIn: 604800,
      });
    });

    it('throws UnauthorizedException when phone not found in DB', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]);

      await expect(service.issueTokensForPhone('+66800000000')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(keycloakAdmin.exchangeOtpForTokens).not.toHaveBeenCalled();
    });

    // The query used to be `LIMIT 1` with no ORDER BY, so a phone number on two rows authenticated
    // the caller into whichever tenant PostgreSQL happened to return — silently, and not necessarily
    // the same one next time. The database now forbids the duplicate (20260819000001), but this path
    // must not go back to guessing if that index is ever absent: a restored snapshot from before the
    // migration, or its rollback, would put the rows back.
    it('refuses to issue tokens when one phone resolves to two accounts, instead of picking one', async () => {
      const other = { ...mockUser, user_id: 'user-2', tenant_id: 'tenant-2' };
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([mockUser, other]);

      await expect(service.issueTokensForPhone('+66812345678')).rejects.toThrow(
        UnauthorizedException,
      );
      // The point of the fix: no token is minted for EITHER tenant.
      expect(keycloakAdmin.exchangeOtpForTokens).not.toHaveBeenCalled();
    });

    it('reports the ambiguity as COS-AUTH-101 without echoing the phone number', async () => {
      const other = { ...mockUser, user_id: 'user-2', tenant_id: 'tenant-2' };
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([mockUser, other]);

      await expect(service.issueTokensForPhone('+66812345678')).rejects.toMatchObject({
        response: { error: { code: 'COS-AUTH-101', messageKey: 'auth.phone.ambiguous' } },
      });
    });
  });

  describe('refreshAccessToken', () => {
    it('proxies refresh grant to Keycloak and returns rotated access + refresh tokens', async () => {
      const refreshToken = buildJwt({ iss: 'http://localhost:8090/realms/tenant-acme' });
      keycloakAdmin.refreshToken.mockResolvedValue(mockKeycloakResponse);

      const result = await service.refreshAccessToken(refreshToken);

      expect(keycloakAdmin.refreshToken).toHaveBeenCalledWith(refreshToken, 'tenant-acme');
      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 900,
        refreshExpiresIn: 604800,
      });
    });

    it('throws UnauthorizedException when token has no parseable iss claim', async () => {
      const noIssToken = buildJwt({ sub: 'user-1' }); // missing iss
      await expect(service.refreshAccessToken(noIssToken)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when token is not a valid JWT', async () => {
      await expect(service.refreshAccessToken('not-a-jwt')).rejects.toThrow(UnauthorizedException);
    });
  });

  // The realm is pulled out of an UNVERIFIED token — refresh and logout are unauthenticated, and
  // extractRealmFromToken base64-decodes the payload without checking a signature. It is then
  // interpolated into the Keycloak URL by KeycloakAdminService, so `iss` is a request-forgery
  // primitive unless the extracted realm is constrained. Found by CodeQL js/request-forgery.
  describe('realm extracted from an untrusted token', () => {
    it.each([
      ['parent-directory traversal', '..'],
      ['embedded traversal', '..%2f..%2fadmin'],
      ['a path segment with a slash-ish escape', 'realm%2fadmin'],
      ['an absolute URL', 'http:'],
      ['a query-string smuggle', 'realm?x=1'],
      ['a fragment smuggle', 'realm#x'],
      ['a space', 'my realm'],
    ])('rejects %s', async (_label, realm) => {
      const token = buildJwt({ iss: `http://localhost:8090/realms/${realm}` });

      await expect(service.refreshAccessToken(token)).rejects.toThrow(UnauthorizedException);
      expect(keycloakAdmin.refreshToken).not.toHaveBeenCalled();
    });

    it.each([['construction-os'], ['tenant-acme'], ['tenant_1'], ['tenant.eu']])(
      'accepts the realm name %s',
      async (realm) => {
        keycloakAdmin.refreshToken.mockResolvedValue(mockKeycloakResponse);
        const token = buildJwt({ iss: `http://localhost:8090/realms/${realm}` });

        await service.refreshAccessToken(token);

        expect(keycloakAdmin.refreshToken).toHaveBeenCalledWith(token, realm);
      },
    );
  });

  describe('logout', () => {
    it('revokes refresh token at Keycloak', async () => {
      const refreshToken = buildJwt({ iss: 'http://localhost:8090/realms/tenant-acme' });
      keycloakAdmin.revokeToken.mockResolvedValue(undefined);

      await service.logout(refreshToken);

      expect(keycloakAdmin.revokeToken).toHaveBeenCalledWith(refreshToken, 'tenant-acme');
    });

    it('silently ignores unparseable token during logout', async () => {
      await expect(service.logout('bad-token')).resolves.toBeUndefined();
      expect(keycloakAdmin.revokeToken).not.toHaveBeenCalled();
    });
  });
});

describe('IdentityService onModuleDestroy', () => {
  it('disconnects Prisma on shutdown', async () => {
    const svc = new IdentityService({} as never);
    await svc.onModuleDestroy();
    expect(
      (svc as unknown as { prisma: { $disconnect: jest.Mock } }).prisma.$disconnect,
    ).toHaveBeenCalledTimes(1);
  });
});
