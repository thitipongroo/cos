import { jest } from '@jest/globals';
import {
  buildDidKeySuite,
  buildDidWebSuite,
  issueCredential,
  verifyCredential,
  createDocumentLoader,
  createDidResolver,
} from '../vc-service.js';
import { generateEphemeralSignerKey } from '../key-manager.js';
import { CREDENTIAL_TYPES } from '../credential-context.js';

describe('vc-service (CS-4/5/7)', () => {
  it('createDocumentLoader returns a callable loader', () => {
    expect(typeof createDocumentLoader()).toBe('function');
  });

  it('issues a base VC (no custom type/claims) and verifies it', async () => {
    const { suite, did, verificationMethodId } = await buildDidKeySuite(
      await generateEphemeralSignerKey(),
    );
    expect(did).toMatch(/^did:key:z6Mk/);
    expect(verificationMethodId.startsWith(did)).toBe(true);
    const signed = await issueCredential({
      suite,
      issuerDid: did,
      subjectId: 'did:example:c',
      issuanceDate: '2026-07-20T00:00:00Z',
    });
    expect(signed.proof.type).toBe('Ed25519Signature2020');
    expect((await verifyCredential(signed)).verified).toBe(true);
  });

  it('issues a typed ContractSignatureVC with a documentHash claim (kept) and verifies it', async () => {
    const { suite, did } = await buildDidKeySuite(await generateEphemeralSignerKey());
    const signed = await issueCredential({
      suite,
      issuerDid: did,
      subjectId: 'did:example:client',
      issuanceDate: '2026-07-20T00:00:00Z',
      types: [CREDENTIAL_TYPES.CONTRACT_SIGNATURE],
      claims: { documentHash: 'sha256:abc123', signerParty: 'CLIENT' },
    });
    expect(signed.type).toContain('ContractSignatureVC');
    expect(signed.credentialSubject.documentHash).toBe('sha256:abc123');
    expect(signed.credentialSubject.signerParty).toBe('CLIENT');
    expect((await verifyCredential(signed)).verified).toBe(true);
  });

  it('fails verification when the VC is tampered after signing', async () => {
    const { suite, did } = await buildDidKeySuite(await generateEphemeralSignerKey());
    const signed = await issueCredential({
      suite,
      issuerDid: did,
      subjectId: 'did:example:a',
      issuanceDate: '2026-07-20T00:00:00Z',
    });
    signed.credentialSubject.id = 'did:example:attacker';
    expect((await verifyCredential(signed)).verified).toBe(false);
  });

  it('signs a worker VC with a did:web issuer suite (proof bound to did#key-1)', async () => {
    const key = await (await import('../key-manager.js')).generateEphemeralSignerKey();
    const did = 'did:web:cos.dev:tenants:t1';
    const { suite, verificationMethodId } = await buildDidWebSuite({
      did,
      publicKeyMultibase: key.publicKeyMultibase,
      privateKeyMultibase: key.privateKeyMultibase,
    });
    expect(verificationMethodId).toBe(`${did}#key-1`);
    const signed = await issueCredential({
      suite,
      issuerDid: did,
      subjectId: 'did:example:worker',
      issuanceDate: '2026-07-20T00:00:00Z',
      types: ['LicenceVC'],
      claims: { licenceNumber: 'L-42' },
    });
    expect(signed.proof.type).toBe('Ed25519Signature2020');
    expect(signed.proof.verificationMethod).toBe(verificationMethodId);
    expect(signed.credentialSubject.licenceNumber).toBe('L-42');
  });

  describe('createDidResolver', () => {
    const keyDriver = { get: jest.fn(async () => ({ id: 'did:key:doc' })) };
    const webDriver = { get: jest.fn(async () => ({ id: 'did:web:doc' })) };
    const resolver = createDidResolver(keyDriver, webDriver);
    afterEach(() => jest.clearAllMocks());

    it('routes did:web to the web driver, forwarding the options', async () => {
      const opts = { did: 'did:web:cos.dev:tenants:t1#key-1' };
      await expect(resolver.get(opts)).resolves.toEqual({ id: 'did:web:doc' });
      expect(webDriver.get).toHaveBeenCalledWith(opts);
      expect(keyDriver.get).not.toHaveBeenCalled();
    });

    it('routes did:key to the key driver', async () => {
      await expect(resolver.get({ did: 'did:key:z6Mkabc' })).resolves.toEqual({
        id: 'did:key:doc',
      });
      expect(keyDriver.get).toHaveBeenCalled();
    });

    it('falls back to the url field when did is absent', async () => {
      await resolver.get({ url: 'did:key:z6Mkxyz' });
      expect(keyDriver.get).toHaveBeenCalledWith({ url: 'did:key:z6Mkxyz' });
    });

    it('rejects an unsupported DID method', async () => {
      await expect(resolver.get({ did: 'did:ion:zzz' })).rejects.toThrow('Unsupported DID method');
    });

    it('rejects when neither did nor url is provided (empty id)', async () => {
      await expect(resolver.get({})).rejects.toThrow('Unsupported DID method');
    });
  });
});
