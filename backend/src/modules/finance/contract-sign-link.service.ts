// ContractSignLinkService — client contract-signing magic-link tokens (ADR-058 CT-4; ADR-030 pattern).
//
// An HMAC-signed, self-expiring token lets an external client sign a contract without a platform account.
// Token format (same shape as the vendor-portal MagicLinkService): base64url(payload) + "." +
// base64url(HMAC_SHA256(payload)). The raw token is never stored — only sha256(token) (token_hash) is
// persisted (finance.contract_sign_tokens); single-use is enforced there (used_at).
//
// Finance-local (not the vendor MagicLinkService, which is vendor-semantic and unexported) to keep the
// modules decoupled; the crypto is the same proven pattern. node:crypto is loaded via a cached dynamic
// import (a repo import guard reserves static bare imports for package.json deps).

import { Injectable, UnauthorizedException } from '@nestjs/common';

const SIGN_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — clients need time to review + sign

export interface IssuedSignToken {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface SignTokenClaims {
  tenantId: string;
  contractId: string;
}

// The HMAC key is the sole authenticity control for these external-party tokens. In production it MUST
// be injected (AWS Secrets Manager / Vault) — refuse to boot rather than silently fall back to a
// source-visible constant that would let anyone forge tokens. A dev-only fallback keeps local/test easy.
function resolveSignSecret(): string {
  const configured = process.env['CONTRACT_SIGN_SECRET'];
  if (configured) return configured;
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('CONTRACT_SIGN_SECRET must be set in production');
  }
  return 'dev-contract-sign-secret-change-me';
}

@Injectable()
export class ContractSignLinkService {
  private readonly secret = resolveSignSecret();
  private cryptoLib?: typeof import('node:crypto');

  private async lib(): Promise<typeof import('node:crypto')> {
    return (this.cryptoLib ??= await import('node:crypto'));
  }

  /** Issue a token bound to a tenant + contract. Returns the raw token (to send) + its hash (to store). */
  async issue(tenantId: string, contractId: string): Promise<IssuedSignToken> {
    const { randomBytes } = await this.lib();
    const exp = Date.now() + SIGN_TOKEN_TTL_MS;
    const token = await this.sign({
      t: tenantId,
      c: contractId,
      exp,
      n: randomBytes(16).toString('hex'),
    });
    return { token, tokenHash: await this.hashToken(token), expiresAt: new Date(exp) };
  }

  /** Verify a token: checks signature + expiry, returns the tenant + contract it carries. */
  async verify(token: string): Promise<SignTokenClaims> {
    const payload = await this.decode(token);
    if (typeof payload['t'] !== 'string' || typeof payload['c'] !== 'string') {
      throw new UnauthorizedException('Malformed sign token');
    }
    return { tenantId: payload['t'], contractId: payload['c'] };
  }

  /** sha256 of the raw token — the only form persisted (contract_sign_tokens.token_hash). */
  async hashToken(token: string): Promise<string> {
    const { createHash } = await this.lib();
    return createHash('sha256').update(token).digest('hex');
  }

  // ── internals ───────────────────────────────────────────────────────────────

  private async sign(payload: Record<string, unknown>): Promise<string> {
    const { createHmac } = await this.lib();
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', this.secret).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  private async decode(token: string): Promise<Record<string, unknown>> {
    const { createHmac, timingSafeEqual } = await this.lib();
    const parts = token.split('.');
    if (parts.length !== 2) {
      throw new UnauthorizedException('Malformed token');
    }
    const [body, sig] = parts;
    const expected = createHmac('sha256', this.secret).update(body).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new UnauthorizedException('Invalid token signature');
    }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (typeof payload['exp'] !== 'number' || payload['exp'] < Date.now()) {
      throw new UnauthorizedException('Token expired');
    }
    return payload;
  }
}
