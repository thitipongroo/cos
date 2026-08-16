// Unit tests — SubjectVerificationService (ADR-090 §6).
//
// This token is the only thing standing between "the subject proved control of the address on file"
// and "an admin ticked a box", so the forgery paths matter more than the happy one: a tampered
// payload, a truncated signature, an expired link, and a token that never had a signature at all.

import { UnauthorizedException } from '@nestjs/common';
import { SubjectVerificationService } from '../subject-verification.service';

const TENANT = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';

describe('SubjectVerificationService', () => {
  let service: SubjectVerificationService;

  beforeEach(() => {
    delete process.env['SUBJECT_VERIFY_SECRET'];
    delete process.env['NODE_ENV'];
    service = new SubjectVerificationService();
  });

  it('round-trips a token it issued', async () => {
    const issued = await service.issue(TENANT, REQUEST_ID);
    await expect(service.verify(issued.token)).resolves.toEqual({
      tenantId: TENANT,
      requestId: REQUEST_ID,
    });
    // Only the hash is ever stored, so it must be derivable from the raw token and nothing else.
    await expect(service.hashToken(issued.token)).resolves.toBe(issued.tokenHash);
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('issues a different token every time for the same request', async () => {
    // The nonce is what stops a re-issued link colliding with the one it replaces.
    const a = await service.issue(TENANT, REQUEST_ID);
    const b = await service.issue(TENANT, REQUEST_ID);
    expect(a.token).not.toBe(b.token);
  });

  it('rejects a tampered payload', async () => {
    const issued = await service.issue(TENANT, REQUEST_ID);
    const [, sig] = issued.token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ t: 'other-tenant', r: REQUEST_ID, exp: Date.now() + 1000 }),
      'utf-8',
    ).toString('base64url');
    await expect(service.verify(`${forged}.${sig!}`)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a signature of the wrong length without throwing from timingSafeEqual', async () => {
    // timingSafeEqual THROWS on a length mismatch rather than returning false, so the length check
    // has to come first — otherwise a short signature is a 500, not a 401.
    const issued = await service.issue(TENANT, REQUEST_ID);
    const [body] = issued.token.split('.');
    await expect(service.verify(`${body!}.short`)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token with no signature at all', async () => {
    await expect(service.verify('no-dot-here')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired link', async () => {
    const issued = await service.issue(TENANT, REQUEST_ID);
    // 7 days + a minute.
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 7 * 24 * 60 * 60 * 1000 + 60_000);
    await expect(service.verify(issued.token)).rejects.toBeInstanceOf(UnauthorizedException);
    jest.restoreAllMocks();
  });

  it('rejects a correctly-signed token whose payload is not the expected shape', async () => {
    const signer = new SubjectVerificationService();
    // Sign a payload with no `r`: a valid signature over the wrong claims must still be refused.
    const token = await (
      signer as unknown as { sign(p: Record<string, unknown>): Promise<string> }
    ).sign({ t: TENANT, exp: Date.now() + 60_000 });
    await expect(service.verify(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a correctly-signed token whose body is not JSON', async () => {
    const { createHmac } = await import('node:crypto');
    const body = Buffer.from('not json', 'utf-8').toString('base64url');
    const sig = createHmac('sha256', 'dev-subject-verify-secret-change-me')
      .update(body)
      .digest('base64url');
    await expect(service.verify(`${body}.${sig}`)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('uses a configured secret when one is set', async () => {
    process.env['SUBJECT_VERIFY_SECRET'] = 'a-real-secret';
    const configured = new SubjectVerificationService();
    const issued = await configured.issue(TENANT, REQUEST_ID);
    // The default-secret instance must not accept it — otherwise the env var would be decorative.
    await expect(service.verify(issued.token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses to construct in production without a secret', () => {
    // A source-visible fallback would let anyone forge a verification, turning "proved" into
    // "asserted". Fail to boot instead.
    process.env['NODE_ENV'] = 'production';
    expect(() => new SubjectVerificationService()).toThrow('SUBJECT_VERIFY_SECRET');
  });
});
