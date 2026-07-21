// Identity Service — Phase 2
// Path A: OTP verified → Keycloak Direct Grant → RS256 JWT from Keycloak (spec §5.4.1)
// Path B: Keycloak OIDC — this service handles refresh/logout proxy only.
// Refresh token rotation: Keycloak handles natively (refreshTokenMaxReuse: 0 in realm JSON).

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
   */
  async issueTokensForPhone(phoneNumber: string): Promise<TokenResult> {
    const [user] = await this.prisma.$queryRaw<
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
      LIMIT 1
    `;

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
   * Keycloak rotates the refresh token natively (refreshTokenMaxReuse: 0).
   * Returns new access token + new refresh token.
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
