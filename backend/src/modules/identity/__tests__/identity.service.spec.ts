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
