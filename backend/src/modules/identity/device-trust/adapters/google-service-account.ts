// Google service-account access tokens for the Play Integrity API (ADR-082).
//
// NO NEW DEPENDENCY, deliberately. The JWT-bearer flow is a signed assertion exchanged for an access
// token, and `node:crypto` signs RS256 natively — pulling in a Google client library to do that would
// add a large transitive tree to this service for one HTTP call and one signature.
//
// The flow (RFC 7523, as Google implements it):
//   1. build a JWT asserting `iss = client_email`, `scope = .../auth/playintegrity`,
//      `aud = https://oauth2.googleapis.com/token`
//   2. sign it RS256 with the service account's private key
//   3. POST it to the token endpoint as a `jwt-bearer` grant
//   4. receive a short-lived access token
//
// The private key is a SECRET and is never logged, never returned, and never included in an error.

import { createLogger } from '@cos/logger';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- builtin, the in-repo idiom
const { createSign } = require('crypto') as typeof import('crypto');

const logger = createLogger('google-service-account');

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const PLAY_INTEGRITY_SCOPE = 'https://www.googleapis.com/auth/playintegrity';
/** Google caps assertion lifetime at one hour; a short one bounds the damage if it ever leaks. */
const ASSERTION_TTL_SECONDS = 3600;
/**
 * Re-mint slightly before expiry so a request never races the boundary. A token that expires
 * mid-flight surfaces as a 401 from Google and would be read as "attestation unavailable" — a
 * self-inflicted gap in a security signal.
 */
const REFRESH_SKEW_SECONDS = 60;

export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

/**
 * Parse the service-account JSON from the environment. Null when unset or unusable.
 *
 * Null rather than throwing: an unconfigured deployment must degrade to "no attestation", not fail
 * to boot. ADR-082 makes attestation additive, and a backend that refuses to start because a
 * Play Integrity credential is missing would turn an optional signal into a hard dependency.
 */
export function loadServiceAccount(raw: string | undefined): ServiceAccountKey | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccountKey>;
    if (!parsed.client_email || !parsed.private_key) {
      logger.warn(
        { event: 'google.service_account.incomplete' },
        'PLAY_INTEGRITY_SERVICE_ACCOUNT is set but has no client_email/private_key — ignoring.',
      );
      return null;
    }
    // Env vars cannot carry real newlines through most orchestrators, so the PEM is conventionally
    // stored with escaped ones. Restoring them here is what makes the key parseable by node:crypto.
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, '\n'),
    };
  } catch {
    // Never echo the value — it contains a private key.
    logger.warn(
      { event: 'google.service_account.unparseable' },
      'PLAY_INTEGRITY_SERVICE_ACCOUNT is not valid JSON — ignoring.',
    );
    return null;
  }
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

/** Build and sign the RS256 assertion Google exchanges for an access token. */
export function buildAssertion(key: ServiceAccountKey, nowSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: PLAY_INTEGRITY_SCOPE,
      aud: TOKEN_ENDPOINT,
      iat: nowSeconds,
      exp: nowSeconds + ASSERTION_TTL_SECONDS,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(key.private_key);
  return `${signingInput}.${base64url(signature)}`;
}

/**
 * Mint and cache an access token for the Play Integrity scope.
 *
 * Cached because attestation runs on every device enrolment and Google's token endpoint is rate
 * limited; re-minting per request would spend a network round trip and a signature to obtain a
 * credential that is still valid for another 59 minutes.
 */
export class GoogleAccessTokenProvider {
  private cached: { token: string; expiresAtSeconds: number } | null = null;

  constructor(private readonly key: ServiceAccountKey) {}

  /** A valid access token, or null when Google refused. Never throws — the caller degrades. */
  async getAccessToken(): Promise<string | null> {
    const now = Math.floor(Date.now() / 1000);
    if (this.cached && this.cached.expiresAtSeconds - REFRESH_SKEW_SECONDS > now) {
      return this.cached.token;
    }

    try {
      const res = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: buildAssertion(this.key, now),
        }).toString(),
      });
      if (!res.ok) {
        // Status only. Google's error body can echo parts of the assertion, and this line goes to a
        // log aggregator.
        logger.warn(
          { status: res.status, event: 'google.token.rejected' },
          'token request refused',
        );
        return null;
      }
      const body = (await res.json()) as { access_token?: string; expires_in?: number };
      if (!body.access_token) return null;

      this.cached = {
        token: body.access_token,
        expiresAtSeconds: now + (body.expires_in ?? ASSERTION_TTL_SECONDS),
      };
      return body.access_token;
    } catch (err) {
      logger.warn({ err: String(err), event: 'google.token.failed' }, 'token request failed');
      return null;
    }
  }
}
