import {
  createEmptyEncodedList,
  setRevoked,
  isRevoked,
  buildStatusListCredential,
  DEFAULT_STATUS_LIST_LENGTH,
} from '../status-list.js';

describe('status-list (CS-6, Status List 2021)', () => {
  it('creates an empty list where nothing is revoked', async () => {
    const encoded = await createEmptyEncodedList();
    expect(typeof encoded).toBe('string');
    expect(await isRevoked(encoded, 0)).toBe(false);
    expect(await isRevoked(encoded, DEFAULT_STATUS_LIST_LENGTH - 1)).toBe(false);
  });

  it('revokes and un-revokes a specific index without affecting others', async () => {
    let encoded = await createEmptyEncodedList(1024);
    encoded = await setRevoked(encoded, 42, true);
    expect(await isRevoked(encoded, 42)).toBe(true);
    expect(await isRevoked(encoded, 7)).toBe(false);
    encoded = await setRevoked(encoded, 42, false);
    expect(await isRevoked(encoded, 42)).toBe(false);
  });

  it('builds a signed-ready StatusList2021Credential with issuer + purpose', async () => {
    const encoded = await createEmptyEncodedList(1024);
    const cred = await buildStatusListCredential({
      id: 'https://cos.example/status/1',
      encodedList: encoded,
      issuerDid: 'did:web:cos.example:tenants:t1',
      issuanceDate: '2026-07-20T00:00:00Z',
    });
    expect(cred.type).toContain('StatusList2021Credential');
    expect(cred.issuer).toBe('did:web:cos.example:tenants:t1');
    expect(cred.credentialSubject.encodedList).toBeTruthy();
    expect(cred.credentialSubject.statusPurpose).toBe('revocation');
  });
});
