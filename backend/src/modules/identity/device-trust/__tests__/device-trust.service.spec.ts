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

import {
  COMPROMISED_REASON,
  DeviceTrustService,
  isRevocationReason,
  REVOCATION_REASONS,
  verifyDeviceSignature,
} from '../device-trust.service';
import type { AttestationVerifierRegistry } from '../attestation-verifier.provider';
import type { FeatureFlagService } from '../../../../shared/feature-flags/feature-flag.service';

/** Attestation registry double. Defaults to a PASSED verdict so a test can assert the write path. */
const attestationMock = {
  verify: jest.fn().mockResolvedValue({
    verdict: 'PASSED',
    integrityLevel: 'STRONG',
    osVersion: '34',
  }),
};

/** Flag double — ON by default, matching DEFAULT_FLAGS for s1.identity.device-attestation. */
const flagsMock = { isEnabled: jest.fn().mockReturnValue(true) };

const makeService = (): DeviceTrustService =>
  new DeviceTrustService(
    attestationMock as unknown as AttestationVerifierRegistry,
    flagsMock as unknown as FeatureFlagService,
  );

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
    attestationMock.verify.mockResolvedValue({
      verdict: 'PASSED',
      integrityLevel: 'STRONG',
      osVersion: '34',
    });
    flagsMock.isEnabled.mockReturnValue(true);
    service = makeService();
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

  describe('issueAttestationChallenge', () => {
    it('stores a fresh nonce in its OWN namespace, keyed by user', async () => {
      // Deliberately not `devtrust:challenge:*`. That one is minted pre-login against a phone number
      // and consumed by the signature check; sharing the key would let one flow spend the other's
      // nonce, and the two have different callers and lifetimes.
      redisMock.set.mockResolvedValue('OK');
      const challenge = await service.issueAttestationChallenge('u1', 'dev-1');

      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(redisMock.set).toHaveBeenCalledWith('devtrust:attest:u1:dev-1', challenge, 'EX', 300);
    });

    it('mints a different nonce every time', async () => {
      // Apple's guidance for App Attest: random, at least 16 bytes, fresh, short-lived, single-use.
      redisMock.set.mockResolvedValue('OK');
      const a = await service.issueAttestationChallenge('u1', 'dev-1');
      const b = await service.issueAttestationChallenge('u1', 'dev-1');
      expect(a).not.toBe(b);
      // 32 bytes base64url — comfortably past the 16-byte floor.
      expect(Buffer.from(a, 'base64url')).toHaveLength(32);
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

  // ── Platform attestation (ADR-082) ────────────────────────────────────────
  //
  // The property these protect: the row never holds a verdict or an OS version the SERVER did not
  // establish. The client has no way to report either — ADR-083 removed those fields from the wire
  // entirely, because on a rooted device a self-reported string is attacker-controlled.
  describe('registerDevice — attestation', () => {
    const params = {
      userId: 'u1',
      tenantId: 't1',
      deviceId: 'dev-1',
      publicKey: 'PUB',
      platform: 'android',
    };

    it('records the verdict, the tier and the verified OS signal', async () => {
      prismaMock.trustedDevice.upsert.mockResolvedValue({});
      redisMock.get.mockResolvedValue('CHAL');
      attestationMock.verify.mockResolvedValue({
        verdict: 'PASSED',
        integrityLevel: 'STRONG',
        osVersion: '34',
      });

      await service.registerDevice({
        ...params,
        attestationToken: 'TOKEN',
        attestationChallenge: 'CHAL',
      });

      const arg = prismaMock.trustedDevice.upsert.mock.calls[0][0];
      expect(arg.create.attestationVerdict).toBe('PASSED');
      // The tier, not a patch date: no verdict on either platform carries one, and STRONG already
      // means "patched within the last year" on Android 13+ (ADR-083).
      expect(arg.create.integrityLevel).toBe('STRONG');
      expect(arg.create.osVersion).toBe('34');
      expect(arg.create.attestedAt).toBeInstanceOf(Date);
      expect(arg.create).not.toHaveProperty('securityPatchLevel');
    });

    it('binds the verification to the server-issued challenge', async () => {
      // Both platforms are challenge-response. A token verified without the challenge it answers is
      // replayable by anyone who captures it once.
      prismaMock.trustedDevice.upsert.mockResolvedValue({});
      redisMock.get.mockResolvedValue('CHAL');
      await service.registerDevice({
        ...params,
        attestationToken: 'TOKEN',
        attestationChallenge: 'CHAL',
      });
      expect(attestationMock.verify).toHaveBeenCalledWith({
        platform: 'android',
        token: 'TOKEN',
        deviceId: 'dev-1',
        challenge: 'CHAL',
        keyId: null,
      });
    });

    it('CONSUMES the challenge, so a captured token cannot be replayed', async () => {
      // Deleted before it is judged, like the OTP and step-up flows: a challenge that survives a
      // failed comparison is one an attacker can keep trying.
      prismaMock.trustedDevice.upsert.mockResolvedValue({});
      redisMock.get.mockResolvedValue('CHAL');
      await service.registerDevice({
        ...params,
        attestationToken: 'TOKEN',
        attestationChallenge: 'CHAL',
      });
      expect(redisMock.del).toHaveBeenCalledWith('devtrust:attest:u1:dev-1');
    });

    it('does NOT verify a challenge this server never issued', async () => {
      // Without this the `challenge` field would be decorative — the client could echo any string.
      prismaMock.trustedDevice.upsert.mockResolvedValue({});
      redisMock.get.mockResolvedValue(null);
      await service.registerDevice({
        ...params,
        attestationToken: 'TOKEN',
        attestationChallenge: 'FORGED',
      });
      expect(attestationMock.verify).not.toHaveBeenCalled();
      expect(prismaMock.trustedDevice.upsert.mock.calls[0][0].create).not.toHaveProperty(
        'attestationVerdict',
      );
    });

    it('does NOT verify when the echoed challenge differs from the stored one', async () => {
      prismaMock.trustedDevice.upsert.mockResolvedValue({});
      redisMock.get.mockResolvedValue('THE_REAL_ONE');
      await service.registerDevice({
        ...params,
        attestationToken: 'TOKEN',
        attestationChallenge: 'A_DIFFERENT_ONE',
      });
      expect(attestationMock.verify).not.toHaveBeenCalled();
      // Still consumed — a mismatch must not leave the nonce alive for a second attempt.
      expect(redisMock.del).toHaveBeenCalledWith('devtrust:attest:u1:dev-1');
    });

    it('forwards the iOS key id, and null on Android', async () => {
      // Apple attests a KEY; the object is uninterpretable without knowing which one. Play Integrity
      // tokens stand alone and send none.
      prismaMock.trustedDevice.upsert.mockResolvedValue({});
      redisMock.get.mockResolvedValue('CHAL');
      await service.registerDevice({
        ...params,
        platform: 'ios',
        attestationToken: 'TOKEN',
        attestationChallenge: 'CHAL',
        attestationKeyId: 'KEY_ID',
      });
      expect(attestationMock.verify).toHaveBeenCalledWith(
        expect.objectContaining({ keyId: 'KEY_ID' }),
      );
    });

    it('enrolment still SUCCEEDS when the challenge does not match', async () => {
      // Attestation never blocks (ADR-054/082). A forged or stale challenge costs a verdict, not the
      // device's public key — and losing the key would make the next login untrusted.
      prismaMock.trustedDevice.upsert.mockResolvedValue({});
      redisMock.get.mockResolvedValue(null);
      await expect(
        service.registerDevice({
          ...params,
          attestationToken: 'TOKEN',
          attestationChallenge: 'FORGED',
        }),
      ).resolves.toBeUndefined();
      expect(prismaMock.trustedDevice.upsert.mock.calls[0][0].create.publicKey).toBe('PUB');
    });

    it('does NOT verify a token that arrives without its challenge', async () => {
      // Refusing is the whole point: accepting a bare token would restore the replayable contract
      // this replaced.
      prismaMock.trustedDevice.upsert.mockResolvedValue({});
      await service.registerDevice({ ...params, attestationToken: 'TOKEN' });
      expect(attestationMock.verify).not.toHaveBeenCalled();
      expect(prismaMock.trustedDevice.upsert.mock.calls[0][0].create).not.toHaveProperty(
        'attestationVerdict',
      );
    });

    it('records FAILED as a fact and still enrols the device', async () => {
      // Attestation is additive: a rooted device is enrolled with a FAILED verdict and a low trust
      // score, not locked out. ADR-054's non-blocking guarantee outranks a stricter gate.
      prismaMock.trustedDevice.upsert.mockResolvedValue({});
      redisMock.get.mockResolvedValue('CHAL');
      attestationMock.verify.mockResolvedValue({
        verdict: 'FAILED',
        integrityLevel: null,
        osVersion: null,
      });

      await expect(
        service.registerDevice({
          ...params,
          attestationToken: 'TOKEN',
          attestationChallenge: 'CHAL',
        }),
      ).resolves.toBeUndefined();
      const arg = prismaMock.trustedDevice.upsert.mock.calls[0][0];
      expect(arg.create.attestationVerdict).toBe('FAILED');
      // No tier when nothing passed — a FAILED device must not carry a reassuring label.
      expect(arg.create.integrityLevel).toBeNull();
    });

    it('records a PASSED iOS device with no tier — App Attest has no equivalent', async () => {
      // Null here is the absence of the CONCEPT, not a failure to obtain it: App Attest attests the
      // app, not the device, so there is no integrity tier to report.
      prismaMock.trustedDevice.upsert.mockResolvedValue({});
      redisMock.get.mockResolvedValue('CHAL');
      attestationMock.verify.mockResolvedValue({
        verdict: 'PASSED',
        integrityLevel: null,
        osVersion: null,
      });

      await service.registerDevice({
        ...params,
        platform: 'ios',
        attestationToken: 'TOKEN',
        attestationChallenge: 'CHAL',
      });
      const arg = prismaMock.trustedDevice.upsert.mock.calls[0][0];
      expect(arg.create.attestationVerdict).toBe('PASSED');
      expect(arg.create.integrityLevel).toBeNull();
      expect(arg.create.osVersion).toBeNull();
    });

    it('leaves the columns UNTOUCHED when no token was offered', async () => {
      // "This client never offered one" is not "we asked and got no answer". Writing UNAVAILABLE
      // here would claim we tried, and would overwrite a real verdict from a previous enrolment.
      prismaMock.trustedDevice.upsert.mockResolvedValue({});
      await service.registerDevice(params);

      const arg = prismaMock.trustedDevice.upsert.mock.calls[0][0];
      expect(arg.create).not.toHaveProperty('attestationVerdict');
      expect(arg.update).not.toHaveProperty('attestationVerdict');
      expect(attestationMock.verify).not.toHaveBeenCalled();
    });

    it('does not call the verifier when the kill switch is off', async () => {
      // The switch means "stop asking Google", so the outcome is identical to no token at all —
      // and crucially it does NOT fail the enrolment, which a @FeatureFlag route guard would.
      prismaMock.trustedDevice.upsert.mockResolvedValue({});
      flagsMock.isEnabled.mockReturnValue(false);

      await service.registerDevice({
        ...params,
        attestationToken: 'TOKEN',
        attestationChallenge: 'CHAL',
      });

      expect(flagsMock.isEnabled).toHaveBeenCalledWith('s1.identity.device-attestation', {
        userId: 'u1',
        tenantId: 't1',
      });
      expect(attestationMock.verify).not.toHaveBeenCalled();
      const arg = prismaMock.trustedDevice.upsert.mock.calls[0][0];
      expect(arg.create).not.toHaveProperty('attestationVerdict');
    });

    it('clears a stale revocation reason when a device is re-enrolled', async () => {
      // revokedAt was already cleared on re-enrolment; the reason has to go with it. A row that is
      // trusted again but still says COMPROMISED would keep feeding ADR-081 a positive label for a
      // device that is no longer the one that was compromised.
      prismaMock.trustedDevice.upsert.mockResolvedValue({});
      await service.registerDevice(params);
      const arg = prismaMock.trustedDevice.upsert.mock.calls[0][0];
      expect(arg.update.revokedAt).toBeNull();
      expect(arg.update.revocationReason).toBeNull();
    });
  });

  describe('revokeDevice', () => {
    it('soft-revokes only the user’s matching, still-active device, recording the reason', async () => {
      prismaMock.trustedDevice.updateMany.mockResolvedValue({ count: 1 });
      await service.revokeDevice('u1', 'dev-1', 'USER_REVOKED');
      const arg = prismaMock.trustedDevice.updateMany.mock.calls[0][0];
      expect(arg.where).toEqual({ userId: 'u1', deviceId: 'dev-1', revokedAt: null });
      expect(arg.data.revokedAt).toBeInstanceOf(Date);
      expect(arg.data.revocationReason).toBe('USER_REVOKED');
    });

    it('writes COMPROMISED verbatim — it is the model’s only positive label', async () => {
      // Nothing in this path may normalise, default or re-map the reason: ADR-081's entire positive
      // class is the set of rows carrying exactly this value.
      prismaMock.trustedDevice.updateMany.mockResolvedValue({ count: 1 });
      await service.revokeDevice('u1', 'dev-1', COMPROMISED_REASON);
      expect(prismaMock.trustedDevice.updateMany.mock.calls[0][0].data.revocationReason).toBe(
        'COMPROMISED',
      );
    });

    it.each(REVOCATION_REASONS)('persists %s unchanged', async (reason) => {
      prismaMock.trustedDevice.updateMany.mockResolvedValue({ count: 1 });
      await service.revokeDevice('u1', 'dev-1', reason);
      expect(prismaMock.trustedDevice.updateMany.mock.calls[0][0].data.revocationReason).toBe(
        reason,
      );
    });
  });

  describe('isRevocationReason', () => {
    it('accepts the four known reasons and nothing else', () => {
      for (const r of REVOCATION_REASONS) expect(isRevocationReason(r)).toBe(true);
      expect(isRevocationReason('HACKED')).toBe(false);
      expect(isRevocationReason('compromised')).toBe(false);
    });

    it('names COMPROMISED as the single positive class', () => {
      // Asserted as a constant rather than inlined at each use: a second place deciding what "counts
      // as compromised" is how a model quietly starts training on retired handsets.
      expect(COMPROMISED_REASON).toBe('COMPROMISED');
      expect(REVOCATION_REASONS.filter((r) => r === COMPROMISED_REASON)).toHaveLength(1);
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
