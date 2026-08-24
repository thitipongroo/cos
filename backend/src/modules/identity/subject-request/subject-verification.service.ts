// Verification tokens for a subject request (ADR-090 §6; ADR-030 / ADR-058 pattern).
//
// An HMAC-signed, self-expiring token lets a person with NO platform account prove they control the
// identifier the tenant already holds. Token format is the one the vendor-portal and contract-signing
// links use: base64url(payload) + "." + base64url(HMAC_SHA256(payload)). The raw token goes out in
// the email; only sha256(token) is stored, so a database copy cannot be replayed as a live link.
//
// Local to this module rather than shared with ContractSignLinkService, for the reason that service
// gives for not reusing the vendor MagicLinkService: the claims are request-semantic, and coupling
// three modules to one token type buys nothing. The crypto is the same proven pattern.
//
// node:crypto is loaded via a cached dynamic import — a repo import guard reserves static bare
// imports for package.json dependencies.

import { Injectable, UnauthorizedException } from '@nestjs/common';

// 7 days. Long enough that a person who reads mail weekly is not shut out, short enough that a link
// found in an old mailbox is dead. The PDPA §30 answer window is 30 days, so a lapsed link still
// leaves the tenant time to re-issue and answer.
const VERIFY_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface IssuedVerificationToken {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface VerificationClaims {
  tenantId: string;
  requestId: string;
}

/**
 * The HMAC key is the sole authenticity control on these external-party tokens: anyone holding it can
 * forge a verification, which would turn "proved" into "asserted". Refuse to boot in production
 * rather than fall back to a source-visible constant. A dev fallback keeps local and test easy.
 */
function resolveVerifySecret(): string {
  const configured = process.env['SUBJECT_VERIFY_SECRET'];
  if (configured) return configured;
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('SUBJECT_VERIFY_SECRET must be set in production');
  }
  return 'dev-subject-verify-secret-change-me';
}

@Injectable()
export class SubjectVerificationService {
  private readonly secret = resolveVerifySecret();
  private cryptoLib?: typeof import('node:crypto');

  private async lib(): Promise<typeof import('node:crypto')> {
    return (this.cryptoLib ??= await import('node:crypto'));
  }

  /** Issue a token bound to a tenant + request. Returns the raw token (to send) and its hash (to store). */
  async issue(tenantId: string, requestId: string): Promise<IssuedVerificationToken> {
    const { randomBytes } = await this.lib();
    const exp = Date.now() + VERIFY_TOKEN_TTL_MS;
    const token = await this.sign({
      t: tenantId,
      r: requestId,
      exp,
      n: randomBytes(16).toString('hex'),
    });
    return { token, tokenHash: await this.hashToken(token), expiresAt: new Date(exp) };
  }

  /** Verify signature + expiry and return the claims. Throws 401 on anything that does not check out. */
  async verify(token: string): Promise<VerificationClaims> {
    const payload = await this.decode(token);
    if (typeof payload['t'] !== 'string' || typeof payload['r'] !== 'string') {
      throw new UnauthorizedException('Malformed verification token');
    }
    return { tenantId: payload['t'], requestId: payload['r'] };
  }

  /** sha256 of the raw token — the only form persisted. */
  async hashToken(token: string): Promise<string> {
    const { createHash } = await this.lib();
    return createHash('sha256').update(token).digest('hex');
  }

  private async sign(payload: Record<string, unknown>): Promise<string> {
    const { createHmac } = await this.lib();
    const body = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
    const sig = createHmac('sha256', this.secret).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  private async decode(token: string): Promise<Record<string, unknown>> {
    const { createHmac, timingSafeEqual } = await this.lib();
    const [body, sig] = token.split('.');
    if (!body || !sig) throw new UnauthorizedException('Malformed verification token');

    const expected = createHmac('sha256', this.secret).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    // Length check first: timingSafeEqual throws on a length mismatch rather than returning false.
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid verification token');
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as Record<
        string,
        unknown
      >;
    } catch {
      throw new UnauthorizedException('Malformed verification token');
    }

    if (typeof payload['exp'] !== 'number' || payload['exp'] < Date.now()) {
      throw new UnauthorizedException('Verification link has expired');
    }
    return payload;
  }
}
