// Phase 2: Authentication + Tenant System
// Path A: SMS OTP (SITE_WORKER, SITE_ENGINEER) — OtpService + IdentityService
// Path B: Keycloak OIDC (office roles) — KeycloakJwtStrategy + JwtAuthGuard

import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { OtpService } from './otp/otp.service';
import { KeycloakJwtStrategy } from './strategies/keycloak-jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'keycloak-jwt' }),
    JwtModule.register({
      // Path A tokens are signed with symmetric key for OTP users.
      // Path B tokens (Keycloak) are RS256 — validated via JWKS in KeycloakJwtStrategy.
      secret: process.env['JWT_SECRET'] ?? 'cos-dev-secret-change-in-production',
      signOptions: { algorithm: 'HS256' },
    }),
  ],
  controllers: [IdentityController],
  providers: [IdentityService, OtpService, KeycloakJwtStrategy, JwtAuthGuard],
  exports: [IdentityService, JwtAuthGuard, PassportModule],
})
export class IdentityModule {}
