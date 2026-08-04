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
import { smsSenderProvider } from './otp/sms-sender.provider';
import { DeviceTrustService } from './device-trust/device-trust.service';
import { ConsentController } from './consent/consent.controller';
import { ConsentService } from './consent/consent.service';
import { KeycloakJwtStrategy } from './strategies/keycloak-jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'keycloak-jwt' })],
  controllers: [IdentityController, ConsentController],
  providers: [
    KeycloakAdminService,
    IdentityService,
    MfaService,
    // ADR-040: the SMS gateway is a port chosen by SMS_PROVIDER, not a hardcoded SNS client —
    // otherwise Path A login is impossible in an air-gapped deployment.
    smsSenderProvider,
    OtpService,
    DeviceTrustService,
    ConsentService,
    KeycloakJwtStrategy,
    JwtAuthGuard,
  ],
  // ConsentService is exported because the write paths it gates live in other modules — site-ops,
  // workforce and finance all persist consent-basis PII (ADR-079), so they inject requireConsent().
  exports: [
    IdentityService,
    KeycloakAdminService,
    MfaService,
    ConsentService,
    JwtAuthGuard,
    PassportModule,
  ],
})
export class IdentityModule {}
