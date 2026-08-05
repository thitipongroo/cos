// App Attest verifier (ADR-082 / ADR-083).
//
// HOW THIS IS TESTED, AND WHAT THAT DOES AND DOES NOT PROVE.
//
// Apple's attestation is self-contained, so a real object can be simulated: the tests build a chain
// with a throwaway root and hand it to the verifier with the Apple root swapped for that root. Every
// one of Apple's nine steps then gets a positive case AND a negative case — each negative mutates
// exactly one field and asserts the verdict flips to FAILED.
//
// That proves the STEPS are implemented and that each is load-bearing. It does NOT prove a genuine
// attestation from a genuine iPhone satisfies them; ADR-082 records that the Simulator has no Secure
// Enclave, so that is only verifiable on hardware. The pinned root's fingerprint is asserted below so
// the trust anchor cannot be swapped without the build noticing.
//
// The most important negative is `nonce-mismatch`. Without step 5 the object is replayable forever
// and every other check still passes — a verifier that skipped it would look completely healthy.

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('@cos/logger', () => ({ createLogger: () => mockLogger }));

import 'reflect-metadata';
import * as crypto from 'crypto';
import * as x509 from '@peculiar/x509';
// Required, not imported: cbor-x is `"type": "module"` and this package compiles to CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- ESM-only package in a CJS build
const { encode: cborEncode } = require('cbor-x') as { encode: (value: unknown) => Buffer };
import {
  AppAttestVerifier,
  parseAuthData,
  readNonceExtension,
} from '../adapters/app-attest.adapter';
import {
  APPLE_APP_ATTEST_ROOT_CA_PEM,
  APPLE_APP_ATTEST_ROOT_CA_SHA256,
} from '../adapters/apple-app-attest-root';

x509.cryptoProvider.set(crypto.webcrypto as never);

const ALG = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' } as const;
const NONCE_OID = '1.2.840.113635.100.8.2';
const TEAM = 'ABCDE12345';
const BUNDLE = 'com.constructionos.cos';
const CHALLENGE = 'CHAL_B64U';
const AAGUID_PROD = Buffer.concat([Buffer.from('appattest', 'ascii'), Buffer.alloc(7)]);

const sha256 = (b: Buffer | string): Buffer => crypto.createHash('sha256').update(b).digest();

/** DER-encode `SEQUENCE { [1] { OCTET STRING nonce } }` — the shape of Apple's credCert extension. */
function nonceExtensionDer(nonce: Buffer): Buffer {
  const octet = Buffer.concat([Buffer.from([0x04, nonce.length]), nonce]);
  const ctx = Buffer.concat([Buffer.from([0xa1, octet.length]), octet]);
  return Buffer.concat([Buffer.from([0x30, ctx.length]), ctx]);
}

/** authData: rpIdHash(32) ‖ flags(1) ‖ counter(4) ‖ aaguid(16) ‖ credIdLen(2) ‖ credId. */
function buildAuthData(over: {
  rpIdHash?: Buffer;
  counter?: number;
  aaguid?: Buffer;
  credentialId: Buffer;
}): Buffer {
  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(over.counter ?? 0);
  const credIdLen = Buffer.alloc(2);
  credIdLen.writeUInt16BE(over.credentialId.length);
  return Buffer.concat([
    over.rpIdHash ?? sha256(`${TEAM}.${BUNDLE}`),
    Buffer.from([0x00]),
    counter,
    over.aaguid ?? AAGUID_PROD,
    credIdLen,
    over.credentialId,
  ]);
}

interface Fixture {
  token: string;
  keyId: string;
  rootPem: string;
}

/**
 * Build a complete, internally-consistent attestation. `mutate` tampers with exactly one thing so a
 * test can prove which step rejected it.
 */
async function makeAttestation(
  mutate: {
    fmt?: string;
    challenge?: string;
    rpIdHash?: Buffer;
    counter?: number;
    aaguid?: Buffer;
    nonce?: Buffer;
    credentialId?: Buffer;
    keyId?: Buffer;
    unrelatedRoot?: boolean;
    omitNonceExtension?: boolean;
    /** Issue the leaf via an intermediate, as a REAL Apple chain does (credCert + Apple CA 1). */
    withIntermediate?: boolean;
    /** Sign the leaf with a key that is not the issuer it names — a forged chain. */
    breakChainSignature?: boolean;
    /**
     * Replace authData with a buffer too short to hold its own fields, keeping the nonce consistent
     * with it. Everything upstream still verifies, so this isolates the length guard.
     */
    truncatedAuthData?: boolean;
  } = {},
): Promise<Fixture> {
  const rootKeys = await crypto.webcrypto.subtle.generateKey(ALG, false, ['sign', 'verify']);
  const root = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: '01',
    name: 'CN=Test App Attest Root',
    notBefore: new Date(Date.now() - 86_400_000),
    notAfter: new Date(Date.now() + 86_400_000),
    signingAlgorithm: ALG,
    keys: rootKeys,
    extensions: [new x509.BasicConstraintsExtension(true, 2, true)],
  });

  const leafKeys = await crypto.webcrypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
  const rawKey = Buffer.from(await crypto.webcrypto.subtle.exportKey('raw', leafKeys.publicKey));
  const realKeyId = sha256(rawKey);

  const authData = mutate.truncatedAuthData
    ? Buffer.alloc(20)
    : buildAuthData({
        ...(mutate.rpIdHash ? { rpIdHash: mutate.rpIdHash } : {}),
        ...(mutate.counter !== undefined ? { counter: mutate.counter } : {}),
        ...(mutate.aaguid ? { aaguid: mutate.aaguid } : {}),
        credentialId: mutate.credentialId ?? realKeyId,
      });

  const clientDataHash = sha256(Buffer.from(mutate.challenge ?? CHALLENGE, 'utf8'));
  const nonce = mutate.nonce ?? sha256(Buffer.concat([authData, clientDataHash]));

  // A real Apple chain is [credCert, Apple App Attestation CA 1] under the root, so the intermediate
  // path is the PRODUCTION shape — the single-cert form is the simplified one.
  let intermediate: x509.X509Certificate | null = null;
  let issuerKeys = rootKeys;
  if (mutate.withIntermediate) {
    const caKeys = await crypto.webcrypto.subtle.generateKey(ALG, false, ['sign', 'verify']);
    intermediate = await x509.X509CertificateGenerator.create({
      serialNumber: '03',
      subject: 'CN=Test App Attestation CA 1',
      issuer: root.subject,
      notBefore: new Date(Date.now() - 86_400_000),
      notAfter: new Date(Date.now() + 86_400_000),
      signingAlgorithm: ALG,
      publicKey: caKeys.publicKey,
      signingKey: rootKeys.privateKey,
      extensions: [new x509.BasicConstraintsExtension(true, 1, true)],
    });
    issuerKeys = caKeys;
  }

  // A forged chain: the leaf names its issuer correctly but is signed by an unrelated key.
  const signingKey = mutate.breakChainSignature
    ? (await crypto.webcrypto.subtle.generateKey(ALG, false, ['sign', 'verify'])).privateKey
    : issuerKeys.privateKey;

  const leaf = await x509.X509CertificateGenerator.create({
    serialNumber: '02',
    subject: 'CN=credCert',
    issuer: intermediate ? intermediate.subject : root.subject,
    notBefore: new Date(Date.now() - 86_400_000),
    notAfter: new Date(Date.now() + 86_400_000),
    signingAlgorithm: ALG,
    publicKey: leafKeys.publicKey,
    signingKey,
    extensions: mutate.omitNonceExtension
      ? []
      : [new x509.Extension(NONCE_OID, false, nonceExtensionDer(nonce))],
  });

  const x5c = [Buffer.from(leaf.rawData)];
  if (intermediate) x5c.push(Buffer.from(intermediate.rawData));

  const token = Buffer.from(
    cborEncode({
      fmt: mutate.fmt ?? 'apple-appattest',
      attStmt: { x5c },
      authData,
    }),
  ).toString('base64');

  return {
    token,
    keyId: (mutate.keyId ?? realKeyId).toString('base64'),
    rootPem: mutate.unrelatedRoot ? APPLE_APP_ATTEST_ROOT_CA_PEM : root.toString('pem'),
  };
}

/**
 * A verifier whose trust anchor is the fixture's root instead of Apple's.
 *
 * ONLY the anchor is substituted. The chain-walking code itself is the real method — stubbing that
 * out would leave the actual signature verification unexecuted, which on a security check is
 * indistinguishable from never having written it.
 */
function verifierFor(rootPem: string): AppAttestVerifier {
  const v = new AppAttestVerifier();
  Object.defineProperty(v, 'rootPem', { value: rootPem });
  return v;
}

const claimFor = (f: Fixture, challenge = CHALLENGE) => ({
  platform: 'ios',
  token: f.token,
  deviceId: 'dev-1',
  challenge,
  keyId: f.keyId,
});

const originalEnv = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  process.env['APP_ATTEST_TEAM_ID'] = TEAM;
  process.env['APP_ATTEST_BUNDLE_ID'] = BUNDLE;
  delete process.env['APP_ATTEST_ENV'];
});
afterEach(() => {
  process.env = { ...originalEnv };
});

describe('the pinned Apple root', () => {
  it('is the certificate its comment claims', () => {
    // The trust anchor is the one thing no other check can protect. If this PEM is ever swapped, the
    // whole verifier silently starts trusting a different issuer — so the fingerprint is asserted.
    const cert = new x509.X509Certificate(APPLE_APP_ATTEST_ROOT_CA_PEM);
    expect(sha256(Buffer.from(cert.rawData)).toString('hex')).toBe(APPLE_APP_ATTEST_ROOT_CA_SHA256);
    expect(cert.subject).toContain('Apple App Attestation Root CA');
    expect(cert.subject).toBe(cert.issuer);
  });
});

describe('readNonceExtension', () => {
  it('reads a well-formed extension', () => {
    const nonce = crypto.randomBytes(32);
    expect(readNonceExtension(nonceExtensionDer(nonce))?.equals(nonce)).toBe(true);
  });

  it.each([
    ['wrong outer tag', Buffer.from([0x31, 0x02, 0xa1, 0x00])],
    ['wrong context tag', Buffer.from([0x30, 0x02, 0xa2, 0x00])],
    ['wrong inner tag', Buffer.from([0x30, 0x04, 0xa1, 0x02, 0x05, 0x00])],
    ['empty', Buffer.alloc(0)],
    ['truncated', Buffer.from([0x30])],
  ])('rejects %s', (_label, der) => {
    expect(readNonceExtension(der)).toBeNull();
  });

  it('rejects a nonce that is not 32 bytes', () => {
    // Apple's nonce is a SHA-256 digest. Accepting another length would accept a shorter secret.
    expect(readNonceExtension(nonceExtensionDer(crypto.randomBytes(16)))).toBeNull();
  });

  it('rejects long-form lengths', () => {
    // The whole structure is 38 bytes; a long-form length is a sign of a hand-built extension.
    expect(readNonceExtension(Buffer.from([0x30, 0x81, 0x02, 0xa1, 0x00]))).toBeNull();
  });

  it('rejects trailing bytes after the octet string', () => {
    const valid = nonceExtensionDer(crypto.randomBytes(32));
    expect(readNonceExtension(Buffer.concat([valid, Buffer.from([0x00])]))).toBeNull();
  });
});

describe('parseAuthData', () => {
  it('reads every field at its documented offset', () => {
    const credentialId = crypto.randomBytes(32);
    const rpIdHash = sha256('x');
    const parsed = parseAuthData(buildAuthData({ rpIdHash, counter: 7, credentialId }));

    expect(parsed?.rpIdHash.equals(rpIdHash)).toBe(true);
    expect(parsed?.counter).toBe(7);
    expect(parsed?.aaguid.equals(AAGUID_PROD)).toBe(true);
    expect(parsed?.credentialId.equals(credentialId)).toBe(true);
  });

  it('returns null rather than reading past the end of a short buffer', () => {
    expect(parseAuthData(Buffer.alloc(10))).toBeNull();
    // Header present but the declared credentialId runs off the end.
    const truncated = buildAuthData({ credentialId: crypto.randomBytes(32) }).subarray(0, 60);
    expect(parseAuthData(truncated)).toBeNull();
  });
});

describe('AppAttestVerifier', () => {
  it('handles the ios platform', () => {
    expect(new AppAttestVerifier().platform).toBe('ios');
  });

  it('PASSES a well-formed attestation, with no tier and no OS signal', async () => {
    // App Attest attests the APP, not the device (ADR-083) — there is no integrity tier to report
    // and no OS version, so PASSED carries nothing else.
    const f = await makeAttestation();
    await expect(verifierFor(f.rootPem).verify(claimFor(f))).resolves.toEqual({
      verdict: 'PASSED',
      integrityLevel: null,
      osVersion: null,
    });
  });

  describe('each of Apple’s steps is load-bearing', () => {
    it('rejects a non-App-Attest format', async () => {
      const f = await makeAttestation({ fmt: 'packed' });
      await expect(verifierFor(f.rootPem).verify(claimFor(f))).resolves.toMatchObject({
        verdict: 'FAILED',
      });
    });

    it('accepts the PRODUCTION chain shape — credCert via an intermediate', async () => {
      // A real Apple attestation carries [credCert, Apple App Attestation CA 1]. Testing only the
      // single-cert form would leave the branch that walks to the next issuer unexecuted.
      const f = await makeAttestation({ withIntermediate: true });
      await expect(verifierFor(f.rootPem).verify(claimFor(f))).resolves.toMatchObject({
        verdict: 'PASSED',
      });
    });

    it('rejects a leaf whose signature does not match the issuer it names', async () => {
      const f = await makeAttestation({ withIntermediate: true, breakChainSignature: true });
      await expect(verifierFor(f.rootPem).verify(claimFor(f))).resolves.toMatchObject({
        verdict: 'FAILED',
      });
    });

    it('rejects a chain that does not reach the trusted root', async () => {
      // `unrelatedRoot` leaves the fixture's leaf signed by its own root while the verifier is given
      // Apple's — the situation an attacker creates by presenting a self-made chain.
      const f = await makeAttestation({ unrelatedRoot: true });
      await expect(verifierFor(f.rootPem).verify(claimFor(f))).resolves.toMatchObject({
        verdict: 'FAILED',
      });
    });

    it('rejects an attestation answering a DIFFERENT challenge', async () => {
      // THE replay defence. The object is otherwise perfect; only the nonce disagrees.
      const f = await makeAttestation({ challenge: 'A_DIFFERENT_CHALLENGE' });
      await expect(verifierFor(f.rootPem).verify(claimFor(f, CHALLENGE))).resolves.toMatchObject({
        verdict: 'FAILED',
      });
    });

    it('rejects a certificate whose nonce extension was replaced', async () => {
      const f = await makeAttestation({ nonce: crypto.randomBytes(32) });
      await expect(verifierFor(f.rootPem).verify(claimFor(f))).resolves.toMatchObject({
        verdict: 'FAILED',
      });
    });

    it('rejects a certificate with no nonce extension at all', async () => {
      const f = await makeAttestation({ omitNonceExtension: true });
      await expect(verifierFor(f.rootPem).verify(claimFor(f))).resolves.toMatchObject({
        verdict: 'FAILED',
      });
    });

    it('rejects a keyId that is not the hash of the attested public key', async () => {
      const f = await makeAttestation({ keyId: crypto.randomBytes(32) });
      await expect(verifierFor(f.rootPem).verify(claimFor(f))).resolves.toMatchObject({
        verdict: 'FAILED',
      });
    });

    it('rejects an attestation for a different app id', async () => {
      const f = await makeAttestation({ rpIdHash: sha256('OTHER.com.someone.else') });
      await expect(verifierFor(f.rootPem).verify(claimFor(f))).resolves.toMatchObject({
        verdict: 'FAILED',
      });
    });

    it('rejects a non-zero counter', async () => {
      // An attestation is the FIRST use of a key; a counter above zero means a reused artefact.
      const f = await makeAttestation({ counter: 1 });
      await expect(verifierFor(f.rootPem).verify(claimFor(f))).resolves.toMatchObject({
        verdict: 'FAILED',
      });
    });

    it('rejects a DEVELOPMENT attestation when production is expected', async () => {
      // The whole point of the aaguid: a debug build must not pass in production.
      const f = await makeAttestation({ aaguid: Buffer.from('appattestdevelop', 'ascii') });
      await expect(verifierFor(f.rootPem).verify(claimFor(f))).resolves.toMatchObject({
        verdict: 'FAILED',
      });
    });

    it('accepts a development attestation only when explicitly configured', async () => {
      process.env['APP_ATTEST_ENV'] = 'development';
      const f = await makeAttestation({ aaguid: Buffer.from('appattestdevelop', 'ascii') });
      await expect(verifierFor(f.rootPem).verify(claimFor(f))).resolves.toMatchObject({
        verdict: 'PASSED',
      });
    });

    it('rejects a production attestation when development is configured', async () => {
      process.env['APP_ATTEST_ENV'] = 'development';
      const f = await makeAttestation();
      await expect(verifierFor(f.rootPem).verify(claimFor(f))).resolves.toMatchObject({
        verdict: 'FAILED',
      });
    });

    it('rejects a credentialId that disagrees with the key', async () => {
      const f = await makeAttestation({ credentialId: crypto.randomBytes(32) });
      await expect(verifierFor(f.rootPem).verify(claimFor(f))).resolves.toMatchObject({
        verdict: 'FAILED',
      });
    });

    it('rejects authData too short to hold its own fields', async () => {
      // Everything upstream — chain, nonce, keyId — still verifies; only the length guard stops it.
      // Without that guard the parser would read past the end of the buffer.
      const f = await makeAttestation({ truncatedAuthData: true });
      await expect(verifierFor(f.rootPem).verify(claimFor(f))).resolves.toMatchObject({
        verdict: 'FAILED',
      });
    });

    it('rejects an object with no certificate chain', async () => {
      const token = Buffer.from(
        cborEncode({ fmt: 'apple-appattest', attStmt: {}, authData: Buffer.alloc(60) }),
      ).toString('base64');
      await expect(
        new AppAttestVerifier().verify({
          platform: 'ios',
          token,
          deviceId: 'd',
          challenge: CHALLENGE,
          keyId: 'AA==',
        }),
      ).resolves.toMatchObject({ verdict: 'FAILED' });
    });
  });

  describe('UNAVAILABLE — nothing established, as distinct from a failure', () => {
    it('when the team id is not configured', async () => {
      delete process.env['APP_ATTEST_TEAM_ID'];
      const f = await makeAttestation();
      await expect(verifierFor(f.rootPem).verify(claimFor(f))).resolves.toMatchObject({
        verdict: 'UNAVAILABLE',
      });
    });

    it('when the bundle id is not configured', async () => {
      delete process.env['APP_ATTEST_BUNDLE_ID'];
      const f = await makeAttestation();
      await expect(verifierFor(f.rootPem).verify(claimFor(f))).resolves.toMatchObject({
        verdict: 'UNAVAILABLE',
      });
    });

    it('when the client sent no keyId', async () => {
      // Apple attests a KEY; without knowing which, the object cannot be interpreted at all — that is
      // an absence of information, not evidence against the device.
      const f = await makeAttestation();
      await expect(
        verifierFor(f.rootPem).verify({ ...claimFor(f), keyId: null }),
      ).resolves.toMatchObject({ verdict: 'UNAVAILABLE' });
    });

    it('when the token is not decodable at all', async () => {
      await expect(
        new AppAttestVerifier().verify({
          platform: 'ios',
          token: 'not-base64-cbor!!!',
          deviceId: 'd',
          challenge: CHALLENGE,
          keyId: 'AA==',
        }),
      ).resolves.toMatchObject({ verdict: 'UNAVAILABLE' });
    });
  });

  it('never returns the rejection reason to the caller', async () => {
    // The reason is a diagnostic. It ends up on a device row and a security screen, where "aaguid
    // mismatch" tells a field worker nothing and tells an attacker which check to work around.
    const f = await makeAttestation({ counter: 1 });
    const result = await verifierFor(f.rootPem).verify(claimFor(f));
    expect(Object.keys(result)).toEqual(['verdict', 'integrityLevel', 'osVersion']);
    // …but it IS logged, so an operator can see it.
    expect(JSON.stringify(mockLogger.warn.mock.calls)).toContain('counter');
  });
});
