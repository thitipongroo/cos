// Identity Service — Phase 2
// Path A: OTP verified → Keycloak Direct Grant → RS256 JWT from Keycloak (spec §5.4.1)
// Path B: Keycloak OIDC — this service handles refresh/logout proxy only.
// Refresh token rotation: Keycloak issues single-use refresh tokens — the realm sets
// revokeRefreshToken=true + refreshTokenMaxReuse=0, so each refresh rotates the token and the old
// one is revoked (reuse detection). refreshAccessToken returns the new refresh_token; every client
// must persist it (web + mobile do) or the next refresh is rejected.

import { Injectable, UnauthorizedException, OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient } from '../../shared/prisma/create-prisma-client';
import { createLogger } from '@cos/logger';
import { KeycloakAdminService } from './keycloak-admin.service';
import type { KeycloakTokenResponse } from './keycloak-admin.service';

const logger = createLogger('identity-service');

export interface TokenResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

@Injectable()
export class IdentityService implements OnModuleDestroy {
  private readonly prisma = createPrismaClient();

  constructor(private readonly keycloakAdmin: KeycloakAdminService) {}

  /** Close the Prisma connection on shutdown so the query-engine socket does not leak. */
  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  /**
   * Issue Keycloak tokens for a verified OTP phone login (Path A).
   * Looks up user by phone_number → sets ephemeral credential → calls Direct Grant.
   *
   * A phone number identifies exactly ONE account — UserService.createUser rejects a second account
   * on the same number across every tenant, and migration 20260819000001 makes the database enforce
   * it. This method must not merely ASSUME that. It used to select `LIMIT 1` with no ORDER BY, so if
   * the invariant was ever broken (it had no database backstop until that migration, and seeds,
   * imports and manual fixes never went through UserService) PostgreSQL handed back an arbitrary row
   * — and an arbitrary row here is an arbitrary TENANT. The worker authenticates successfully, into
   * someone else's data, and not necessarily the same someone twice: row order is not stable across
   * a table rewrite or a plan change. There is nothing later in the flow to catch it, because from
   * that point the token is genuinely valid for the tenant it names.
   *
   * So: fetch two, and refuse to choose. An ambiguous number is a data-integrity incident, and the
   * only safe response to "which of these two people is calling?" is to answer neither.
   */
  async issueTokensForPhone(phoneNumber: string): Promise<TokenResult> {
    const matches = await this.prisma.$queryRaw<
      Array<{
        user_id: string;
        tenant_id: string;
        keycloak_user_id: string;
        role: string;
        keycloak_realm: string;
      }>
    >`
      SELECT u.user_id, u.tenant_id, u.keycloak_user_id, m.role, t.keycloak_realm
      FROM platform.users u
      JOIN platform.tenants t ON t.tenant_id = u.tenant_id
      JOIN platform.tenant_memberships m
        ON m.user_id = u.user_id AND m.tenant_id = u.tenant_id
      WHERE u.phone_number = ${phoneNumber}
        AND u.is_active = true AND t.is_active = true
      LIMIT 2
    `;

    // LIMIT 2, not 1: one extra row is all it takes to tell "this number identifies an account" from
    // "this number identifies more than one", and the check costs nothing when the invariant holds.
    if (matches.length > 1) {
      // ERROR, not WARN — this cannot happen while the unique index is in place, so it means the
      // index is missing (a database restored from before it, or a rollback) or the memberships join
      // fanned out. Either way a human needs to look. The phone number stays redacted: it is PII, and
      // the user_ids below are enough to find the rows.
      logger.error(
        { phone: '[REDACTED]', userIds: matches.map((m) => m.user_id) },
        'auth.ambiguous-phone — one phone number resolves to multiple active accounts; refusing login',
      );
      throw new UnauthorizedException({
        error: {
          code: 'COS-AUTH-101',
          message: 'This phone number is registered to more than one account. Contact support.',
          messageKey: 'auth.phone.ambiguous',
        },
      });
    }

    const user = matches[0];
    if (!user) {
      logger.warn({ phone: '[REDACTED]' }, 'OTP verified but user not found');
      throw new UnauthorizedException('User not found');
    }

    // globalThis.crypto is available in Node.js 19+ (no import needed)
    const ephemeralCredential = globalThis.crypto.randomUUID();
    const tokens = await this.keycloakAdmin.exchangeOtpForTokens(
      user.keycloak_user_id,
      phoneNumber,
      user.keycloak_realm,
      ephemeralCredential,
    );

    logger.info({ userId: user.user_id }, 'Tokens issued via Keycloak Direct Grant (Path A)');
    return toTokenResult(tokens);
  }

  /**
   * Proxy refresh_token grant to Keycloak.
   * Keycloak rotates the refresh token (revokeRefreshToken=true, refreshTokenMaxReuse=0): the old
   * token is single-use and revoked on rotation. Returns the new access token + new refresh token —
   * the caller must persist the new refresh token for the next refresh.
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenResult> {
    const realm = extractRealmFromToken(refreshToken);
    const tokens = await this.keycloakAdmin.refreshToken(refreshToken, realm);
    return toTokenResult(tokens);
  }

  /** Revoke refresh token at Keycloak logout endpoint. */
  async logout(refreshToken: string): Promise<void> {
    try {
      const realm = extractRealmFromToken(refreshToken);
      await this.keycloakAdmin.revokeToken(refreshToken, realm);
    } catch {
      // Token already invalid or unparseable — no-op
    }
  }
}

function toTokenResult(tokens: KeycloakTokenResponse): TokenResult {
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    refreshExpiresIn: tokens.refresh_expires_in,
  };
}

function extractRealmFromToken(token: string): string {
  try {
    const base64Payload = token.split('.')[1];
    if (!base64Payload) throw new Error('not a JWT');
    const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf8')) as {
      iss?: string;
    };
    const match = (payload.iss ?? '').match(/\/realms\/([^/]+)$/);
    // Charset-restricted, and `..` rejected explicitly.
    //
    // This realm is interpolated straight into the Keycloak URL by KeycloakAdminService, and the
    // token it comes from is NOT verified first — the payload is base64-decoded and parsed, so
    // `iss` is entirely attacker-controlled on the unauthenticated refresh and logout paths. The
    // `[^/]+` capture above stops a literal slash, but it happily returned `..`, which the URL
    // then normalised away: `${baseUrl}/realms/../protocol/...` reaches a different path on the
    // Keycloak host. Keycloak realm names are `[A-Za-z0-9._-]` (this deployment uses
    // `construction-os`), so constraining the charset costs nothing real.
    // Found by CodeQL js/request-forgery.
    const realm = match?.[1];
    if (realm && realm !== '..' && /^[A-Za-z0-9._-]+$/.test(realm)) return realm;
  } catch {
    // fall through
  }
  throw new UnauthorizedException('Cannot determine realm from token');
}
