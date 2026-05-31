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
      cos_tenant_id: 'tenant-1',
      cos_tenant_code: 'acme',
      cos_role: 'PROJECT_MANAGER',
      cos_user_id: 'user-1',
      iss: 'http://localhost:8090/realms/construction-os',
      aud: 'cos-backend',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    };

    it('returns payload when all required COS claims present', () => {
      const result = strategy.validate(validPayload);
      expect(result).toBe(validPayload);
    });

    it('throws UnauthorizedException when cos_tenant_id is missing', () => {
      const payload = { ...validPayload, cos_tenant_id: undefined } as never;
      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when cos_role is missing', () => {
      const payload = { ...validPayload, cos_role: undefined } as never;
      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
    });

    it('throws with message about missing COS claims', () => {
      const payload = { ...validPayload, cos_tenant_id: undefined } as never;
      expect(() => strategy.validate(payload)).toThrow('Missing required COS claims in JWT');
    });
  });
});
