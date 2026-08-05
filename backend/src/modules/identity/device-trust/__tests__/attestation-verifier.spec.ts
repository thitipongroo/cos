// Platform attestation port (ADR-082).
//
// The single property everything here defends: NO PATH EVER PRODUCES `PASSED` BY ACCIDENT.
//
// An unconfigured verifier, an unknown platform, a thrown exception, a Google timeout — each of these
// is a case where the server learned nothing, and each must record UNAVAILABLE. Failing open into
// "this device is fine" would turn an outage at Google into a fleet-wide clean bill of health, and
// the trust score that ADR-081 builds on top would be confidently wrong about every device at once.
//
// The mirror property: none of them may THROW either. ADR-082 forbids attestation blocking a login
// and ADR-054 made non-blocking a safety guarantee for field workers, so §32.9 Type B (safe defaults)
// applies here rather than Type A (fail fast) — the opposite of the SmsSender port.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { UNAVAILABLE, type AttestationVerifier } from '../attestation-verifier';
import { UnconfiguredAttestationVerifier } from '../adapters/unconfigured-attestation.adapter';
import {
  AttestationVerifierRegistry,
  attestationVerifiersProvider,
} from '../attestation-verifier.provider';
import { ATTESTATION_VERIFIER } from '../attestation-verifier';
import { PlayIntegrityVerifier } from '../adapters/play-integrity.adapter';
import { AppAttestVerifier } from '../adapters/app-attest.adapter';

const CLAIM = {
  platform: 'android',
  token: 'TOKEN',
  deviceId: 'dev-1',
  challenge: 'CHAL',
  // null: Android's Play Integrity token stands alone. Only Apple attests a KEY.
  keyId: null,
};

/** A stand-in for a real Play Integrity / App Attest adapter. */
function fakeVerifier(
  platform: string,
  result: Partial<typeof UNAVAILABLE> = {},
): AttestationVerifier {
  return {
    platform,
    verify: jest.fn().mockResolvedValue({
      verdict: 'PASSED',
      integrityLevel: 'STRONG',
      osVersion: '34',
      ...result,
    }),
  };
}

describe('UNAVAILABLE', () => {
  it('is never PASSED, and carries no device strings', () => {
    // The safe default is the whole safety argument. If this constant ever became PASSED, every
    // failure path in this file would start vouching for devices nobody checked.
    expect(UNAVAILABLE.verdict).toBe('UNAVAILABLE');
    expect(UNAVAILABLE.integrityLevel).toBeNull();
    expect(UNAVAILABLE.osVersion).toBeNull();
  });
});

describe('UnconfiguredAttestationVerifier', () => {
  const verifier = new UnconfiguredAttestationVerifier();

  it('resolves to UNAVAILABLE and does NOT throw (§32.9 Type B, not Type A)', async () => {
    // SmsSender's on-prem adapter throws, correctly: an OTP that was never sent must not look sent.
    // Here the opposite holds — a throw would surface as a failed enrolment for a field worker whose
    // only sin is having no Play Services.
    await expect(verifier.verify(CLAIM)).resolves.toEqual(UNAVAILABLE);
  });

  it('claims the wildcard platform so it can never shadow a real verifier', () => {
    expect(verifier.platform).toBe('*');
  });
});

describe('AttestationVerifierRegistry', () => {
  const fallback = new UnconfiguredAttestationVerifier();

  it('routes a claim to the verifier registered for that platform', async () => {
    const android = fakeVerifier('android');
    const ios = fakeVerifier('ios');
    const registry = new AttestationVerifierRegistry([android, ios], fallback);

    await expect(registry.verify(CLAIM)).resolves.toMatchObject({ verdict: 'PASSED' });
    expect(android.verify).toHaveBeenCalledTimes(1);
    expect(ios.verify).not.toHaveBeenCalled();
  });

  it('matches the platform case-insensitively', async () => {
    // The DTO constrains it to 'ios' | 'android', but the registry is also read by the enrolment
    // path where the string came off the wire; a case mismatch must not silently lose the verifier.
    const registry = new AttestationVerifierRegistry([fakeVerifier('Android')], fallback);
    await expect(registry.verify({ ...CLAIM, platform: 'ANDROID' })).resolves.toMatchObject({
      verdict: 'PASSED',
    });
  });

  it('falls back to UNAVAILABLE for a platform nobody handles', async () => {
    // Not an error: an unrecognised platform string is a reason to establish nothing, not a reason
    // to fail a login (ADR-054's non-blocking guarantee).
    const registry = new AttestationVerifierRegistry([fakeVerifier('android')], fallback);
    await expect(registry.verify({ ...CLAIM, platform: 'harmonyos' })).resolves.toEqual(
      UNAVAILABLE,
    );
  });

  it('never registers the wildcard as a real handler', async () => {
    // If '*' were stored under its own key it would answer for the literal platform "*" — harmless —
    // but the guard exists so a fallback passed in the ARRAY cannot pre-empt a genuine verifier.
    const registry = new AttestationVerifierRegistry([fallback, fakeVerifier('android')], fallback);
    await expect(registry.verify(CLAIM)).resolves.toMatchObject({ verdict: 'PASSED' });
  });

  it('converts a THROWN verifier error into UNAVAILABLE, not an exception', async () => {
    // Play Integrity and App Attest both call a third party at verification time, so a timeout or a
    // 5xx at Google is an ordinary Tuesday. Letting it propagate would make an outage at Google an
    // authentication outage here — exactly what ADR-082 rejected.
    const exploding: AttestationVerifier = {
      platform: 'android',
      verify: jest.fn().mockRejectedValue(new Error('googleapis 503')),
    };
    const registry = new AttestationVerifierRegistry([exploding], fallback);

    await expect(registry.verify(CLAIM)).resolves.toEqual(UNAVAILABLE);
  });

  it('never lets a third-party error message reach the caller', async () => {
    // The result is written to a device row and rendered on a security screen. A message from a
    // Google client has no business in either.
    const exploding: AttestationVerifier = {
      platform: 'android',
      verify: jest.fn().mockRejectedValue(new Error('project 12345 quota exceeded')),
    };
    const result = await new AttestationVerifierRegistry([exploding], fallback).verify(CLAIM);
    expect(JSON.stringify(result)).not.toContain('12345');
  });

  it('exposes resolve() so a caller can never receive null and branch on it', () => {
    const registry = new AttestationVerifierRegistry([], fallback);
    expect(registry.resolve('android')).toBe(fallback);
    expect(registry.resolve('ios')).toBe(fallback);
  });
});

describe('attestationVerifiersProvider', () => {
  it('registers a verifier for BOTH platforms under the port token', () => {
    // Both self-disable to UNAVAILABLE when their configuration is absent, so registering them
    // unconditionally is safe — an unconfigured deployment behaves as it did before they existed,
    // and no device is accused of failing an integrity check over an unset environment variable.
    expect(attestationVerifiersProvider.provide).toBe(ATTESTATION_VERIFIER);
    expect(attestationVerifiersProvider.inject).toEqual([PlayIntegrityVerifier, AppAttestVerifier]);

    const verifiers = attestationVerifiersProvider.useFactory(
      new PlayIntegrityVerifier(),
      new AppAttestVerifier(),
    ) as AttestationVerifier[];
    expect(verifiers.map((v) => v.platform)).toEqual(['android', 'ios']);
  });
});
