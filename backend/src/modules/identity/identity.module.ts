// Phase 2: Authentication + Tenant System
// Path A: SMS OTP (SITE_WORKER, SITE_ENGINEER) — OtpService + IdentityService + KeycloakAdminService
// Path B: Keycloak OIDC (office roles) — KeycloakJwtStrategy + JwtAuthGuard
// All JWTs are RS256-signed by Keycloak — no symmetric HS256 signing (spec §5.4.1, QM-4).

import { Module, forwardRef } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { NotificationModule } from '../notification/notification.module';
import { FilesModule } from '../files/files.module';
import { TenantModule } from '../tenant/tenant.module';
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
import { TrustScoreService } from './device-trust/trust-score/trust-score.service';
import {
  AttestationVerifierRegistry,
  attestationVerifiersProvider,
} from './device-trust/attestation-verifier.provider';
import { UnconfiguredAttestationVerifier } from './device-trust/adapters/unconfigured-attestation.adapter';
import { PlayIntegrityVerifier } from './device-trust/adapters/play-integrity.adapter';
import { AppAttestVerifier } from './device-trust/adapters/app-attest.adapter';
import {
  SubjectRequestController,
  SubjectVerifyPublicController,
} from './subject-request/subject-request.controller';
import { SendGridAdapter } from '../notification/adapters/sendgrid.adapter';
import { SubjectVerificationService } from './subject-request/subject-verification.service';
import { SubjectVerifyTokenGuard } from './subject-request/subject-verify-token.guard';
import { SubjectRequestService } from './subject-request/subject-request.service';
import { SubjectRequestRepository } from './subject-request/subject-request.repository';
import {
  PrivacyInquiryAdminController,
  PrivacyInquiryPublicController,
} from './privacy-inquiry/privacy-inquiry.controller';
import { PrivacyInquiryService } from './privacy-inquiry/privacy-inquiry.service';
import { PrivacyPolicyController } from './privacy-policy/privacy-policy.controller';
import { PrivacyPolicyService } from './privacy-policy/privacy-policy.service';
import { TermsOfUseController } from './terms-of-use/terms-of-use.controller';
import { TermsOfUseService } from './terms-of-use/terms-of-use.service';
import { ConsentController } from './consent/consent.controller';
import { ConsentService } from './consent/consent.service';
import { GeoIpService } from './network-origin/geoip.service';
import { NetworkOriginService } from './network-origin/network-origin.service';
import { KeycloakJwtStrategy } from './strategies/keycloak-jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  // NotificationModule: NotificationService for step-up challenges (routed through the service per
  // master:5041 since 2026-08-26 — it used to reach for SendGridAdapter and left no row in
  // notifications.notifications), and SendGridAdapter for ONE remaining caller, subject-request.
  // That one cannot use the service: its recipient is a crm.contacts row matched by email, not a
  // platform user, and notifications.recipient_id is a NOT NULL UUID naming a platform user.
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
    // forwardRef because this import CLOSES A CYCLE: identity → files → tenant → identity.
    // TenantModule has always imported IdentityModule (its controllers use JwtAuthGuard, and
    // UserService uses KeycloakAdminService); FilesModule imports TenantModule; and ADR-078 added
    // this edge so the export can upload through File Service. Without the lazy reference, whichever
    // module the ESM graph reaches first evaluates its @Module decorator while another is still
    // initialising and receives `undefined` in `imports` — the application then fails to bootstrap
    // with "The module at index [0] is of type undefined".
    //
    // NOT CAUGHT BY THE UNIT SUITE, and that is the lesson rather than the fix: no test instantiates
    // AppModule, so every module-level test passed while the compiled application could not start.
    // `app.module.spec.ts` now boots the real graph.
    forwardRef(() => FilesModule),
    // NetworkOriginService injects TenantPrismaService (ADR-080's attendance query runs under
    // `SET LOCAL app.current_tenant_id`, so RLS is what confines it to one tenant rather than a
    // WHERE clause). TenantModule exports it, and TenantModule already imports this one — so this
    // edge is circular by construction and needs the same lazy reference.
    //
    // Its absence did not fail a single unit test: every spec constructs NetworkOriginService with
    // `new` and hands it a mock, which is the right way to test the service and says nothing about
    // whether the container can build it.
    forwardRef(() => TenantModule),
  ],
  controllers: [
    IdentityController,
    ConsentController,
    DataExportController,
    // ADR-090: the tenant's own compliance desk for subject requests from people with no account.
    SubjectRequestController,
    SubjectVerifyPublicController,
    // ADR-091: the pre-auth inquiry channel. The PUBLIC controller is the one route in this module a
    // stranger can reach without a token of any kind — not even a magic link — so its class carries
    // no guard by design and is kept separate from the SYSTEM_ADMIN reads beside it.
    PrivacyInquiryPublicController,
    PrivacyInquiryAdminController,
    // Public and deliberately NOT flag-gated: a notice you must authenticate to read is not a notice,
    // and the inquiry kill-switch must not take the policy document down with it.
    PrivacyPolicyController,
    // The login footer's other legal document, public on the same terms (ADR-092).
    TermsOfUseController,
  ],
  providers: [
    // Request-scoped: SubjectRequestRepository resolves tenant_id per request (REQUEST + CLS
    // fallback, ADR-031), the same shape CrmRepository uses.
    SubjectRequestService,
    SubjectVerificationService,
    SubjectVerifyTokenGuard,
    // Singleton, and it owns its own PrismaClient: `platform.privacy_inquiries` has no tenant_id, so
    // there is no request scope to resolve and TenantPrismaService would reject it (ADR-091).
    PrivacyInquiryService,
    // Builds the policy PDF once and caches it — the document has no per-request input.
    PrivacyPolicyService,
    // Same, for the Terms of Use (ADR-092).
    TermsOfUseService,
    SendGridAdapter,
    SubjectRequestRepository,
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
    // ADR-081's day-one path. Not a stopgap: it is the control the DeviceTrustModel must beat on
    // PR-AUC before it may replace it, so it is maintained permanently rather than deleted on
    // promotion. Depends on GeoIpService for the ASN-stability signal (ADR-080).
    TrustScoreService,
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
