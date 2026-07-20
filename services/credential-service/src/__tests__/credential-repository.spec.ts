import { jest } from '@jest/globals';
import type { PoolClient } from 'pg';
import {
  provisionIssuer,
  getIssuer,
  saveVerifiableCredential,
  revokeVerifiableCredential,
} from '../credential-repository.js';

function clientReturning(result: unknown) {
  const query = jest.fn(async () => result);
  return { client: { query } as unknown as PoolClient, query };
}

describe('credential-repository (CS-8)', () => {
  it('provisionIssuer inserts a WEB/ISSUER row (idempotent)', async () => {
    const { client, query } = clientReturning({ rows: [] });
    await provisionIssuer(client, {
      tenantId: 't1',
      did: 'did:web:x:tenants:t1',
      publicKeyMultibase: 'z6MkAbc',
      encryptedPrivateKey: 'iv:tag:ct',
      didDocument: { id: 'did:web:x:tenants:t1' },
    });
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO credentials\.did_documents/);
    expect(sql).toMatch(/ON CONFLICT \(tenant_id, did\) DO NOTHING/);
    expect(params[0]).toBe('t1');
    expect(params[3]).toBe('iv:tag:ct');
  });

  it('getIssuer returns null when no active issuer exists', async () => {
    const { client } = clientReturning({ rows: [] });
    expect(await getIssuer(client, 't1')).toBeNull();
  });

  it('getIssuer returns the issuer with the public key from the DID document', async () => {
    const { client } = clientReturning({
      rows: [
        {
          did: 'did:web:x:tenants:t1',
          encrypted_private_key: 'blob',
          did_document: { verificationMethod: [{ publicKeyMultibase: 'z6MkPub' }] },
        },
      ],
    });
    const issuer = await getIssuer(client, 't1');
    expect(issuer).toMatchObject({
      did: 'did:web:x:tenants:t1',
      encryptedPrivateKey: 'blob',
      publicKeyMultibase: 'z6MkPub',
    });
  });

  it('getIssuer tolerates a DID document with no verificationMethod', async () => {
    const { client } = clientReturning({
      rows: [{ did: 'did:web:x', encrypted_private_key: 'b', did_document: {} }],
    });
    expect((await getIssuer(client, 't1'))?.publicKeyMultibase).toBe('');
  });

  it('saveVerifiableCredential returns the new vc_id', async () => {
    const { client } = clientReturning({ rows: [{ vc_id: 'vc-123' }] });
    const id = await saveVerifiableCredential(client, {
      tenantId: 't1',
      credentialType: 'CONTRACT_SIGNATURE',
      issuerDid: 'did:web:x',
      credential: {},
      documentHash: 'sha256:h',
    });
    expect(id).toBe('vc-123');
  });

  it('saveVerifiableCredential handles a subject DID and omitted document hash', async () => {
    const { client, query } = clientReturning({ rows: [{ vc_id: 'vc-2' }] });
    const id = await saveVerifiableCredential(client, {
      tenantId: 't1',
      credentialType: 'LICENCE',
      issuerDid: 'did:web:x',
      subjectDid: 'did:web:x:tenants:t1',
      credential: {},
    });
    expect(id).toBe('vc-2');
    const params = (query.mock.calls[0] as unknown as [string, unknown[]])[1];
    expect(params[3]).toBe('did:web:x:tenants:t1');
    expect(params[5]).toBeNull();
  });

  it('revokeVerifiableCredential returns true when a row was revoked, false otherwise', async () => {
    const revoked = clientReturning({ rowCount: 1 });
    expect(await revokeVerifiableCredential(revoked.client, 't1', 'vc-1')).toBe(true);
    const none = clientReturning({ rowCount: 0 });
    expect(await revokeVerifiableCredential(none.client, 't1', 'vc-9')).toBe(false);
    const nullish = clientReturning({ rowCount: null });
    expect(await revokeVerifiableCredential(nullish.client, 't1', 'vc-9')).toBe(false);
  });
});
