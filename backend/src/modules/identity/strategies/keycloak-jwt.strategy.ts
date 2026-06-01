// Path B — Keycloak OIDC JWT validation strategy.
// Validates RS256-signed JWTs issued by Keycloak via JWKS endpoint.
// No session store — stateless validation (QM-4).

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { JwtPayload } from '../jwt.payload';
import { createLogger } from '@cos/logger';

const logger = createLogger('keycloak-jwt-strategy');

@Injectable()
export class KeycloakJwtStrategy extends PassportStrategy(Strategy, 'keycloak-jwt') {
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

  validate(payload: JwtPayload): JwtPayload {
    if (!payload.tenant_id || !payload.role) {
      logger.warn({ sub: payload.sub }, 'JWT missing required claims (tenant_id, role)');
      throw new UnauthorizedException('Missing required claims in JWT');
    }
    return payload;
  }
}
