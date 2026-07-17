// Device-trust unit tests (§20.6.1).
//
// verifyDeviceSignature is exercised with a REAL P-256 keypair and the exact wire contract
// react-native-secure-sign emits — SPKI-DER public key, IEEE-P1363 signature over the raw challenge
// bytes, SHA-256 — so a drift in either side's encoding fails the build. The trust decision is tested
// against a mocked Prisma + Redis to cover the missing/expired/revoked/mismatch branches.

import * as crypto from 'crypto';

const redisMock = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  quit: jest.fn(),
};

const prismaMock = {
  user: { findFirst: jest.fn() },
  trustedDevice: {
    findUnique: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  $disconnect: jest.fn(),
};

jest.mock('ioredis', () => ({ Redis: jest.fn(() => redisMock) }));
jest.mock('../../../../shared/prisma/create-prisma-client', () => ({
  createPrismaClient: () => prismaMock,
}));
jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { DeviceTrustService, verifyDeviceSignature } from '../device-trust.service';

const b64u = (b: Buffer): string => b.toString('base64url');

/** A P-256 keypair + a signer that mimics the mobile lib: sign raw bytes, output IEEE-P1363. */
function makeDevice() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    publicKeyB64u: b64u(publicKey.export({ type: 'spki', format: 'der' }) as Buffer),
    sign: (challengeB64u: string): string =>
      b64u(
        crypto.sign('sha256', Buffer.from(challengeB64u, 'base64url'), {
          key: privateKey,
          dsaEncoding: 'ieee-p1363',
        }),
      ),
  };
}

describe('verifyDeviceSignature — ECDSA P-256 / SHA-256 / IEEE-P1363', () => {
  it('accepts a signature the mobile contract would produce', () => {
    const dev = makeDevice();
    const challenge = b64u(crypto.randomBytes(32));
    expect(verifyDeviceSignature(dev.publicKeyB64u, challenge, dev.sign(challenge))).toBe(true);
  });

  it('rejects a signature over a different challenge', () => {
    const dev = makeDevice();
    const sig = dev.sign(b64u(crypto.randomBytes(32)));
    expect(verifyDeviceSignature(dev.publicKeyB64u, b64u(crypto.randomBytes(32)), sig)).toBe(false);
  });

  it("rejects another device's signature", () => {
    const a = makeDevice();
    const b = makeDevice();
    const challenge = b64u(crypto.randomBytes(32));
    expect(verifyDeviceSignature(a.publicKeyB64u, challenge, b.sign(challenge))).toBe(false);
  });

  it('returns false (never throws) on a malformed key or signature', () => {
    const challenge = b64u(crypto.randomBytes(32));
    expect(verifyDeviceSignature('not-a-key', challenge, 'not-a-sig')).toBe(false);
  });
});

describe('DeviceTrustService', () => {
  let service: DeviceTrustService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DeviceTrustService();
  });

  describe('issueChallenge', () => {
    it('stores a fresh base64url challenge under the phone+device key with the OTP TTL', async () => {
      redisMock.set.mockResolvedValue('OK');
      const challenge = await service.issueChallenge('+66811000009', 'dev-1');
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(redisMock.set).toHaveBeenCalledWith(
        'devtrust:challenge:+66811000009:dev-1',
        challenge,
        'EX',
        300,
      );
    });
  });

  describe('evaluateTrust', () => {
    const phone = '+66811000009';
    const deviceId = 'dev-1';

    it('consumes the challenge and returns false when none was issued', async () => {
      redisMock.get.mockResolvedValue(null);
      const ok = await service.evaluateTrust({ phoneNumber: phone, deviceId, signature: 'x' });
      expect(ok).toBe(false);
      expect(redisMock.del).toHaveBeenCalledWith('devtrust:challenge:+66811000009:dev-1');
      expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    });

    it('returns false when the phone maps to no active user', async () => {
      redisMock.get.mockResolvedValue('CH');
      prismaMock.user.findFirst.mockResolvedValue(null);
      expect(await service.evaluateTrust({ phoneNumber: phone, deviceId, signature: 'x' })).toBe(
        false,
      );
    });

    it('returns false when the device is not enrolled', async () => {
      redisMock.get.mockResolvedValue('CH');
      prismaMock.user.findFirst.mockResolvedValue({ userId: 'u1' });
      prismaMock.trustedDevice.findUnique.mockResolvedValue(null);
      expect(await service.evaluateTrust({ phoneNumber: phone, deviceId, signature: 'x' })).toBe(
        false,
      );
    });

    it('returns false for a revoked device', async () => {
      const dev = makeDevice();
      const challenge = b64u(crypto.randomBytes(32));
      redisMock.get.mockResolvedValue(challenge);
      prismaMock.user.findFirst.mockResolvedValue({ userId: 'u1' });
      prismaMock.trustedDevice.findUnique.mockResolvedValue({
        deviceRowId: 'r1',
        publicKey: dev.publicKeyB64u,
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 1e9),
      });
      expect(
        await service.evaluateTrust({
          phoneNumber: phone,
          deviceId,
          signature: dev.sign(challenge),
        }),
      ).toBe(false);
      expect(prismaMock.trustedDevice.update).not.toHaveBeenCalled();
    });

    it('returns false for an expired device even with a valid signature', async () => {
      const dev = makeDevice();
      const challenge = b64u(crypto.randomBytes(32));
      redisMock.get.mockResolvedValue(challenge);
      prismaMock.user.findFirst.mockResolvedValue({ userId: 'u1' });
      prismaMock.trustedDevice.findUnique.mockResolvedValue({
        deviceRowId: 'r1',
        publicKey: dev.publicKeyB64u,
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(
        await service.evaluateTrust({
          phoneNumber: phone,
          deviceId,
          signature: dev.sign(challenge),
        }),
      ).toBe(false);
    });

    it('returns false when the signature does not verify', async () => {
      const dev = makeDevice();
      const other = makeDevice();
      const challenge = b64u(crypto.randomBytes(32));
      redisMock.get.mockResolvedValue(challenge);
      prismaMock.user.findFirst.mockResolvedValue({ userId: 'u1' });
      prismaMock.trustedDevice.findUnique.mockResolvedValue({
        deviceRowId: 'r1',
        publicKey: dev.publicKeyB64u,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1e9),
      });
      // Signed by a different device — must not verify.
      expect(
        await service.evaluateTrust({
          phoneNumber: phone,
          deviceId,
          signature: other.sign(challenge),
        }),
      ).toBe(false);
      expect(prismaMock.trustedDevice.update).not.toHaveBeenCalled();
    });

    it('returns true and slides the trust window on a valid signature', async () => {
      const dev = makeDevice();
      const challenge = b64u(crypto.randomBytes(32));
      redisMock.get.mockResolvedValue(challenge);
      prismaMock.user.findFirst.mockResolvedValue({ userId: 'u1' });
      prismaMock.trustedDevice.findUnique.mockResolvedValue({
        deviceRowId: 'r1',
        publicKey: dev.publicKeyB64u,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1e9),
      });
      prismaMock.trustedDevice.update.mockResolvedValue({});

      const ok = await service.evaluateTrust({
        phoneNumber: phone,
        deviceId,
        signature: dev.sign(challenge),
      });

      expect(ok).toBe(true);
      const arg = prismaMock.trustedDevice.update.mock.calls[0][0];
      expect(arg.where).toEqual({ deviceRowId: 'r1' });
      // Sliding window ~30 days out.
      const days = (arg.data.expiresAt.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(29);
      expect(days).toBeLessThanOrEqual(30);
    });
  });

  describe('registerDevice', () => {
    it('upserts with a 30-day window and clears prior revocation on re-enrol', async () => {
      prismaMock.trustedDevice.upsert.mockResolvedValue({});
      await service.registerDevice({
        userId: 'u1',
        tenantId: 't1',
        deviceId: 'dev-1',
        publicKey: 'PUB',
        platform: 'android',
        model: 'Pixel',
      });
      const arg = prismaMock.trustedDevice.upsert.mock.calls[0][0];
      expect(arg.where).toEqual({ userId_deviceId: { userId: 'u1', deviceId: 'dev-1' } });
      expect(arg.create).toMatchObject({ tenantId: 't1', userId: 'u1', publicKey: 'PUB' });
      expect(arg.update).toMatchObject({ publicKey: 'PUB', revokedAt: null });
      const days = (arg.create.expiresAt.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(29);
    });

    it('stores model as null when the device does not report one', async () => {
      // iOS often does not expose a model (see deviceModel() on the mobile side), so `model` arrives
      // undefined — it must land as an explicit null, not undefined, on both upsert halves.
      prismaMock.trustedDevice.upsert.mockResolvedValue({});
      await service.registerDevice({
        userId: 'u1',
        tenantId: 't1',
        deviceId: 'dev-1',
        publicKey: 'PUB',
        platform: 'ios',
      });
      const arg = prismaMock.trustedDevice.upsert.mock.calls[0][0];
      expect(arg.create.model).toBeNull();
      expect(arg.update.model).toBeNull();
    });
  });

  describe('revokeDevice', () => {
    it('soft-revokes only the user’s matching, still-active device', async () => {
      prismaMock.trustedDevice.updateMany.mockResolvedValue({ count: 1 });
      await service.revokeDevice('u1', 'dev-1');
      const arg = prismaMock.trustedDevice.updateMany.mock.calls[0][0];
      expect(arg.where).toEqual({ userId: 'u1', deviceId: 'dev-1', revokedAt: null });
      expect(arg.data.revokedAt).toBeInstanceOf(Date);
    });
  });

  describe('listDevices', () => {
    it('returns active devices as summaries', async () => {
      const now = new Date();
      prismaMock.trustedDevice.findMany.mockResolvedValue([
        {
          deviceId: 'dev-1',
          platform: 'android',
          model: 'Pixel',
          lastSeenAt: now,
          createdAt: now,
          expiresAt: now,
        },
      ]);
      const list = await service.listDevices('u1');
      expect(prismaMock.trustedDevice.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        orderBy: { lastSeenAt: 'desc' },
      });
      expect(list).toEqual([
        {
          deviceId: 'dev-1',
          platform: 'android',
          model: 'Pixel',
          lastSeenAt: now,
          createdAt: now,
          expiresAt: now,
        },
      ]);
    });
  });

  describe('onModuleDestroy', () => {
    // This service owns both a PrismaClient and a Redis connection, so it must close both on
    // shutdown or a SIGTERM (K8s rolling deploy) leaves the handles open — ADR-034 / QM-18, which
    // also require this test to exist for every lifecycle hook.
    it('closes the Prisma and Redis handles', async () => {
      await service.onModuleDestroy();

      expect(prismaMock.$disconnect).toHaveBeenCalledTimes(1);
      expect(redisMock.quit).toHaveBeenCalledTimes(1);
    });
  });
});
