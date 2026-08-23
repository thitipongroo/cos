// Path B — Keycloak OIDC JWT validation strategy.
// Validates RS256-signed JWTs issued by Keycloak via JWKS endpoint.
// No session store — stateless validation (QM-4).

import { Injectable, UnauthorizedException, OnModuleDestroy } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import jwksClient, { type JwksClient } from 'jwks-rsa';
import { createPrismaClient } from '../../../shared/prisma/create-prisma-client';
import { JwtPayload } from '../jwt.payload';
import { decryptDedicatedDbUrl } from '../../tenant/utils/dedicated-db-url-cipher';
import { FeatureFlagService } from '../../../shared/feature-flags/feature-flag.service';
import { createLogger } from '@cos/logger';

const logger = createLogger('keycloak-jwt-strategy');

/** QM-15 kill switch for ADR-077. Registered in DEFAULT_FLAGS (default ON). */
export const AUTHORITATIVE_ROLE_CHECK_FLAG = 's1.identity.authoritative-role-check';

// The object attached to req.user after successful auth: the JWT claims plus the
// tenant context resolved from the DB. TenantContextInterceptor copies these onto
// req.tenantId/tenantCode/... for the request-scoped contract the app reads.
export interface AuthenticatedUser extends JwtPayload {
  tenantCode: string;
  dedicatedDbUrl?: string;
}

/**
 * The realm named by an OIDC issuer, or null when the string is not a Keycloak issuer.
 *
 * Keycloak issuers are always `{base}/realms/{realm}`. Exported because the tenant-binding check in
 * `validate()` and the key lookup in `secretOrKeyProvider` must agree on the parse — a mismatch
 * between them would let a token pass one and fail the other.
 */
export function realmFromIssuer(iss: string | undefined): string | null {
  if (!iss) return null;
  const m = /\/realms\/([^/]+)\/?$/.exec(iss);
  return m ? decodeURIComponent(m[1]!) : null;
}

/**
 * Read `iss` and `kid` out of a JWT WITHOUT verifying it.
 *
 * Routing only — it decides which realm's signing key to fetch. Nothing here is trusted: an attacker
 * who rewrites `iss` or `kid` can only steer key SELECTION, and the wrong key fails the real
 * signature check that passport-jwt performs afterwards. An unknown realm never yields a key at all.
 *
 * Hand-rolled rather than `jsonwebtoken.decode` because `jsonwebtoken` is not a dependency of this
 * package and does not resolve under pnpm's strict layout — verified, not assumed.
 */
function decodeForRouting(token: string): { iss: string | null; kid: string | null } {
  const parts = token.split('.');
  if (parts.length !== 3) return { iss: null, kid: null };
  const json = (segment: string): Record<string, unknown> | null => {
    try {
      return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<
        string,
        unknown
      >;
    } catch {
      return null;
    }
  };
  const header = json(parts[0]!);
  const payload = json(parts[1]!);
  const iss = typeof payload?.['iss'] === 'string' ? (payload['iss'] as string) : null;
  const kid = typeof header?.['kid'] === 'string' ? (header['kid'] as string) : null;
  return { iss, kid };
}

/**
 * How long the trusted-realm allowlist is cached.
 *
 * The list changes only when a tenant is provisioned or deactivated, and it is read on every
 * request, so it cannot be a query per request. A minute is short enough that a deactivated tenant's
 * realm stops being trusted promptly, and it is not the only thing standing in the way: `validate()`
 * re-reads `platform.tenants.is_active` on every request regardless.
 */
const REALM_ALLOWLIST_TTL_MS = 60_000;

@Injectable()
export class KeycloakJwtStrategy
  extends PassportStrategy(Strategy, 'keycloak-jwt')
  implements OnModuleDestroy
{
  // Tenant resolution happens here (during JWT auth), NOT in a pre-auth middleware —
  // NestJS runs middleware before guards, so a middleware can never see req.user.
  private readonly platformPrisma = createPrismaClient();

  /** One JWKS client per realm — see jwksFor(). */
  private readonly jwksClients = new Map<string, JwksClient>();

  /** Realms with at least one active tenant, refreshed every REALM_ALLOWLIST_TTL_MS. */
  private realmAllowlist = new Set<string>();
  private realmAllowlistExpiry = 0;

  /** Close the Prisma connection on shutdown so the query-engine socket does not leak. */
  async onModuleDestroy(): Promise<void> {
    await this.platformPrisma.$disconnect();
  }

  // QM-15 kill switch for ADR-077 (see AUTHORITATIVE_ROLE_CHECK_FLAG below). Optional so the many
  // unit tests that construct this strategy directly keep working; absent means "flag on", matching
  // the registry default.
  constructor(private readonly flags?: FeatureFlagService) {
    // THE ISSUER IS NOT FIXED (TDD OQ-51). It used to be one value built from a single
    // KEYCLOAK_REALM env var, which contradicted the rest of the platform: §7.6 gives ENTERPRISE
    // tenants a dedicated realm `cos-{tenantCode}`, `platform.tenants.keycloak_realm` is
    // NOT NULL UNIQUE, and IdentityService already MINTS tokens against each tenant's own realm.
    // Only validation was single-realm, so a dedicated-realm token was rejected outright and the
    // feature could not work end to end.
    //
    // This is the standard resource-server multi-tenancy shape (Spring Security packages it as
    // JwtIssuerAuthenticationManagerResolver): resolve the token's `iss`, check it against a
    // TRUSTED-ISSUER ALLOWLIST, then fetch that issuer's JWKS. The allowlist is not a config list
    // here — it is `platform.tenants.keycloak_realm`, which is the repository that already decides
    // which realms exist.
    //
    // `issuer` is deliberately NOT passed to passport-jwt. A static option cannot express an
    // allowlist that changes when a tenant is provisioned, and it is not needed: an issuer outside
    // the allowlist never yields a signing key below, so verification fails before any claim is
    // read — and `validate()` then binds the issuer to the tenant the token claims.
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      secretOrKeyProvider: (_req, rawJwtToken: string, done) => {
        this.resolveSigningKey(rawJwtToken).then(
          (key) => done(null, key),
          (err: Error) => done(err),
        );
      },
      audience: process.env['KEYCLOAK_AUDIENCE'] ?? 'cos-backend',
    });
  }

  /**
   * The signing key for a token, chosen by the realm in its `iss` claim.
   *
   * Rejects before touching the network when the issuer is not a Keycloak issuer or names a realm no
   * active tenant is registered to — an unknown realm must not cause an outbound JWKS fetch to a
   * host an attacker picked.
   */
  private async resolveSigningKey(rawJwtToken: string): Promise<string> {
    const { iss, kid } = decodeForRouting(rawJwtToken);
    const realm = realmFromIssuer(iss ?? undefined);
    if (!realm) {
      throw new UnauthorizedException('Token issuer is not a Keycloak realm issuer');
    }
    if (!(await this.isTrustedRealm(realm))) {
      // Realm, not issuer, and no tenant id: the message must not confirm which realms exist.
      logger.warn(
        { realm },
        'auth.issuer.untrusted — no active tenant is registered to this realm',
      );
      throw new UnauthorizedException('Token issuer is not trusted');
    }
    const key = await this.jwksFor(realm).getSigningKey(kid ?? undefined);
    return key.getPublicKey();
  }

  /**
   * A JWKS client per realm, kept for the process lifetime.
   *
   * The URI is built from KEYCLOAK_URL and the realm — NOT from the token's `iss` host. That is the
   * split-horizon case the previous comment described and it still holds: JWKS is fetched over the
   * address the backend can reach (e.g. http://keycloak:8080 inside the cluster) while `iss` carries
   * the public front-channel URL a browser saw. Taking the host from `iss` would also let a token
   * point the backend at an arbitrary server.
   */
  private jwksFor(realm: string): JwksClient {
    const existing = this.jwksClients.get(realm);
    if (existing) return existing;
    const keycloakUrl = process.env['KEYCLOAK_URL'] ?? 'http://localhost:8090';
    const client = jwksClient({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
      jwksUri: `${keycloakUrl}/realms/${realm}/protocol/openid-connect/certs`,
    });
    this.jwksClients.set(realm, client);
    return client;
  }

  /** Is any ACTIVE tenant registered to this realm? Cached — this is on every request. */
  private async isTrustedRealm(realm: string): Promise<boolean> {
    if (Date.now() >= this.realmAllowlistExpiry) {
      const rows = await this.platformPrisma.$queryRaw<Array<{ keycloak_realm: string }>>`
        SELECT keycloak_realm FROM platform.tenants WHERE is_active = true
      `;
      this.realmAllowlist = new Set(rows.map((r) => r.keycloak_realm));
      this.realmAllowlistExpiry = Date.now() + REALM_ALLOWLIST_TTL_MS;
    }
    return this.realmAllowlist.has(realm);
  }

  // Passport sets the return value as req.user. (passReqToCallback is intentionally NOT
  // used — @nestjs/passport does not wire validate() when it is enabled.)
  //
  // The tenant, the USER's active flag and the user's EFFECTIVE ROLE are all resolved here, in one
  // query, on every request (security review F1b/F2b — supersedes the previous "stateless, don't
  // re-check the user" tradeoff; see ADR-077).
  //
  // Why the reversal: the `role` claim is minted by Keycloak from a user attribute, and
  // `platform.tenant_memberships` is the table the admin API actually writes. Trusting the claim meant
  // a demotion never took effect, and never re-reading `platform.users.is_active` meant a deactivated
  // user kept full access. Both are authorization decisions, so they must be read from the source of
  // truth at decision time — a claim minted minutes ago is a cache, and this one had no invalidation.
  //
  // The cost is zero extra round trips: a `platform.tenants` lookup already ran on every request, and
  // this is the same query with two joins added. `payload.role` is intentionally OVERWRITTEN rather
  // than compared — every downstream guard (RolesGuard, PermissionsGuard, SyncAuthGuard,
  // enforceMfaForPrivilegedRoles) reads `user.role`, so overwriting fixes all of them at once.
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload.tenant_id || !payload.role || !payload.user_id) {
      logger.warn({ sub: payload.sub }, 'JWT missing required claims (tenant_id, role, user_id)');
      throw new UnauthorizedException('Missing required claims in JWT');
    }

    // Tenant active + tenant_code (audit) + dedicated DB URL, LEFT JOINed to the caller's user row and
    // membership so the current active flag and current role come from the same read.
    //
    // LEFT, not INNER, so one query serves both flag states: the tenant half is always enforced, while
    // `role` / `user_active` come back NULL when the user is inactive, absent, or no longer a member.
    // With the kill switch off those NULLs are ignored and the token's own claim is trusted, exactly as
    // before ADR-077.
    const rows = await this.platformPrisma.$queryRaw<
      Array<{
        tenant_code: string;
        dedicated_db_url: string | null;
        keycloak_realm: string;
        role: string | null;
      }>
    >`
      SELECT t.tenant_code, t.dedicated_db_url, t.keycloak_realm, m.role
      FROM platform.tenants t
      LEFT JOIN platform.users u
        ON u.tenant_id = t.tenant_id
       AND u.user_id   = ${payload.user_id}::uuid
       AND u.is_active = true
      LEFT JOIN platform.tenant_memberships m
        ON m.tenant_id = t.tenant_id
       AND m.user_id   = u.user_id
      WHERE t.tenant_id = ${payload.tenant_id}::uuid
        AND t.is_active = true
      LIMIT 1
    `;
    if (!rows.length) {
      logger.warn({ tenantId: payload.tenant_id }, 'Tenant not found or inactive');
      throw new UnauthorizedException('Tenant or user not found or inactive');
    }

    const row = rows[0]!;

    // THE TOKEN'S REALM MUST BE THE TENANT'S REALM (TDD OQ-51).
    //
    // Signature and audience prove the token is genuine and meant for this API. Neither says anything
    // about WHICH TENANT it may act as — `tenant_id` is a Keycloak user attribute, so whoever can
    // create users in a trusted realm decides its value. Without this check a realm could mint a
    // token naming another realm's tenant, and the only reason that was not reachable before is
    // that exactly one issuer was accepted at all.
    //
    // The precedent is concrete: a Keycloak security-policy component verified signatures but never
    // tied `iss` to the configured realm, so a token from ANY realm — including one an attacker
    // controlled — was accepted by services configured for a different realm. Accepting multiple
    // issuers without this binding is how that is built by accident.
    const tokenRealm = realmFromIssuer(payload.iss);
    if (tokenRealm !== row.keycloak_realm) {
      // Realms, not tenant ids, and one message for both directions: a caller must not learn which
      // realm a tenant belongs to by probing.
      logger.error(
        { tokenRealm, tenantRealm: row.keycloak_realm, userId: payload.user_id },
        "auth.realm.mismatch — token issued by a realm that is not this tenant's",
      );
      throw new UnauthorizedException('Tenant or user not found or inactive');
    }

    const authoritative =
      this.flags?.isEnabled(AUTHORITATIVE_ROLE_CHECK_FLAG, {
        userId: payload.user_id,
        tenantId: payload.tenant_id,
      }) ?? true;

    // One rejection for both remaining failure modes (inactive/absent user, membership revoked). They
    // are deliberately not distinguished, and not distinguished from the inactive-tenant case above
    // either: telling an unauthenticated caller WHICH applies is a tenant/user enumeration oracle.
    if (authoritative && !row.role) {
      logger.warn(
        { tenantId: payload.tenant_id, userId: payload.user_id },
        'auth.rejected — user inactive or membership revoked',
      );
      throw new UnauthorizedException('Tenant or user not found or inactive');
    }

    // Kill switch off → fall back to the token's claim, i.e. pre-ADR-077 behaviour. This re-opens
    // findings F1b/F2b by design; it exists only as a <60s mitigation for an auth-path incident.
    const effectiveRole = authoritative ? row.role! : payload.role;
    if (row.role && row.role !== payload.role) {
      // Expected and benign right after a role change — the token still carries the old role while the
      // DB has the new one. Logged because a PERSISTENT stream of these means the Keycloak attribute
      // sync in UserService is failing, and tokens will stay stale for anything that reads them
      // outside this strategy.
      logger.info(
        { userId: payload.user_id, claimRole: payload.role, effectiveRole, authoritative },
        'auth.role.stale-claim — token role differs from platform.tenant_memberships',
      );
    }

    return {
      ...payload,
      role: effectiveRole,
      tenantCode: row.tenant_code,
      // Accepts ciphertext (s1.tenant.encrypted-db-url) or legacy plaintext — this value goes straight
      // into TenantPrismaService's connection pool, so it must be the usable URL (security review F5b).
      dedicatedDbUrl: row.dedicated_db_url
        ? decryptDedicatedDbUrl(row.dedicated_db_url)
        : undefined,
    };
  }
}
