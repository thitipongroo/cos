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

  it('covers both KEYCLOAK_URL/REALM env-defined and default branches (lines 30-31)', () => {
    const origUrl = process.env['KEYCLOAK_URL'];
    const origRealm = process.env['KEYCLOAK_REALM'];
    try {
      // env-defined branch (left of ??)
      process.env['KEYCLOAK_URL'] = 'https://keycloak.example.com';
      process.env['KEYCLOAK_REALM'] = 'cos-acme';
      expect(() => new KeycloakJwtStrategy()).not.toThrow();
      // default branch (right of ??)
      delete process.env['KEYCLOAK_URL'];
      delete process.env['KEYCLOAK_REALM'];
      expect(() => new KeycloakJwtStrategy()).not.toThrow();
    } finally {
      if (origUrl === undefined) delete process.env['KEYCLOAK_URL'];
      else process.env['KEYCLOAK_URL'] = origUrl;
      if (origRealm === undefined) delete process.env['KEYCLOAK_REALM'];
      else process.env['KEYCLOAK_REALM'] = origRealm;
    }
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

    // validate() is async: after the claim check it runs ONE query joining platform.tenants to the
    // caller's platform.users row and tenant_membership, which confirms the tenant is active, that the
    // USER is still active, and yields the effective role (security review F1b/F2b). Stub it per test.
    const stubTenantQuery = (
      rows: Array<{ tenant_code: string; dedicated_db_url: string | null; role?: string | null }>,
    ) => {
      (strategy as unknown as { platformPrisma: { $queryRaw: jest.Mock } }).platformPrisma = {
        $queryRaw: jest.fn().mockResolvedValue(rows),
      };
    };

    it('returns enriched user when claims present and tenant active', async () => {
      stubTenantQuery([{ tenant_code: 'acme', dedicated_db_url: null, role: 'PROJECT_MANAGER' }]);
      const result = await strategy.validate(validPayload);
      expect(result.tenantCode).toBe('acme');
      expect(result.tenant_id).toBe('tenant-1');
      expect(result.dedicatedDbUrl).toBeUndefined();
    });

    it('passes through a dedicated DB URL when present', async () => {
      stubTenantQuery([
        {
          tenant_code: 'acme',
          dedicated_db_url: 'postgres://dedicated',
          role: 'PROJECT_MANAGER',
        },
      ]);
      const result = await strategy.validate(validPayload);
      expect(result.dedicatedDbUrl).toBe('postgres://dedicated');
    });

    // F2b — the DB is authoritative for role, not the token. A demotion written to
    // platform.tenant_memberships must take effect on the next request, without a re-login.
    it('overrides a stale role claim with the role from platform.tenant_memberships', async () => {
      stubTenantQuery([{ tenant_code: 'acme', dedicated_db_url: null, role: 'SITE_WORKER' }]);
      const result = await strategy.validate({ ...validPayload, role: 'TENANT_ADMIN' });
      expect(result.role).toBe('SITE_WORKER');
    });

    it('throws UnauthorizedException when user_id is missing', async () => {
      const payload = { ...validPayload, user_id: undefined } as never;
      await expect(strategy.validate(payload)).rejects.toThrow('Missing required claims in JWT');
    });

    // F1b — a deactivated user (or revoked membership) leaves the LEFT-JOINed role NULL, so auth fails
    // on the very next request instead of surviving until the access token expires.
    it('rejects when the user is inactive or the membership was revoked', async () => {
      stubTenantQuery([{ tenant_code: 'acme', dedicated_db_url: null, role: null }]);
      await expect(strategy.validate(validPayload)).rejects.toThrow(
        'Tenant or user not found or inactive',
      );
    });

    // ─── QM-15 kill switch (s1.identity.authoritative-role-check) ─────────────
    describe('kill switch', () => {
      /** Build a strategy whose flag service answers `enabled` for the ADR-077 switch. */
      function withFlag(enabled: boolean, rows: unknown[]) {
        const s = new KeycloakJwtStrategy({ isEnabled: () => enabled } as never);
        (s as unknown as { platformPrisma: { $queryRaw: jest.Mock } }).platformPrisma = {
          $queryRaw: jest.fn().mockResolvedValue(rows),
        };
        return s;
      }

      it('ON: rejects a deactivated user and uses the DB role', async () => {
        const s = withFlag(true, [
          { tenant_code: 'acme', dedicated_db_url: null, role: 'SITE_WORKER' },
        ]);
        await expect(s.validate({ ...validPayload, role: 'TENANT_ADMIN' })).resolves.toMatchObject({
          role: 'SITE_WORKER',
        });

        const inactive = withFlag(true, [
          { tenant_code: 'acme', dedicated_db_url: null, role: null },
        ]);
        await expect(inactive.validate(validPayload)).rejects.toThrow(UnauthorizedException);
      });

      // Reverting to pre-ADR-077 behaviour re-opens F1b/F2b on purpose — that is what a kill switch
      // for an auth-path incident means. Asserted so the revert stays deliberate and understood.
      it('OFF: falls back to the token claim and admits a user the DB no longer lists', async () => {
        const s = withFlag(false, [
          { tenant_code: 'acme', dedicated_db_url: null, role: 'SITE_WORKER' },
        ]);
        await expect(s.validate({ ...validPayload, role: 'TENANT_ADMIN' })).resolves.toMatchObject({
          role: 'TENANT_ADMIN',
        });

        const inactive = withFlag(false, [
          { tenant_code: 'acme', dedicated_db_url: null, role: null },
        ]);
        await expect(inactive.validate(validPayload)).resolves.toMatchObject({
          role: 'PROJECT_MANAGER',
        });
      });

      it('an inactive TENANT is rejected regardless of the switch', async () => {
        for (const enabled of [true, false]) {
          const s = withFlag(enabled, []);
          await expect(s.validate(validPayload)).rejects.toThrow(UnauthorizedException);
        }
      });
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
      await expect(strategy.validate(validPayload)).rejects.toThrow(
        'Tenant or user not found or inactive',
      );
    });
  });
});

describe('KeycloakJwtStrategy onModuleDestroy', () => {
  it('disconnects the platform Prisma client on shutdown', async () => {
    const strategy = new KeycloakJwtStrategy();
    const disconnect = jest.fn().mockResolvedValue(undefined);
    (strategy as unknown as { platformPrisma: { $disconnect: jest.Mock } }).platformPrisma = {
      $disconnect: disconnect,
    };
    await strategy.onModuleDestroy();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
