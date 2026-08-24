// MagicLinkService — Vendor Portal external auth tokens (ADR-030, §05 §5.4.3).
//
// Two HMAC-signed token types (no Keycloak — vendors are not platform.users):
//   - invitation token (Tier 1): { t: tenant_id, i: invitation_id } — short-lived (15 min),
//     carries tenant_id so the verifier can SET the tenant context BEFORE the RLS-protected
//     rfq_invitations lookup. Single-use is enforced by the row's status + token_hash.
//   - session token (Tier 2): { v: vendor_identity_id } — longer-lived (7 days), for PO-status
//     tracking and invoice submission.
//
// Token format: base64url(payload) + "." + base64url(HMAC_SHA256(payload)). The raw token is never
// stored; only sha256(token) (token_hash) is persisted, compared with timingSafeEqual.

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'crypto';

const INVITATION_TTL_MS = 15 * 60 * 1000; // 15 minutes (§05 §5.4.3: 5–15 min)
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface InvitationClaims {
  tenantId: string;
  invitationId: string;
}

export interface IssuedInvitation {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

@Injectable()
export class MagicLinkService {
  private readonly secret: string;

  constructor() {
    // The HMAC key is the sole authenticity control for these external-party tokens. In production it
    // MUST be injected (AWS Secrets Manager / Vault) — refuse to boot rather than silently fall back to a
    // source-visible constant that would let anyone forge tokens. A dev-only fallback keeps local/test easy.
    const configured = process.env['VENDOR_PORTAL_SECRET'];
    if (configured) {
      this.secret = configured;
    } else if (process.env['NODE_ENV'] === 'production') {
      throw new Error('VENDOR_PORTAL_SECRET must be set in production');
    } else {
      this.secret = 'dev-vendor-portal-secret-change-me';
    }
  }

  /** Tier-1 invitation token bound to a tenant + invitation. */
  issueInvitationToken(tenantId: string, invitationId: string): IssuedInvitation {
    const exp = Date.now() + INVITATION_TTL_MS;
    const token = this.sign({
      t: tenantId,
      i: invitationId,
      exp,
      n: randomBytes(16).toString('hex'),
    });
    return { token, tokenHash: this.hashToken(token), expiresAt: new Date(exp) };
  }

  /** Verify a Tier-1 token: checks signature + expiry, returns the tenant + invitation it carries. */
  verifyInvitationToken(token: string): InvitationClaims {
    const payload = this.verify(token);
    if (typeof payload['t'] !== 'string' || typeof payload['i'] !== 'string') {
      throw new UnauthorizedException('Malformed invitation token');
    }
    return { tenantId: payload['t'], invitationId: payload['i'] };
  }

  /** Tier-2 session token bound to a vendor identity. */
  issueSessionToken(vendorIdentityId: string): string {
    const exp = Date.now() + SESSION_TTL_MS;
    return this.sign({ v: vendorIdentityId, exp, n: randomBytes(16).toString('hex') });
  }

  /** Verify a Tier-2 token: returns the vendor_identity_id it carries. */
  verifySessionToken(token: string): string {
    const payload = this.verify(token);
    if (typeof payload['v'] !== 'string') {
      throw new UnauthorizedException('Malformed session token');
    }
    return payload['v'];
  }

  /** sha256 of the raw token — the only form persisted (rfq_invitations.token_hash). */
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // ── internals ───────────────────────────────────────────────────────────────

  private sign(payload: Record<string, unknown>): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', this.secret).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  private verify(token: string): Record<string, unknown> {
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
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      /* istanbul ignore next -- defensive: a signature-valid token always carries JSON we wrote */
      throw new UnauthorizedException('Malformed token payload');
    }
    if (typeof payload['exp'] !== 'number' || payload['exp'] < Date.now()) {
      throw new UnauthorizedException('Token expired');
    }
    return payload;
  }
}
