// did:web issuance + verification (CS-9). @digitalbazaar/did-method-web mandates an HTTPS transport
// (it rejects http:), so we stub ONLY the transport — @digitalbazaar/http-client — to serve the issuer
// DID document the platform exposes at GET /tenants/:id/did.json. Everything else is real: the did:web
// driver resolves the DID, dereferences #key-1, and Ed25519Signature2020 verifies the proof
// cryptographically. This closes the loop the unit suite can't (its did:key VCs are self-contained).
import { jest } from '@jest/globals';
import type { SignedCredential } from '../../vc-service.js';

// The DID document the stubbed HTTPS GET returns. Set before any issue/verify runs.
let didDocumentToServe: unknown = null;

jest.unstable_mockModule('@digitalbazaar/http-client', () => ({
  httpClient: { get: async () => ({ data: didDocumentToServe }) },
}));

// Import AFTER registering the mock so did-method-web picks up the stubbed transport.
const { buildDidWebSuite, issueCredential, verifyCredential } = await import('../../vc-service.js');
const { generateIssuerKey, decryptIssuerPrivateKey } = await import('../../key-manager.js');
const { tenantIssuerDid, buildIssuerDidDocument } = await import('../../did-web.js');

const TENANT = 'cccccccc-0003-4000-8000-000000000003';
const BASE_DOMAIN = 'cos.dev';

describe('did:web verification (integration — HTTPS transport stubbed)', () => {
  let did: string;
  let workerVc: SignedCredential;

  beforeAll(async () => {
    delete process.env.APP_SECRET_ENCRYPTION_KEY; // deterministic dev key for encrypt/decrypt
    const key = await generateIssuerKey();
    did = tenantIssuerDid(BASE_DOMAIN, TENANT); // did:web:cos.dev:tenants:<tenant>
    didDocumentToServe = buildIssuerDidDocument(did, key.publicKeyMultibase);

    const { suite } = await buildDidWebSuite({
      did,
      publicKeyMultibase: key.publicKeyMultibase,
      privateKeyMultibase: decryptIssuerPrivateKey(key.encryptedPrivateKey),
    });
    workerVc = await issueCredential({
      suite,
      issuerDid: did,
      subjectId: 'did:key:z6MkWorkerSubject',
      issuanceDate: '2026-07-20T00:00:00Z',
      types: ['LicenceVC'],
      claims: { licenceNumber: 'L-2026-42' },
    });
  });

  it('binds the proof to the issuer did:web key', () => {
    expect(workerVc.proof.type).toBe('Ed25519Signature2020');
    expect(workerVc.proof.verificationMethod).toBe(`${did}#key-1`);
    expect(workerVc.credentialSubject.licenceNumber).toBe('L-2026-42');
  });

  it('verifies by resolving the issuer DID document over the (stubbed) HTTPS transport', async () => {
    const result = await verifyCredential(workerVc, [BASE_DOMAIN]);
    expect(result.verified).toBe(true);
  });

  it('rejects a tampered claim', async () => {
    const tampered = {
      ...workerVc,
      credentialSubject: { ...workerVc.credentialSubject, licenceNumber: 'FORGED' },
    };
    const result = await verifyCredential(tampered, [BASE_DOMAIN]);
    expect(result.verified).toBe(false);
  });

  it('SSRF guard: refuses to resolve an issuer outside the allowList', async () => {
    // Same VC, but the resolver is told only `other.example` is allowed → the did:web fetch to cos.dev
    // is blocked before any request leaves the process, so verification fails.
    const result = await verifyCredential(workerVc, ['other.example']);
    expect(result.verified).toBe(false);
  });
});
