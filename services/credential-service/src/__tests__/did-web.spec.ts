import {
  tenantIssuerDid,
  didWebToUrl,
  buildIssuerDidDocument,
  ISSUER_KEY_FRAGMENT,
} from '../did-web.js';

describe('did-web', () => {
  describe('tenantIssuerDid', () => {
    it('builds the per-tenant did:web', () => {
      expect(tenantIssuerDid('cos.example.com', 't-123')).toBe(
        'did:web:cos.example.com:tenants:t-123',
      );
    });
    it('rejects a missing baseDomain', () => {
      expect(() => tenantIssuerDid('', 't-1')).toThrow(/baseDomain is required/);
    });
    it('rejects a missing tenantId', () => {
      expect(() => tenantIssuerDid('cos.example.com', '')).toThrow(/tenantId is required/);
    });
  });

  describe('didWebToUrl', () => {
    it('resolves a bare-domain DID to /.well-known/did.json', () => {
      expect(didWebToUrl('did:web:example.com')).toBe('https://example.com/.well-known/did.json');
    });
    it('resolves a path DID to the path /did.json', () => {
      expect(didWebToUrl('did:web:cos.example.com:tenants:t-9')).toBe(
        'https://cos.example.com/tenants/t-9/did.json',
      );
    });
    it('decodes a percent-encoded port in the domain', () => {
      expect(didWebToUrl('did:web:localhost%3A3009')).toBe(
        'https://localhost:3009/.well-known/did.json',
      );
    });
    it('rejects a non did:web DID', () => {
      expect(() => didWebToUrl('did:key:z6Mkabc')).toThrow(/Not a did:web DID/);
    });
    it('rejects a malformed did:web with no domain', () => {
      expect(() => didWebToUrl('did:web:')).toThrow(/Malformed did:web/);
    });
  });

  describe('buildIssuerDidDocument', () => {
    const did = 'did:web:cos.example.com:tenants:t-1';
    const pk = 'z6MkfrirED2Lm44qm7yQGtNWSFVzZPjBHtqvqm6vqM8YzAbc';
    it('builds a valid DID Document with assertion + authentication relationships', () => {
      const doc = buildIssuerDidDocument(did, pk);
      const vmId = `${did}#${ISSUER_KEY_FRAGMENT}`;
      expect(doc.id).toBe(did);
      expect(doc['@context']).toContain('https://www.w3.org/ns/did/v1');
      expect(doc.verificationMethod[0]).toMatchObject({
        id: vmId,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase: pk,
      });
      expect(doc.assertionMethod).toEqual([vmId]);
      expect(doc.authentication).toEqual([vmId]);
    });
    it('rejects a non did:web DID', () => {
      expect(() => buildIssuerDidDocument('did:key:z6Mk', pk)).toThrow(/Not a did:web DID/);
    });
    it('rejects a non-Ed25519 public key', () => {
      expect(() => buildIssuerDidDocument(did, 'zNotEd25519')).toThrow(/Ed25519 multibase/);
    });
  });
});
