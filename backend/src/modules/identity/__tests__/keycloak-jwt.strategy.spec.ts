// Unit tests for KeycloakJwtStrategy.validate()
// Constructor calls passportJwtSecret (network) — tested via validate() only.

jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

import { UnauthorizedException } from '@nestjs/common';
import { KeycloakJwtStrategy } from '../strategies/keycloak-jwt.strategy';
import type { JwtPayload } from '../jwt.payload';

describe('KeycloakJwtStrategy', () => {
  let strategy: KeycloakJwtStrategy;

  beforeEach(() => {
    strategy = new KeycloakJwtStrategy();
  });

  describe('validate', () => {
    const validPayload: JwtPayload = {
      sub: 'user-1',
      jti: 'jwt-id-1',
      tenant_id: 'tenant-1',
      user_id: 'user-1',
      role: 'PROJECT_MANAGER',
      iss: 'http://localhost:8090/realms/construction-os',
      aud: 'cos-backend',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    };

    // validate() is async: after the claim check it queries platform.tenants to confirm the tenant
    // is active and enrich req.user with tenant_code / dedicated_db_url. Stub that query per test.
    const stubTenantQuery = (
      rows: Array<{ tenant_code: string; dedicated_db_url: string | null }>,
    ) => {
      (strategy as unknown as { platformPrisma: { $queryRaw: jest.Mock } }).platformPrisma = {
        $queryRaw: jest.fn().mockResolvedValue(rows),
      };
    };

    it('returns enriched user when claims present and tenant active', async () => {
      stubTenantQuery([{ tenant_code: 'acme', dedicated_db_url: null }]);
      const result = await strategy.validate(validPayload);
      expect(result.tenantCode).toBe('acme');
      expect(result.tenant_id).toBe('tenant-1');
      expect(result.dedicatedDbUrl).toBeUndefined();
    });

    it('passes through a dedicated DB URL when present', async () => {
      stubTenantQuery([{ tenant_code: 'acme', dedicated_db_url: 'postgres://dedicated' }]);
      const result = await strategy.validate(validPayload);
      expect(result.dedicatedDbUrl).toBe('postgres://dedicated');
    });

    it('throws UnauthorizedException when tenant_id is missing', async () => {
      const payload = { ...validPayload, tenant_id: undefined } as never;
      await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when role is missing', async () => {
      const payload = { ...validPayload, role: undefined } as never;
      await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
    });

    it('throws with message about missing claims', async () => {
      const payload = { ...validPayload, tenant_id: undefined } as never;
      await expect(strategy.validate(payload)).rejects.toThrow('Missing required claims in JWT');
    });

    it('throws UnauthorizedException when the tenant is not found or inactive', async () => {
      stubTenantQuery([]);
      await expect(strategy.validate(validPayload)).rejects.toThrow('Tenant not found or inactive');
    });
  });
});
