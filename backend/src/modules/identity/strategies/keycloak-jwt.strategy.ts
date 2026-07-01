// Path B — Keycloak OIDC JWT validation strategy.
// Validates RS256-signed JWTs issued by Keycloak via JWKS endpoint.
// No session store — stateless validation (QM-4).

import { Injectable, UnauthorizedException, OnModuleDestroy } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { createPrismaClient } from '../../../shared/prisma/create-prisma-client';
import { JwtPayload } from '../jwt.payload';
import { createLogger } from '@cos/logger';

const logger = createLogger('keycloak-jwt-strategy');

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

  constructor() {
    const keycloakUrl = process.env['KEYCLOAK_URL'] ?? 'http://localhost:8090';
    const realm = process.env['KEYCLOAK_REALM'] ?? 'construction-os';
    const issuer = `${keycloakUrl}/realms/${realm}`;

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: `${issuer}/protocol/openid-connect/certs`,
      }),
      issuer,
      audience: process.env['KEYCLOAK_AUDIENCE'] ?? 'cos-backend',
    });
  }

  // Passport sets the return value as req.user. (passReqToCallback is intentionally NOT
  // used — @nestjs/passport does not wire validate() when it is enabled.)
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload.tenant_id || !payload.role) {
      logger.warn({ sub: payload.sub }, 'JWT missing required claims (tenant_id, role)');
      throw new UnauthorizedException('Missing required claims in JWT');
    }

    // Verify the tenant exists and is active; fetch tenant_code (audit) + dedicated DB URL.
    const tenant = await this.platformPrisma.$queryRaw<
      Array<{ tenant_code: string; dedicated_db_url: string | null }>
    >`
      SELECT tenant_code, dedicated_db_url FROM platform.tenants
      WHERE tenant_id = ${payload.tenant_id}::uuid
        AND is_active = true
      LIMIT 1
    `;
    if (!tenant.length) {
      logger.warn({ tenantId: payload.tenant_id }, 'Tenant not found or inactive');
      throw new UnauthorizedException('Tenant not found or inactive');
    }

    return {
      ...payload,
      tenantCode: tenant[0]!.tenant_code,
      dedicatedDbUrl: tenant[0]!.dedicated_db_url ?? undefined,
    };
  }
}
