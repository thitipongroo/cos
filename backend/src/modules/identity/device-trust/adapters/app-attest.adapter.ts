// App Attest verifier (ADR-082 / ADR-083) — the iOS half of B4-8.
//
// Implements Apple's documented attestation verification. UNLIKE Play Integrity, there is no remote
// service to ask: Apple hands the app a self-contained object and the SERVER does the cryptography.
// Every step below is one of Apple's, and skipping any of them makes the rest decorative:
//
//   1. CBOR-decode the object; require fmt === 'apple-appattest'
//   2. verify the x5c chain up to Apple's PINNED root (apple-app-attest-root.ts)
//   3. clientDataHash = SHA256(challenge)
//   4. nonce = SHA256(authData ‖ clientDataHash)
//   5. the credCert extension 1.2.840.113635.100.8.2 must contain exactly that nonce
//        ← this is the step that binds the attestation to OUR challenge. Without it the object is
//          replayable forever, and every other check would still pass.
//   6. keyIdentifier = SHA256(public key, uncompressed X9.62) must equal the client's keyId
//   7. authData.rpIdHash must equal SHA256("<teamId>.<bundleId>")
//   8. authData.counter must be 0 (this is an attestation, not an assertion)
//   9. authData.aaguid must be 'appattest' + 7×0x00 (production) or 'appattestdevelop'
//
// WHAT IS AND IS NOT TESTED. Every step is exercised against a synthetic chain built with a
// throwaway root, including a negative case per step. What CANNOT be tested here is that a REAL
// attestation from a REAL iPhone satisfies them — ADR-082 records that the Simulator has no Secure
// Enclave, so that only becomes verifiable on hardware. The pinned root's fingerprint is asserted so
// the trust anchor cannot drift unnoticed.

import { Injectable } from '@nestjs/common';
import { X509Certificate, cryptoProvider } from '@peculiar/x509';
import { createLogger } from '@cos/logger';
import {
  UNAVAILABLE,
  type AttestationClaim,
  type AttestationResult,
  type AttestationVerifier,
} from '../attestation-verifier';
import { APPLE_APP_ATTEST_ROOT_CA_PEM } from './apple-app-attest-root';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- builtin, the in-repo idiom
const { createHash, webcrypto } = require('crypto') as typeof import('crypto');

// cbor-x declares `"type": "module"` and ships its CommonJS build at dist/node.cjs. Under this
// package's Node16 resolution an `import` picks the ESM condition and fails to compile, so it is
// required — typed to the ONE function used, rather than pulling in a surface we do not touch.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- ESM-only package in a CJS build
const { decode: cborDecode } = require('cbor-x') as { decode: (buffer: Buffer) => unknown };

const logger = createLogger('app-attest-verifier');

// @peculiar/x509 needs a WebCrypto provider; Node's is not registered by default. The cast is
// unavoidable: this package's tsconfig has no DOM lib, so the global `Crypto` type does not exist.
cryptoProvider.set(webcrypto as unknown as Parameters<typeof cryptoProvider.set>[0]);

/** Apple's credCert extension carrying the nonce (verified against Apple's documentation). */
const NONCE_EXTENSION_OID = '1.2.840.113635.100.8.2';

/** authData is a fixed binary layout; these are its field offsets. */
const RP_ID_HASH = { start: 0, end: 32 };
const COUNTER = { start: 33, end: 37 };
const AAGUID = { start: 37, end: 53 };
const CRED_ID_LENGTH = { start: 53, end: 55 };
const MIN_AUTH_DATA_LENGTH = 55;

/** 'appattest' padded to 16 bytes with NULs (production) and the development marker. */
const AAGUID_PRODUCTION = Buffer.concat([Buffer.from('appattest', 'ascii'), Buffer.alloc(7)]);
const AAGUID_DEVELOPMENT = Buffer.from('appattestdevelop', 'ascii');

interface AttestationObject {
  fmt?: string;
  attStmt?: { x5c?: Buffer[] };
  authData?: Buffer;
}

/**
 * Read the 32-byte nonce out of the credCert extension.
 *
 * The extension is `SEQUENCE { [1] { OCTET STRING } }`. This walks it strictly — every tag and
 * length is checked and anything unexpected returns null rather than being coerced. A lenient
 * "find 32 bytes near the end" reader would accept a malformed certificate that happened to contain
 * the right bytes somewhere, which is exactly the shape of a forged extension.
 */
export function readNonceExtension(der: Buffer): Buffer | null {
  let i = 0;
  const expect = (tag: number): number | null => {
    if (i + 2 > der.length || der[i] !== tag) return null;
    i += 1;
    const len = der[i]!;
    // Only short-form lengths are valid here: the whole structure is 38 bytes.
    if (len > 0x7f) return null;
    i += 1;
    return len;
  };

  if (expect(0x30) === null) return null; // SEQUENCE
  if (expect(0xa1) === null) return null; // [1]
  const octetLen = expect(0x04); //             OCTET STRING
  if (octetLen === null) return null;
  // Apple's nonce is a SHA-256 digest. A different length is not a nonce.
  if (octetLen !== 32 || i + octetLen !== der.length) return null;
  return der.subarray(i, i + octetLen);
}

/** Parse the fields of authData this verifier checks. Null when the buffer is too short to hold them. */
export function parseAuthData(
  authData: Buffer,
): { rpIdHash: Buffer; counter: number; aaguid: Buffer; credentialId: Buffer } | null {
  if (authData.length < MIN_AUTH_DATA_LENGTH) return null;
  const credIdLength = authData.readUInt16BE(CRED_ID_LENGTH.start);
  const credIdEnd = CRED_ID_LENGTH.end + credIdLength;
  if (authData.length < credIdEnd) return null;
  return {
    rpIdHash: authData.subarray(RP_ID_HASH.start, RP_ID_HASH.end),
    counter: authData.readUInt32BE(COUNTER.start),
    aaguid: authData.subarray(AAGUID.start, AAGUID.end),
    credentialId: authData.subarray(CRED_ID_LENGTH.end, credIdEnd),
  };
}

@Injectable()
export class AppAttestVerifier implements AttestationVerifier {
  readonly platform = 'ios';

  private readonly teamId = process.env['APP_ATTEST_TEAM_ID'] ?? '';
  private readonly bundleId = process.env['APP_ATTEST_BUNDLE_ID'] ?? '';
  /**
   * Which aaguid to require. Development builds attest with a DIFFERENT marker, so accepting both
   * unconditionally would let a debug build pass in production — the one thing this field exists to
   * prevent. Defaults to production: an unset variable must not be the lenient choice.
   */
  private readonly expectDevelopment = process.env['APP_ATTEST_ENV'] === 'development';

  /**
   * The trust anchor. A field rather than a direct reference to the constant for exactly one reason:
   * the test suite substitutes a throwaway root so that `chainReachesAppleRoot` — the real method —
   * runs against a chain it can construct. Stubbing the method instead would leave the actual chain
   * logic unexecuted, which on a signature check is the same as not having written it.
   *
   * Nothing in production ever assigns this.
   */
  protected readonly rootPem: string = APPLE_APP_ATTEST_ROOT_CA_PEM;

  async verify(claim: AttestationClaim): Promise<AttestationResult> {
    if (!this.teamId || !this.bundleId || !claim.keyId) return UNAVAILABLE;

    try {
      return await this.check(claim, claim.keyId);
    } catch (err) {
      // A malformed object is indistinguishable here from a library edge case, and neither is proof
      // that the DEVICE is compromised — so this is UNAVAILABLE, not FAILED.
      logger.warn({ err: String(err), event: 'app_attest.verify_failed' }, 'verification failed');
      return UNAVAILABLE;
    }
  }

  private async check(claim: AttestationClaim, keyId: string): Promise<AttestationResult> {
    // ── 1. decode ────────────────────────────────────────────────────────────
    const object = cborDecode(Buffer.from(claim.token, 'base64')) as AttestationObject;
    if (object.fmt !== 'apple-appattest') return this.reject('fmt');

    const chain = object.attStmt?.x5c;
    const authData = object.authData;
    if (!chain?.length || !Buffer.isBuffer(authData)) return this.reject('shape');

    // ── 2. chain ─────────────────────────────────────────────────────────────
    const credCert = new X509Certificate(new Uint8Array(chain[0]!));
    if (!(await this.chainReachesAppleRoot(chain))) return this.reject('chain');

    // ── 3-4. nonce ───────────────────────────────────────────────────────────
    const clientDataHash = createHash('sha256').update(claim.challenge, 'utf8').digest();
    const nonce = createHash('sha256')
      .update(Buffer.concat([authData, clientDataHash]))
      .digest();

    // ── 5. the nonce must be the one in the certificate ─────────────────────
    const extension = credCert.getExtension(NONCE_EXTENSION_OID);
    if (!extension) return this.reject('nonce-extension-missing');
    const certNonce = readNonceExtension(Buffer.from(extension.value));
    // timingSafeEqual needs equal lengths; readNonceExtension already guarantees 32.
    if (!certNonce || !certNonce.equals(nonce)) return this.reject('nonce-mismatch');

    // ── 6. the key id must be the hash of the attested public key ───────────
    const rawKey = Buffer.from(
      await webcrypto.subtle.exportKey(
        'raw',
        await webcrypto.subtle.importKey(
          'spki',
          credCert.publicKey.rawData,
          { name: 'ECDSA', namedCurve: 'P-256' },
          true,
          [],
        ),
      ),
    );
    const expectedKeyId = createHash('sha256').update(rawKey).digest();
    if (!expectedKeyId.equals(Buffer.from(keyId, 'base64'))) return this.reject('key-id');

    // ── 7-9. authData ────────────────────────────────────────────────────────
    const parsed = parseAuthData(authData);
    if (!parsed) return this.reject('auth-data');

    const appIdHash = createHash('sha256').update(`${this.teamId}.${this.bundleId}`).digest();
    if (!parsed.rpIdHash.equals(appIdHash)) return this.reject('app-id');

    // An attestation is the FIRST use of a key. A non-zero counter means this is a replayed or
    // reused artefact, not a fresh enrolment.
    if (parsed.counter !== 0) return this.reject('counter');

    const expectedAaguid = this.expectDevelopment ? AAGUID_DEVELOPMENT : AAGUID_PRODUCTION;
    if (!parsed.aaguid.equals(expectedAaguid)) return this.reject('aaguid');

    // Apple sets credentialId to the key identifier, so this is a consistency check on the object
    // rather than a new fact — but a mismatch means the object was assembled, not issued.
    if (!parsed.credentialId.equals(expectedKeyId)) return this.reject('credential-id');

    // App Attest attests the APP, not the device (ADR-083): there is no integrity tier and no OS
    // signal to report. A passing attestation says "genuine app on genuine Apple hardware", which is
    // exactly PASSED with nothing else known.
    return { verdict: 'PASSED', integrityLevel: null, osVersion: null };
  }

  /**
   * Every certificate must be signed by the next, and the last by Apple's pinned root.
   *
   * `signatureOnly: false` so validity dates are checked too — an expired credCert is not evidence
   * about a device today.
   */
  private async chainReachesAppleRoot(chain: Buffer[]): Promise<boolean> {
    const root = new X509Certificate(this.rootPem);
    const certs = chain.map((der) => new X509Certificate(new Uint8Array(der)));

    for (let i = 0; i < certs.length; i += 1) {
      const issuer = certs[i + 1] ?? root;
      if (!(await certs[i]!.verify({ publicKey: issuer.publicKey, signatureOnly: false }))) {
        return false;
      }
    }
    // The top of the presented chain must actually be issued by Apple's root, not merely verifiable
    // against something the client also supplied.
    return await certs[certs.length - 1]!.verify({
      publicKey: root.publicKey,
      signatureOnly: true,
    });
  }

  /**
   * A step failed. FAILED, not UNAVAILABLE: unlike a network problem, every branch that reaches here
   * has cryptographic evidence that the object is not a genuine attestation of this app on this
   * device — which is a finding, and recording it as "could not tell" would discard it.
   *
   * The reason is logged but never returned; it ends up on a device row and a security screen.
   */
  private reject(step: string): AttestationResult {
    logger.warn({ step, event: 'app_attest.rejected' }, 'attestation rejected');
    return { verdict: 'FAILED', integrityLevel: null, osVersion: null };
  }
}
