// Device trust (§20.6.1) — the server-side fact behind the OTP screen's "trusted device" indicator.
//
// A device is trusted when it holds a non-extractable P-256 key (Secure Enclave / Android Keystore)
// whose SPKI public key is registered in platform.trusted_devices, is not revoked, has not expired,
// and proves possession by signing a fresh server challenge at OTP verify. Trust is EARNED: a new
// device is untrusted on its first login (the OTP is the authenticator) and enrols on success, so the
// next login from it is trusted. Mirrors the mainstream "remember this device" pattern.
//
// The challenge is a single-use nonce (Redis, OTP-length TTL). The signature is verified with
// node:crypto over the base64url-decoded challenge: ECDSA P-256 / SHA-256, IEEE-P1363 signature
// encoding — the exact contract react-native-secure-sign emits (verified against its native source).

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { createLogger } from '@cos/logger';
import { createPrismaClient } from '../../../shared/prisma/create-prisma-client';
import { AttestationVerifierRegistry } from './attestation-verifier.provider';
import type { AttestationVerdict, DeviceIntegrityLevel } from './attestation-verifier';
import { FeatureFlagService } from '../../../shared/feature-flags/feature-flag.service';

/**
 * QM-15 kill switch for the attestation path (ADR-082).
 *
 * Checked in code rather than as a `@FeatureFlag` route decorator: the guard answers 503, and a 503
 * on device enrolment would make a Google outage break enrolment — the exact coupling ADR-082
 * rejected when it declined to block login on failed attestation. Off means "do not ask", and the
 * columns are then left untouched, which is what they already mean.
 */
const ATTESTATION_FLAG = 's1.identity.device-attestation';

// node:crypto builtin via require() — the in-repo idiom for builtins (cf. otp.service.ts) so it
// resolves under CommonJS without a package.json dep.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { randomBytes, createPublicKey, verify } = require('crypto') as typeof import('crypto');

const logger = createLogger('device-trust-service');

const CHALLENGE_TTL_SECONDS = 300; // matches the OTP TTL — the challenge lives for one login attempt
const TRUST_WINDOW_DAYS = 30; // sliding: renewed on each trusted verify (§20.6.1)
const MS_PER_DAY = 86_400_000;

export interface TrustedDeviceSummary {
  deviceId: string;
  platform: string;
  model: string | null;
  lastSeenAt: Date;
  createdAt: Date;
  expiresAt: Date;
  /**
   * Platform attestation (ADR-082). `null` verdict means never attested — an enrolment predating
   * migration 20260805000001 — which the screen must render differently from UNAVAILABLE ("we asked,
   * no answer") and from FAILED ("we asked, it did not pass").
   */
  attestationVerdict: AttestationVerdict | null;
  /**
   * The integrity tier the screen renders instead of a patch date (ADR-083). Null on iOS, and
   * whenever no verdict was obtained. STRONG means the platform vouched for hardware-backed boot
   * integrity AND, on Android 13+, a security update within the last year.
   */
  integrityLevel: DeviceIntegrityLevel | null;
  attestedAt: Date | null;
  /** Play Integrity's verified `deviceAttributes.sdkVersion`. Null on iOS. Never client-reported. */
  osVersion: string | null;
}

/**
 * Why a device lost trust — mirrors platform."DeviceRevocationReason" (ADR-081).
 *
 * Ordered as the UI should offer them: the ordinary reasons first, the one with consequences last.
 */
export const REVOCATION_REASONS = [
  'USER_REVOKED',
  'ADMIN_REVOKED',
  'LOST_OR_STOLEN',
  'COMPROMISED',
] as const;
export type DeviceRevocationReason = (typeof REVOCATION_REASONS)[number];

/**
 * The ONE reason that is ADR-081's positive class.
 *
 * Exported so the labelling query and the UI copy read from the same constant. A second place that
 * decides which reasons "count as compromised" is how a model quietly starts training on lost phones.
 */
export const COMPROMISED_REASON: DeviceRevocationReason = 'COMPROMISED';

export function isRevocationReason(value: string): value is DeviceRevocationReason {
  return (REVOCATION_REASONS as readonly string[]).includes(value);
}

/**
 * ECDSA P-256 / SHA-256 verify of an IEEE-P1363 signature over the raw challenge bytes.
 * Pure and defensive: any malformed key/signature is a verification failure, never a throw.
 */
export function verifyDeviceSignature(
  publicKeyB64u: string,
  challengeB64u: string,
  signatureB64u: string,
): boolean {
  try {
    const publicKey = createPublicKey({
      key: Buffer.from(publicKeyB64u, 'base64url'),
      format: 'der',
      type: 'spki',
    });
    return verify(
      'sha256',
      Buffer.from(challengeB64u, 'base64url'),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signatureB64u, 'base64url'),
    );
  } catch {
    return false;
  }
}

@Injectable()
export class DeviceTrustService implements OnModuleDestroy {
  private readonly prisma = createPrismaClient();
  private readonly redis: Redis;

  constructor(
    private readonly attestation: AttestationVerifierRegistry,
    private readonly flags: FeatureFlagService,
  ) {
    this.redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.prisma.$disconnect(), this.redis.quit()]);
  }

  private challengeKey(phoneNumber: string, deviceId: string): string {
    return `devtrust:challenge:${phoneNumber}:${deviceId}`;
  }

  /**
   * Attestation challenges live in their OWN namespace, keyed by user rather than phone number.
   *
   * Deliberately not the `devtrust:challenge:*` key above. That one is minted pre-login against a
   * phone number and consumed by the P-256 signature check; this one is minted post-login against an
   * authenticated user id. Sharing a key would let one flow consume the other's nonce, and the two
   * have different lifetimes and different callers.
   */
  private attestChallengeKey(userId: string, deviceId: string): string {
    return `devtrust:attest:${userId}:${deviceId}`;
  }

  /**
   * Mint a single-use attestation challenge for an authenticated user's device.
   *
   * Both platforms are challenge-response and neither will produce anything useful without a nonce
   * the server can later recognise (ADR-083). 32 bytes from a CSPRNG — comfortably past Apple's
   * "at least 16 bytes, fresh, short-lived, single-use" guidance for App Attest.
   */
  async issueAttestationChallenge(userId: string, deviceId: string): Promise<string> {
    const challenge = randomBytes(32).toString('base64url');
    await this.redis.set(
      this.attestChallengeKey(userId, deviceId),
      challenge,
      'EX',
      CHALLENGE_TTL_SECONDS,
    );
    return challenge;
  }

  /**
   * Spend an attestation challenge. True only when it matches the one THIS server issued for this
   * user and device.
   *
   * Deleted before the comparison, exactly as the OTP and step-up flows do: a challenge that survives
   * a failed comparison is a challenge an attacker can keep trying against.
   */
  private async consumeAttestationChallenge(
    userId: string,
    deviceId: string,
    presented: string,
  ): Promise<boolean> {
    const key = this.attestChallengeKey(userId, deviceId);
    const stored = await this.redis.get(key);
    await this.redis.del(key);
    return stored !== null && stored === presented;
  }

  /** Mint a single-use challenge for this phone+device, returned to the app to sign. */
  async issueChallenge(phoneNumber: string, deviceId: string): Promise<string> {
    const challenge = randomBytes(32).toString('base64url');
    await this.redis.set(
      this.challengeKey(phoneNumber, deviceId),
      challenge,
      'EX',
      CHALLENGE_TTL_SECONDS,
    );
    return challenge;
  }

  /**
   * Decide whether a device is trusted, called after the OTP is verified. Consumes the challenge
   * (single-use), verifies the signature against the registered public key, and — on success — slides
   * the trust window. Returns false for any missing/expired/revoked/mismatch case; never throws, so a
   * failed trust check can never block a legitimate login.
   */
  async evaluateTrust(params: {
    phoneNumber: string;
    deviceId: string;
    signature: string;
  }): Promise<boolean> {
    const { phoneNumber, deviceId, signature } = params;

    // Single-use: consume the challenge whether or not the rest succeeds.
    const key = this.challengeKey(phoneNumber, deviceId);
    const challenge = await this.redis.get(key);
    await this.redis.del(key);
    if (!challenge) return false;

    const user = await this.prisma.user.findFirst({
      where: { phoneNumber, isActive: true },
      select: { userId: true },
    });
    if (!user) return false;

    const device = await this.prisma.trustedDevice.findUnique({
      where: { userId_deviceId: { userId: user.userId, deviceId } },
    });
    if (!device || device.revokedAt || device.expiresAt.getTime() <= Date.now()) return false;

    if (!verifyDeviceSignature(device.publicKey, challenge, signature)) return false;

    // Proven possession — renew the sliding window and record the sighting.
    await this.prisma.trustedDevice.update({
      where: { deviceRowId: device.deviceRowId },
      data: {
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + TRUST_WINDOW_DAYS * MS_PER_DAY),
      },
    });
    logger.info({ userId: user.userId }, 'device trust verified');
    return true;
  }

  /**
   * Enrol (or re-enrol) a device for the authenticated user. Idempotent on (user, deviceId): a fresh
   * public key replaces the old one and clears any prior revocation — a user re-installing on the same
   * device gets a clean, un-revoked trust window.
   */
  async registerDevice(params: {
    userId: string;
    tenantId: string;
    deviceId: string;
    publicKey: string;
    platform: string;
    model?: string | null;
    /**
     * Platform attestation from @expo/app-integrity (ADR-082/083). Optional: a client that cannot
     * produce one — no Play Services, an older build — still enrols. Attestation is additive.
     *
     * Both the token AND the challenge it answers are required together. Both platforms are
     * challenge-response (`attestKeyAsync(keyId, challenge)` / `requestIntegrityCheckAsync(hash)`),
     * so a token without the challenge it was minted against is a bearer credential replayable
     * forever. There is deliberately no client-reported osVersion or patch level here — see the
     * AttestationClaim doc comment.
     */
    attestationToken?: string | null;
    attestationChallenge?: string | null;
    /**
     * iOS only: the App Attest key identifier the attestation object belongs to.
     *
     * Apple's attestation is a statement about a KEY, so the server cannot make sense of the object
     * without knowing which key it attests. Android's Play Integrity token stands alone and sends
     * none — hence optional rather than required.
     */
    attestationKeyId?: string | null;
  }): Promise<void> {
    const { userId, tenantId, deviceId, publicKey, platform, model } = params;
    const expiresAt = new Date(Date.now() + TRUST_WINDOW_DAYS * MS_PER_DAY);

    // Verified BEFORE the write, so the row never holds a verdict the server did not establish.
    //
    // No token at all — or no challenge, or the kill switch off — leaves the columns untouched
    // rather than writing UNAVAILABLE. "This client never offered one" and "we asked and got no
    // answer" are different facts, and only the second says anything about the device.
    const attestationOn = this.flags.isEnabled(ATTESTATION_FLAG, { userId, tenantId });
    // The challenge is CONSUMED and matched before the verifier is reached. Without this the
    // `challenge` field would be decorative — the client could echo any string and the token would
    // never be bound to a nonce this server issued, which is the replay hole the whole
    // challenge-response shape exists to close.
    const challengeOk =
      params.attestationToken && params.attestationChallenge && attestationOn
        ? await this.consumeAttestationChallenge(userId, deviceId, params.attestationChallenge)
        : false;
    const attested =
      challengeOk && params.attestationToken && params.attestationChallenge
        ? await this.attestation.verify({
            platform,
            token: params.attestationToken,
            deviceId,
            challenge: params.attestationChallenge,
            keyId: params.attestationKeyId ?? null,
          })
        : null;
    const attestationFields = attested
      ? {
          attestationVerdict: attested.verdict,
          integrityLevel: attested.integrityLevel,
          attestedAt: new Date(),
          osVersion: attested.osVersion,
        }
      : {};

    await this.prisma.trustedDevice.upsert({
      where: { userId_deviceId: { userId, deviceId } },
      create: {
        tenantId,
        userId,
        deviceId,
        publicKey,
        platform,
        model: model ?? null,
        expiresAt,
        ...attestationFields,
      },
      update: {
        publicKey,
        platform,
        model: model ?? null,
        expiresAt,
        revokedAt: null,
        // Cleared alongside revokedAt: a re-enrolled device starts with a clean history, and leaving
        // a stale COMPROMISED on a row that is trusted again would keep feeding ADR-081 a positive
        // label for a device that is no longer the one that was compromised.
        revocationReason: null,
        lastSeenAt: new Date(),
        ...attestationFields,
      },
    });
    logger.info(
      { userId, attested: attested?.verdict ?? 'not-offered' },
      'device enrolled for trust',
    );
  }

  /** Active (non-revoked) devices for the user — powers a future "your devices" screen. */
  async listDevices(userId: string): Promise<TrustedDeviceSummary[]> {
    const rows = await this.prisma.trustedDevice.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
    });
    return rows.map((r) => ({
      deviceId: r.deviceId,
      platform: r.platform,
      model: r.model,
      lastSeenAt: r.lastSeenAt,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      attestationVerdict: r.attestationVerdict,
      integrityLevel: r.integrityLevel,
      attestedAt: r.attestedAt,
      osVersion: r.osVersion,
    }));
  }

  /**
   * Revoke a device's trust (soft delete). Idempotent — revoking an unknown device is a no-op.
   *
   * The reason is REQUIRED, not optional with a default. ADR-081's model has exactly one positive
   * class and this column is its only source; a default would silently label every revocation the
   * same, and whichever default was chosen would be wrong for the other three cases. A caller that
   * genuinely does not know picks USER_REVOKED explicitly, which is a statement rather than an
   * accident.
   */
  async revokeDevice(
    userId: string,
    deviceId: string,
    reason: DeviceRevocationReason,
  ): Promise<void> {
    await this.prisma.trustedDevice.updateMany({
      where: { userId, deviceId, revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: reason },
    });
    // The reason IS logged, unlike most device fields: a COMPROMISED revocation is a security event
    // and the operator needs it in the log without querying the table. It says nothing about the
    // person beyond what the audit entry for the same request already records (QM-8).
    logger.info({ userId, reason }, 'device trust revoked');
  }
}
