// Play Integrity verifier (ADR-082 / ADR-083) — the Android half of B4-8.
//
// STANDARD REQUESTS MUST BE DECRYPTED BY GOOGLE. The documentation is explicit: "To obtain the
// device integrity verdicts, you must decrypt the integrity token on Google's servers." Local
// decryption with response encryption keys is a CLASSIC-request feature and does not apply here, so
// this adapter is a service-account-authenticated REST call, not a crypto routine.
//
// WHAT IS CHECKED, in order, before any verdict is believed:
//   1. `requestDetails.requestHash` equals SHA256(challenge|deviceId) — the token answers OUR nonce
//   2. `requestDetails.requestPackageName` equals our package — the token is for OUR app
//   3. `deviceIntegrity.deviceRecognitionVerdict` — the verdict itself
//
// Skipping (1) would accept a token minted for any other request on the same device; skipping (2)
// would accept a token minted for a different app entirely. Google's own guidance is to "always
// verify requestDetails first before checking other verdicts".
//
// AN EMPTY VERDICT ARRAY IS A FAILURE, NOT AN ABSENCE. Google omits the field when the device "shows
// signs of attack (API hooking, rooting), system compromise, or [is] not running on a physical
// device". That is precisely the state this feature exists to detect, so it maps to FAILED — mapping
// it to UNAVAILABLE would file a detected compromise under "we could not tell".

import { Injectable } from '@nestjs/common';
import { createLogger } from '@cos/logger';
import {
  UNAVAILABLE,
  type AttestationClaim,
  type AttestationResult,
  type AttestationVerifier,
  type DeviceIntegrityLevel,
} from '../attestation-verifier';
import { GoogleAccessTokenProvider, loadServiceAccount } from './google-service-account';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- builtin, the in-repo idiom
const { createHash } = require('crypto') as typeof import('crypto');

const logger = createLogger('play-integrity-verifier');

const REQUEST_TIMEOUT_MS = 10_000;

/** The decoded payload's shape. Every field is optional — Google includes only what it evaluated. */
interface TokenPayload {
  requestDetails?: {
    requestHash?: string;
    requestPackageName?: string;
    timestampMillis?: string;
  };
  deviceIntegrity?: {
    deviceRecognitionVerdict?: string[];
    deviceAttributes?: { sdkVersion?: number };
  };
}

/**
 * The digest the CLIENT put in `requestHash`, recomputed here.
 *
 * Must stay identical to `buildRequestHash` in apps/mobile/src/lib/appIntegrity.ts. The two live in
 * different packages and cannot share code, so the formula is stated in both and asserted in both
 * test suites — a drift here silently rejects every Android attestation.
 */
export function expectedRequestHash(challenge: string, deviceId: string): string {
  return createHash('sha256').update(`${challenge}|${deviceId}`).digest('base64');
}

/**
 * Map Google's verdict array to our tier.
 *
 * The array can carry several values at once (a strong device reports basic + device + strong), so
 * this picks the STRONGEST present rather than reading whichever came first.
 */
export function toIntegrityLevel(verdicts: string[]): DeviceIntegrityLevel | null {
  if (verdicts.includes('MEETS_STRONG_INTEGRITY')) return 'STRONG';
  if (verdicts.includes('MEETS_DEVICE_INTEGRITY')) return 'DEVICE';
  if (verdicts.includes('MEETS_BASIC_INTEGRITY')) return 'BASIC';
  return null;
}

@Injectable()
export class PlayIntegrityVerifier implements AttestationVerifier {
  readonly platform = 'android';

  private readonly packageName = process.env['PLAY_INTEGRITY_PACKAGE_NAME'] ?? '';
  private readonly tokens: GoogleAccessTokenProvider | null;

  constructor() {
    const key = loadServiceAccount(process.env['PLAY_INTEGRITY_SERVICE_ACCOUNT']);
    this.tokens = key ? new GoogleAccessTokenProvider(key) : null;
  }

  async verify(claim: AttestationClaim): Promise<AttestationResult> {
    // Unconfigured is UNAVAILABLE, never FAILED. A deployment without a service account has
    // established nothing about the device, and marking every Android device as failing integrity
    // because an operator has not set an env var would be a fleet-wide false accusation.
    if (!this.tokens || !this.packageName) return UNAVAILABLE;

    const accessToken = await this.tokens.getAccessToken();
    if (!accessToken) return UNAVAILABLE;

    const payload = await this.decode(claim.token, accessToken);
    if (!payload) return UNAVAILABLE;

    // (1) The token must answer OUR challenge. Google returns requestHash verbatim, so this is a
    // straight comparison against the digest the client was asked to send.
    const expected = expectedRequestHash(claim.challenge, claim.deviceId);
    if (payload.requestDetails?.requestHash !== expected) {
      logger.warn(
        { event: 'play_integrity.request_hash_mismatch' },
        'token answers another request',
      );
      return UNAVAILABLE;
    }

    // (2) …and it must be for OUR app. A valid token for a different package proves nothing here.
    if (payload.requestDetails.requestPackageName !== this.packageName) {
      logger.warn({ event: 'play_integrity.package_mismatch' }, 'token minted for another package');
      return UNAVAILABLE;
    }

    // (3) Only now is the verdict itself meaningful.
    const verdicts = payload.deviceIntegrity?.deviceRecognitionVerdict ?? [];
    const level = toIntegrityLevel(verdicts);

    // MEETS_VIRTUAL_INTEGRITY means a genuine Android EMULATOR with Play services. Legitimate for
    // Google Play Games on PC; not for a construction crew's handset. It carries no device tier, so
    // it falls through to FAILED here rather than being quietly accepted.
    if (level === null) {
      return { verdict: 'FAILED', integrityLevel: null, osVersion: null };
    }

    const sdkVersion = payload.deviceIntegrity?.deviceAttributes?.sdkVersion;
    return {
      verdict: 'PASSED',
      integrityLevel: level,
      // The one server-verified OS signal either platform offers (ADR-083). A number in the payload;
      // stored as text because the column holds an opaque platform-reported value.
      osVersion: typeof sdkVersion === 'number' ? String(sdkVersion) : null,
    };
  }

  /** POST the token to Google for decryption. Null on any non-2xx, transport failure or timeout. */
  private async decode(integrityToken: string, accessToken: string): Promise<TokenPayload | null> {
    const url =
      `https://playintegrity.googleapis.com/v1/${encodeURIComponent(this.packageName)}` +
      ':decodeIntegrityToken';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ integrity_token: integrityToken }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        // Status only — the body can echo the token, which is a bearer assertion about a real device.
        logger.warn(
          { status: res.status, event: 'play_integrity.decode_rejected' },
          'decode failed',
        );
        return null;
      }
      const body = (await res.json()) as { tokenPayloadExternal?: TokenPayload };
      return body.tokenPayloadExternal ?? null;
    } catch (err) {
      logger.warn({ err: String(err), event: 'play_integrity.decode_failed' }, 'decode failed');
      return null;
    }
  }
}
