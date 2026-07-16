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

  constructor() {
    this.redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.prisma.$disconnect(), this.redis.quit()]);
  }

  private challengeKey(phoneNumber: string, deviceId: string): string {
    return `devtrust:challenge:${phoneNumber}:${deviceId}`;
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
  }): Promise<void> {
    const { userId, tenantId, deviceId, publicKey, platform, model } = params;
    const expiresAt = new Date(Date.now() + TRUST_WINDOW_DAYS * MS_PER_DAY);
    await this.prisma.trustedDevice.upsert({
      where: { userId_deviceId: { userId, deviceId } },
      create: { tenantId, userId, deviceId, publicKey, platform, model: model ?? null, expiresAt },
      update: {
        publicKey,
        platform,
        model: model ?? null,
        expiresAt,
        revokedAt: null,
        lastSeenAt: new Date(),
      },
    });
    logger.info({ userId }, 'device enrolled for trust');
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
    }));
  }

  /** Revoke a device's trust (soft delete). Idempotent — revoking an unknown device is a no-op. */
  async revokeDevice(userId: string, deviceId: string): Promise<void> {
    await this.prisma.trustedDevice.updateMany({
      where: { userId, deviceId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    logger.info({ userId }, 'device trust revoked');
  }
}
