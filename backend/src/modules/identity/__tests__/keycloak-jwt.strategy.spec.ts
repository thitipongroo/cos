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

    it('returns payload when all required claims present', () => {
      const result = strategy.validate(validPayload);
      expect(result).toBe(validPayload);
    });

    it('throws UnauthorizedException when tenant_id is missing', () => {
      const payload = { ...validPayload, tenant_id: undefined } as never;
      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when role is missing', () => {
      const payload = { ...validPayload, role: undefined } as never;
      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
    });

    it('throws with message about missing claims', () => {
      const payload = { ...validPayload, tenant_id: undefined } as never;
      expect(() => strategy.validate(payload)).toThrow('Missing required claims in JWT');
    });
  });
});
