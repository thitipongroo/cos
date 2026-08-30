// Unit tests for KeycloakJwtStrategy.validate()
// Constructor calls passportJwtSecret (network) — tested via validate() only.

jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

import { UnauthorizedException } from '@nestjs/common';
import { KeycloakJwtStrategy, realmFromIssuer } from '../strategies/keycloak-jwt.strategy';
import type { JwtPayload } from '../../../shared/context/jwt-payload';

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
      rows: Array<{
        tenant_code: string;
        dedicated_db_url: string | null;
        keycloak_realm?: string;
        role?: string | null;
      }>,
    ) => {
      (strategy as unknown as { platformPrisma: { $queryRaw: jest.Mock } }).platformPrisma = {
        // keycloak_realm defaults to the realm the fixture token is issued by — the binding check
        // (OQ-51) rejects a row whose realm is not the token's, so it can no longer be omitted.
        $queryRaw: jest
          .fn()
          .mockResolvedValue(rows.map((r) => ({ keycloak_realm: 'construction-os', ...r }))),
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
      function withFlag(enabled: boolean, rows: Array<Record<string, unknown>>) {
        const s = new KeycloakJwtStrategy({ isEnabled: () => enabled } as never);
        (s as unknown as { platformPrisma: { $queryRaw: jest.Mock } }).platformPrisma = {
          $queryRaw: jest
            .fn()
            .mockResolvedValue(rows.map((r) => ({ keycloak_realm: 'construction-os', ...r }))),
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

// ─── Multi-issuer + tenant binding (TDD OQ-51) ─────────────────────────────
//
// §7.6 gives ENTERPRISE tenants a dedicated realm and `platform.tenants.keycloak_realm` is
// NOT NULL UNIQUE, so the platform already decides which realm a tenant belongs to. Validation used
// to ignore that entirely: one `issuer` from one env var, and `validate()` never read the column.
// Two failures followed — a dedicated-realm token could not authenticate at all, and inside the one
// accepted realm the `tenant_id` claim was believed with nothing tying it to the issuer.
describe('realmFromIssuer', () => {
  it('reads the realm out of a Keycloak issuer', () => {
    expect(realmFromIssuer('https://kc.example/realms/cos-acme')).toBe('cos-acme');
    expect(realmFromIssuer('https://kc.example/realms/cos-acme/')).toBe('cos-acme');
  });

  it('returns null for anything that is not a realm issuer', () => {
    // The binding check compares against this. A parser that returned a truthy value for a
    // non-Keycloak issuer would compare rubbish to a real realm name.
    expect(realmFromIssuer('https://accounts.google.com')).toBeNull();
    expect(realmFromIssuer(undefined)).toBeNull();
    expect(realmFromIssuer('')).toBeNull();
  });
});

describe('KeycloakJwtStrategy — issuer bound to tenant', () => {
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

  function strategyWithRow(row: Record<string, unknown>) {
    const s = new KeycloakJwtStrategy();
    (s as unknown as { platformPrisma: { $queryRaw: jest.Mock } }).platformPrisma = {
      $queryRaw: jest.fn().mockResolvedValue([row]),
    } as never;
    return s;
  }

  const ACME = {
    tenant_code: 'acme',
    dedicated_db_url: null,
    keycloak_realm: 'cos-acme',
    role: 'PROJECT_MANAGER',
  };

  it("accepts a dedicated-realm token whose realm is the tenant's", async () => {
    // The case that could not work at all before: an ENTERPRISE tenant on cos-acme.
    const s = strategyWithRow(ACME);
    const payload = { ...validPayload, iss: 'http://localhost:8090/realms/cos-acme' };

    await expect(s.validate(payload)).resolves.toMatchObject({ tenantCode: 'acme' });
  });

  it('REJECTS a token from one realm claiming a tenant registered to another', async () => {
    // The unbound claim. `tenant_id` is a Keycloak user attribute, so whoever can create users in a
    // trusted realm picks its value; without this check a second realm could name someone else's
    // tenant. This is the shape of the Keycloak security-policy CVE that verified signatures but
    // never tied `iss` to the configured realm.
    const s = strategyWithRow(ACME);
    const payload = { ...validPayload, iss: 'http://localhost:8090/realms/cos-globex' };

    await expect(s.validate(payload)).rejects.toThrow('Tenant or user not found or inactive');
  });

  it('rejects a token with no issuer at all', async () => {
    const s = strategyWithRow(ACME);
    const payload = { ...validPayload, iss: undefined } as never;

    await expect(s.validate(payload)).rejects.toThrow('Tenant or user not found or inactive');
  });

  // The message must not differ from the inactive-tenant rejection: a caller that could tell them
  // apart could map which realm a tenant belongs to by probing.
  it('gives the same message as every other rejection in this path', async () => {
    const s = strategyWithRow(ACME);
    const mismatch = await s
      .validate({ ...validPayload, iss: 'http://localhost:8090/realms/other' })
      .catch((e: Error) => e.message);
    const inactive = await strategyWithRow({ ...ACME, role: null })
      .validate({ ...validPayload, iss: 'http://localhost:8090/realms/cos-acme' })
      .catch((e: Error) => e.message);

    expect(mismatch).toBe(inactive);
  });
});

describe('KeycloakJwtStrategy — trusted-issuer allowlist', () => {
  function strategyWithRealms(realms: string[]) {
    const s = new KeycloakJwtStrategy();
    (s as unknown as { platformPrisma: { $queryRaw: jest.Mock } }).platformPrisma = {
      $queryRaw: jest.fn().mockResolvedValue(realms.map((r) => ({ keycloak_realm: r }))),
    } as never;
    return s;
  }

  /** A syntactically valid unsigned JWT — enough to exercise routing, which never verifies. */
  function tokenFor(iss: string): string {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    return `${b64({ alg: 'RS256', kid: 'k1' })}.${b64({ iss })}.sig`;
  }

  function resolve(s: KeycloakJwtStrategy, token: string) {
    return (s as unknown as { resolveSigningKey(t: string): Promise<string> }).resolveSigningKey(
      token,
    );
  }

  it('refuses a realm no active tenant is registered to, before any network call', async () => {
    const s = strategyWithRealms(['construction-os']);
    await expect(resolve(s, tokenFor('https://evil.example/realms/attacker'))).rejects.toThrow(
      'Token issuer is not trusted',
    );
  });

  it('refuses an issuer that is not a Keycloak realm issuer', async () => {
    const s = strategyWithRealms(['construction-os']);
    await expect(resolve(s, tokenFor('https://accounts.google.com'))).rejects.toThrow(
      'not a Keycloak realm issuer',
    );
  });

  it('refuses a token that is not a JWT at all', async () => {
    const s = strategyWithRealms(['construction-os']);
    await expect(resolve(s, 'not-a-token')).rejects.toThrow('not a Keycloak realm issuer');
  });

  // The allowlist is read from platform.tenants, not from configuration — that is what lets a newly
  // provisioned ENTERPRISE realm work without redeploying the backend.
  it('takes the allowlist from platform.tenants, and caches it', async () => {
    const s = strategyWithRealms(['cos-acme']);
    const prisma = (s as unknown as { platformPrisma: { $queryRaw: jest.Mock } }).platformPrisma;

    await resolve(s, tokenFor('https://kc/realms/nope')).catch(() => undefined);
    await resolve(s, tokenFor('https://kc/realms/nope')).catch(() => undefined);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = String((prisma.$queryRaw.mock.calls[0] as unknown[])[0]).replace(/\s+/g, ' ');
    expect(sql).toContain('SELECT keycloak_realm FROM platform.tenants');
    expect(sql).toContain('is_active = true');
  });
});
