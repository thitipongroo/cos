import { UnauthorizedException } from '@nestjs/common';
import { ContractSignLinkService } from '../contract-sign-link.service';

const SECRET = 'dev-contract-sign-secret-change-me';

/** Forge a token (valid HMAC over an arbitrary payload) to drive each decode branch. */
async function craft(payload: Record<string, unknown>, secret = SECRET): Promise<string> {
  const { createHmac } = await import('node:crypto');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

describe('ContractSignLinkService (ADR-058 CT-4)', () => {
  const svc = new ContractSignLinkService();

  it('issues a token that round-trips through verify (+ matching hash)', async () => {
    const issued = await svc.issue('tenant-1', 'contract-1');
    expect(issued.tokenHash).toBe(await svc.hashToken(issued.token));
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
    await expect(svc.verify(issued.token)).resolves.toEqual({
      tenantId: 'tenant-1',
      contractId: 'contract-1',
    });
  });

  it('rejects a malformed token (no signature part)', async () => {
    await expect(svc.verify('not-a-token')).rejects.toThrow('Malformed token');
  });

  it('rejects a wrong signature of equal length', async () => {
    const t = await craft({ t: 't1', c: 'c1', exp: Date.now() + 1000 }, 'other-secret');
    await expect(svc.verify(t)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a signature of different length', async () => {
    const [body] = (await craft({ t: 't1', c: 'c1', exp: Date.now() + 1000 })).split('.');
    await expect(svc.verify(`${body}.short`)).rejects.toThrow('Invalid token signature');
  });

  it('rejects an expired token', async () => {
    const t = await craft({ t: 't1', c: 'c1', exp: Date.now() - 1000 });
    await expect(svc.verify(t)).rejects.toThrow('Token expired');
  });

  it('rejects a token whose exp is not a number', async () => {
    const t = await craft({ t: 't1', c: 'c1', exp: 'nope' });
    await expect(svc.verify(t)).rejects.toThrow('Token expired');
  });

  it('rejects a token with non-string tenant/contract claims', async () => {
    const t = await craft({ t: 123, c: 'c1', exp: Date.now() + 1000 });
    await expect(svc.verify(t)).rejects.toThrow('Malformed sign token');
  });

  describe('secret resolution', () => {
    it('uses CONTRACT_SIGN_SECRET when set (not the dev fallback)', async () => {
      const saved = process.env['CONTRACT_SIGN_SECRET'];
      process.env['CONTRACT_SIGN_SECRET'] = 'env-configured-secret';
      try {
        const configured = new ContractSignLinkService();
        const issued = await configured.issue('t', 'c');
        await expect(configured.verify(issued.token)).resolves.toEqual({
          tenantId: 't',
          contractId: 'c',
        });
        // A token signed with the configured secret must NOT verify under the dev-fallback service.
        await expect(svc.verify(issued.token)).rejects.toThrow('Invalid token signature');
      } finally {
        if (saved === undefined) delete process.env['CONTRACT_SIGN_SECRET'];
        else process.env['CONTRACT_SIGN_SECRET'] = saved;
      }
    });

    it('refuses to construct in production when the secret is unset', () => {
      const savedSecret = process.env['CONTRACT_SIGN_SECRET'];
      const savedEnv = process.env['NODE_ENV'];
      delete process.env['CONTRACT_SIGN_SECRET'];
      process.env['NODE_ENV'] = 'production';
      try {
        expect(() => new ContractSignLinkService()).toThrow(
          'CONTRACT_SIGN_SECRET must be set in production',
        );
      } finally {
        process.env['NODE_ENV'] = savedEnv;
        if (savedSecret !== undefined) process.env['CONTRACT_SIGN_SECRET'] = savedSecret;
      }
    });
  });
});
