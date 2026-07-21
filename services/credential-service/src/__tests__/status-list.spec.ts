import {
  createEmptyEncodedList,
  setRevoked,
  isRevoked,
  buildStatusListCredential,
  statusListUrl,
  parseStatusListUrl,
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

  it('builds the publication URL alongside the did:web layout, and requires a base domain', () => {
    expect(statusListUrl('cred.cos.dev', 't1', 'sl-1')).toBe(
      'https://cred.cos.dev/tenants/t1/status-lists/sl-1',
    );
    expect(() => statusListUrl('', 't1', 'sl-1')).toThrow(/baseDomain is required/);
  });

  it('parses back only our own status-list URLs (foreign/malformed → null)', () => {
    const url = statusListUrl('cred.cos.dev', 't1', 'sl-1');
    expect(parseStatusListUrl(url, 'cred.cos.dev', 't1')).toBe('sl-1');
    // another tenant's list, another host, an unconfigured domain, or extra path segments
    expect(parseStatusListUrl(url, 'cred.cos.dev', 't2')).toBeNull();
    expect(parseStatusListUrl(url, 'evil.example', 't1')).toBeNull();
    expect(parseStatusListUrl(url, '', 't1')).toBeNull();
    expect(parseStatusListUrl(`${url}/extra`, 'cred.cos.dev', 't1')).toBeNull();
    expect(
      parseStatusListUrl('https://cred.cos.dev/tenants/t1/status-lists/', 'cred.cos.dev', 't1'),
    ).toBeNull();
  });
});
