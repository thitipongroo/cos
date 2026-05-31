// Unit tests for IdentityService — token issuance, refresh, logout

const redisMock: Record<string, string> = {};

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    set: jest.fn(async (key: string, val: string) => { redisMock[key] = val; return 'OK'; }),
    get: jest.fn(async (key: string) => redisMock[key] ?? null),
    del: jest.fn(async (...keys: string[]) => { keys.forEach(k => delete redisMock[k]); return 1; }),
  })),
);

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $queryRaw: jest.fn(),
    $disconnect: jest.fn(),
  })),
}));

import { IdentityService } from '../identity.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';

const mockUser = { user_id: 'user-1', tenant_id: 'tenant-1', tenant_code: 'acme', role: 'SITE_WORKER' };

describe('IdentityService', () => {
  let service: IdentityService;
  let jwtService: jest.Mocked<JwtService>;
  let prismaMock: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    Object.keys(redisMock).forEach(k => delete redisMock[k]);
    jwtService = {
      sign: jest.fn().mockReturnValue('mock-token'),
      verify: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;
    service = new IdentityService(jwtService);
    prismaMock = (service as unknown as { prisma: jest.Mocked<PrismaClient> }).prisma;
  });

  describe('issueTokensForPhone', () => {
    it('issues access and refresh tokens for known user', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([mockUser]);
      const result = await service.issueTokensForPhone('+66812345678');
      expect(result.accessToken).toBe('mock-token');
      expect(result.refreshToken).toBe('mock-token');
      expect(result.expiresIn).toBe(900);
      expect(jwtService.sign).toHaveBeenCalledTimes(2);
    });

    it('throws UnauthorizedException when user not found', async () => {
      (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]);
      await expect(service.issueTokensForPhone('+66812345678')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshAccessToken', () => {
    it('issues new access token for valid non-revoked refresh token', async () => {
      const payload = {
        sub: 'user-1', cos_user_id: 'user-1', cos_tenant_id: 'tenant-1',
        cos_tenant_code: 'acme', cos_role: 'SITE_WORKER',
      };
      jwtService.verify = jest.fn().mockReturnValue(payload);
      const refreshToken = 'valid-refresh-12345678';
      redisMock[`refresh:user-1:${refreshToken.slice(-8)}`] = 'user-1';

      const result = await service.refreshAccessToken(refreshToken);
      expect(result.accessToken).toBe('mock-token');
      expect(result.expiresIn).toBe(900);
    });

    it('throws UnauthorizedException for revoked refresh token', async () => {
      const payload = { sub: 'user-1', cos_user_id: 'user-1' };
      jwtService.verify = jest.fn().mockReturnValue(payload);
      // No Redis entry = revoked
      await expect(service.refreshAccessToken('revoked-token-12345678')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for invalid/expired token', async () => {
      jwtService.verify = jest.fn().mockImplementation(() => { throw new Error('jwt expired'); });
      await expect(service.refreshAccessToken('bad-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('deletes refresh token from Redis', async () => {
      const payload = { sub: 'user-1', cos_user_id: 'user-1' };
      jwtService.verify = jest.fn().mockReturnValue(payload);
      const refreshToken = 'valid-refresh-12345678';
      redisMock[`refresh:user-1:${refreshToken.slice(-8)}`] = 'user-1';

      await service.logout(refreshToken);
      expect(redisMock[`refresh:user-1:${refreshToken.slice(-8)}`]).toBeUndefined();
    });

    it('silently ignores invalid token during logout', async () => {
      jwtService.verify = jest.fn().mockImplementation(() => { throw new Error('invalid'); });
      await expect(service.logout('bad-token')).resolves.toBeUndefined();
    });
  });
});
