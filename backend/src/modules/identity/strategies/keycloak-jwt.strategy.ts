// Path B — Keycloak OIDC JWT validation strategy.
// Validates RS256-signed JWTs issued by Keycloak via JWKS endpoint.
// No session store — stateless validation (QM-4).

import { Injectable, UnauthorizedException, OnModuleDestroy } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
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

@Injectable()
export class KeycloakJwtStrategy
  extends PassportStrategy(Strategy, 'keycloak-jwt')
  implements OnModuleDestroy
{
  // Tenant resolution happens here (during JWT auth), NOT in a pre-auth middleware —
  // NestJS runs middleware before guards, so a middleware can never see req.user.
  private readonly platformPrisma = createPrismaClient();

  /** Close the Prisma connection on shutdown so the query-engine socket does not leak. */
  async onModuleDestroy(): Promise<void> {
    await this.platformPrisma.$disconnect();
  }

  // QM-15 kill switch for ADR-077 (see AUTHORITATIVE_ROLE_CHECK_FLAG below). Optional so the many
  // unit tests that construct this strategy directly keep working; absent means "flag on", matching
  // the registry default.
  constructor(private readonly flags?: FeatureFlagService) {
    const keycloakUrl = process.env['KEYCLOAK_URL'] ?? 'http://localhost:8090';
    const realm = process.env['KEYCLOAK_REALM'] ?? 'construction-os';
    // JWKS is fetched from the URL the backend can reach (e.g. the internal Docker
    // hostname http://keycloak:8080). The token `iss` claim, however, reflects Keycloak's
    // public/front-channel URL as seen by the browser (e.g. http://localhost:8090), which
    // can differ. Validate `iss` against KEYCLOAK_ISSUER when set (split-horizon deploys);
    // otherwise fall back to the JWKS URL's issuer. Signing keys are identical either way.
    const jwksIssuer = `${keycloakUrl}/realms/${realm}`;
    const issuer = process.env['KEYCLOAK_ISSUER'] ?? jwksIssuer;

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: `${jwksIssuer}/protocol/openid-connect/certs`,
      }),
      issuer,
      audience: process.env['KEYCLOAK_AUDIENCE'] ?? 'cos-backend',
    });
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
        role: string | null;
      }>
    >`
      SELECT t.tenant_code, t.dedicated_db_url, m.role
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
