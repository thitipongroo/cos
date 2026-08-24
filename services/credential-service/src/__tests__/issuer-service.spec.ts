import { jest } from '@jest/globals';
import type { Pool } from 'pg';
import { getOrProvisionIssuer } from '../issuer-service.js';

function poolWith(selectRows: unknown[]): { pool: Pool; sqls: () => string[] } {
  const calls: string[] = [];
  const query = jest.fn(async (sql: unknown, _params?: unknown) => {
    calls.push(String(sql));
    if (String(sql).includes('SELECT did')) return { rows: selectRows };
    return { rows: [] };
  });
  const client = { query, release: jest.fn() };
  return { pool: { connect: jest.fn(async () => client) } as unknown as Pool, sqls: () => calls };
}

describe('issuer-service (CS-8b)', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.APP_SECRET_ENCRYPTION_KEY;
  });

  it('returns the existing issuer without provisioning', async () => {
    const existing = {
      did: 'did:web:cos.dev:tenants:t1',
      encrypted_private_key: 'blob',
      did_document: { verificationMethod: [{ publicKeyMultibase: 'z6MkPub' }] },
    };
    const { pool, sqls } = poolWith([existing]);
    const issuer = await getOrProvisionIssuer(pool, 't1', 'cos.dev');
    expect(issuer.did).toBe('did:web:cos.dev:tenants:t1');
    expect(sqls().some((s) => s.includes('INSERT INTO credentials.did_documents'))).toBe(false);
  });

  it('provisions a new issuer when none exists', async () => {
    const { pool, sqls } = poolWith([]); // no existing issuer
    const issuer = await getOrProvisionIssuer(pool, 't9', 'cos.dev');
    expect(issuer.did).toBe('did:web:cos.dev:tenants:t9');
    expect(issuer.publicKeyMultibase).toMatch(/^z6Mk/);
    expect(issuer.encryptedPrivateKey.split(':')).toHaveLength(3);
    expect(sqls().some((s) => s.includes('INSERT INTO credentials.did_documents'))).toBe(true);
  });
});
