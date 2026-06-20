import { UnauthorizedException } from '@nestjs/common';
import { MagicLinkService } from '../magic-link.service';

// Access the private signer so tests can craft arbitrary payloads to hit every verify branch
// (no crypto import needed — we reuse the service's own HMAC).
type Signer = { sign(payload: Record<string, unknown>): string };

describe('MagicLinkService', () => {
  let svc: MagicLinkService;
  let sign: (payload: Record<string, unknown>) => string;

  beforeAll(() => {
    process.env['VENDOR_PORTAL_SECRET'] = 'test-secret';
  });
  beforeEach(() => {
    svc = new MagicLinkService();
    sign = (p) => (svc as unknown as Signer).sign(p);
  });

  describe('invitation token', () => {
    it('issues a token + hash + expiry and round-trips', () => {
      const issued = svc.issueInvitationToken('t-1', 'inv-1');
      expect(issued.token).toContain('.');
      expect(issued.tokenHash).toHaveLength(64); // sha256 hex
      expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(svc.verifyInvitationToken(issued.token)).toEqual({
        tenantId: 't-1',
        invitationId: 'inv-1',
      });
    });

    it('rejects a malformed token (wrong number of parts)', () => {
      expect(() => svc.verifyInvitationToken('only-one-part')).toThrow(UnauthorizedException);
    });

    it('rejects a signature of different length', () => {
      const [body] = svc.issueInvitationToken('t', 'i').token.split('.');
      expect(() => svc.verifyInvitationToken(`${body}.short`)).toThrow('Invalid token signature');
    });

    it('rejects a tampered signature of equal length', () => {
      const [body, sig] = svc.issueInvitationToken('t', 'i').token.split('.');
      const tampered = sig[0] === 'A' ? `B${sig.slice(1)}` : `A${sig.slice(1)}`;
      expect(() => svc.verifyInvitationToken(`${body}.${tampered}`)).toThrow(
        'Invalid token signature',
      );
    });

    it('rejects when exp is missing/not a number', () => {
      expect(() => svc.verifyInvitationToken(sign({ t: 'x', i: 'y' }))).toThrow('Token expired');
    });

    it('rejects an expired token', () => {
      expect(() =>
        svc.verifyInvitationToken(sign({ t: 'x', i: 'y', exp: Date.now() - 1 })),
      ).toThrow('Token expired');
    });

    it('rejects when claims are the wrong type', () => {
      expect(() => svc.verifyInvitationToken(sign({ t: 1, i: 2, exp: Date.now() + 1000 }))).toThrow(
        'Malformed invitation token',
      );
    });
  });

  describe('session token', () => {
    it('round-trips a vendor_identity_id', () => {
      expect(svc.verifySessionToken(svc.issueSessionToken('vid-1'))).toBe('vid-1');
    });

    it('rejects a session token without v', () => {
      expect(() => svc.verifySessionToken(sign({ exp: Date.now() + 1000 }))).toThrow(
        'Malformed session token',
      );
    });
  });

  it('hashToken is deterministic sha256 hex', () => {
    expect(svc.hashToken('abc')).toBe(svc.hashToken('abc'));
    expect(svc.hashToken('abc')).toHaveLength(64);
  });

  it('falls back to a default secret when the env var is unset', () => {
    const saved = process.env['VENDOR_PORTAL_SECRET'];
    delete process.env['VENDOR_PORTAL_SECRET'];
    try {
      const fallback = new MagicLinkService();
      const issued = fallback.issueInvitationToken('a', 'b');
      expect(fallback.verifyInvitationToken(issued.token)).toEqual({
        tenantId: 'a',
        invitationId: 'b',
      });
    } finally {
      process.env['VENDOR_PORTAL_SECRET'] = saved;
    }
  });
});
