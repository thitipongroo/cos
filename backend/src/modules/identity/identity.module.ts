// Phase 2: Authentication + Tenant System
// Path A: SMS OTP (SITE_WORKER, SITE_ENGINEER) — OtpService + IdentityService + KeycloakAdminService
// Path B: Keycloak OIDC (office roles) — KeycloakJwtStrategy + JwtAuthGuard
// All JWTs are RS256-signed by Keycloak — no symmetric HS256 signing (spec §5.4.1, QM-4).

import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { KeycloakAdminService } from './keycloak-admin.service';
import { MfaService } from './mfa/mfa.service';
import { OtpService } from './otp/otp.service';
import { DeviceTrustService } from './device-trust/device-trust.service';
import { KeycloakJwtStrategy } from './strategies/keycloak-jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'keycloak-jwt' })],
  controllers: [IdentityController],
  providers: [
    KeycloakAdminService,
    IdentityService,
    MfaService,
    OtpService,
    DeviceTrustService,
    KeycloakJwtStrategy,
    JwtAuthGuard,
  ],
  exports: [IdentityService, KeycloakAdminService, MfaService, JwtAuthGuard, PassportModule],
})
export class IdentityModule {}
