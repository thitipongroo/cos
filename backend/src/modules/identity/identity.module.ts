// Phase 2: Authentication + Tenant System
// Path A: SMS OTP (SITE_WORKER, SITE_ENGINEER) — OtpService + IdentityService + KeycloakAdminService
// Path B: Keycloak OIDC (office roles) — KeycloakJwtStrategy + JwtAuthGuard
// All JWTs are RS256-signed by Keycloak — no symmetric HS256 signing (spec §5.4.1, QM-4).

import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { NotificationModule } from '../notification/notification.module';
import { FilesModule } from '../files/files.module';
import { StepUpService } from './step-up/step-up.service';
import { DataExportController } from './data-export/data-export.controller';
import { DataExportService } from './data-export/data-export.service';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { KeycloakAdminService } from './keycloak-admin.service';
import { MfaService } from './mfa/mfa.service';
import { OtpService } from './otp/otp.service';
import { smsSenderProvider } from './otp/sms-sender.provider';
import { DeviceTrustService } from './device-trust/device-trust.service';
import {
  AttestationVerifierRegistry,
  attestationVerifiersProvider,
} from './device-trust/attestation-verifier.provider';
import { UnconfiguredAttestationVerifier } from './device-trust/adapters/unconfigured-attestation.adapter';
import { PlayIntegrityVerifier } from './device-trust/adapters/play-integrity.adapter';
import { AppAttestVerifier } from './device-trust/adapters/app-attest.adapter';
import { ConsentController } from './consent/consent.controller';
import { ConsentService } from './consent/consent.service';
import { GeoIpService } from './network-origin/geoip.service';
import { NetworkOriginService } from './network-origin/network-origin.service';
import { KeycloakJwtStrategy } from './strategies/keycloak-jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  // NotificationModule is imported for its SendGridAdapter alone (ADR-078 step-up email channel).
  // No cycle: NotificationModule declares no `imports`, and app.module already instantiates it, so
  // this adds a DI edge rather than a second instance. Cross-module DI is the sanctioned direction
  // here (master §Architecture: "Module-to-module: Direct NestJS module dependency injection"),
  // matching finance→FilesModule and sync→SiteOpsModule.
  // FilesModule for FileServiceClient: the export archive is uploaded through File Service and
  // referenced by id, because master fixes Main App <-> File Service as REST and the backend has no
  // MinIO client (ADR-078 correction). Same DI edge as finance→FilesModule.
  imports: [
    PassportModule.register({ defaultStrategy: 'keycloak-jwt' }),
    NotificationModule,
    FilesModule,
  ],
  controllers: [IdentityController, ConsentController, DataExportController],
  providers: [
    KeycloakAdminService,
    IdentityService,
    MfaService,
    // ADR-040: the SMS gateway is a port chosen by SMS_PROVIDER, not a hardcoded SNS client —
    // otherwise Path A login is impossible in an air-gapped deployment.
    smsSenderProvider,
    OtpService,
    // ADR-082/083: platform attestation is a port, because Android and iOS are two entirely
    // different protocols — Play Integrity is a service-account call to Google, App Attest is local
    // certificate-chain cryptography — and an air-gapped deployment has neither. Both verifiers
    // self-disable to UNAVAILABLE without their configuration, and anything unhandled falls through
    // to UnconfiguredAttestationVerifier, which never blocks a login (§32.9 Type B).
    PlayIntegrityVerifier,
    AppAttestVerifier,
    attestationVerifiersProvider,
    UnconfiguredAttestationVerifier,
    AttestationVerifierRegistry,
    DeviceTrustService,
    ConsentService,
    GeoIpService,
    NetworkOriginService,
    StepUpService,
    DataExportService,
    KeycloakJwtStrategy,
    JwtAuthGuard,
  ],
  // ConsentService is exported because the write paths it gates live in other modules — site-ops,
  // workforce and finance all persist consent-basis PII (ADR-079), so they inject requireConsent().
  // StepUpService is NOT exported for the data export: that endpoint ended up here, not in the tenant
  // module as this comment previously said. DataExportController sits alongside ConsentController
  // because the whole feature — collector, serializer, workflow — is in this module, and only the
  // `users/me` PATH is shared with the tenant module's UserMeController. It stays exported for the
  // next high-value action, which may well live elsewhere.
  exports: [
    IdentityService,
    KeycloakAdminService,
    MfaService,
    ConsentService,
    StepUpService,
    JwtAuthGuard,
    PassportModule,
  ],
})
export class IdentityModule {}
