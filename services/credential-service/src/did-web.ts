// did:web resolver + issuer DID Document builder (ADR-019; W3C did:web method).
// Per-tenant issuer:  did:web:{baseDomain}:tenants:{tenantId}
//   ↔  https://{baseDomain}/tenants/{tenantId}/did.json
// Verification is offline/cryptographic (BG-001): a third party resolves this document to the
// issuer's Ed25519 public key. The private key never leaves Vault (CS-3).

const DID_CONTEXT = 'https://www.w3.org/ns/did/v1';
const ED25519_CONTEXT = 'https://w3id.org/security/suites/ed25519-2020/v1';

/** The verification-method fragment used for the issuer key. */
export const ISSUER_KEY_FRAGMENT = 'key-1';

export interface VerificationMethod {
  id: string;
  type: 'Ed25519VerificationKey2020';
  controller: string;
  publicKeyMultibase: string;
}

export interface DidDocument {
  '@context': string[];
  id: string;
  verificationMethod: VerificationMethod[];
  assertionMethod: string[];
  authentication: string[];
}

/** Build the per-tenant issuer did:web identifier. */
export function tenantIssuerDid(baseDomain: string, tenantId: string): string {
  if (!baseDomain) throw new Error('baseDomain is required to build a did:web issuer DID');
  if (!tenantId) throw new Error('tenantId is required to build a did:web issuer DID');
  return `did:web:${baseDomain}:tenants:${tenantId}`;
}

/** Resolve a did:web identifier to its DID Document URL (W3C did:web resolution). */
export function didWebToUrl(did: string): string {
  const prefix = 'did:web:';
  if (!did.startsWith(prefix)) {
    throw new Error(`Not a did:web DID: ${did}`);
  }
  const segments = did.slice(prefix.length).split(':');
  if (segments[0] === '') {
    throw new Error(`Malformed did:web (missing domain): ${did}`);
  }
  const domain = decodeURIComponent(segments[0]); // may carry a %3A-encoded port
  const path = segments.slice(1).map(decodeURIComponent);
  const base = `https://${domain}`;
  return path.length === 0 ? `${base}/.well-known/did.json` : `${base}/${path.join('/')}/did.json`;
}

/** Build a W3C DID Document for a did:web issuer holding one Ed25519 key. */
export function buildIssuerDidDocument(did: string, publicKeyMultibase: string): DidDocument {
  if (!did.startsWith('did:web:')) {
    throw new Error(`Not a did:web DID: ${did}`);
  }
  if (!publicKeyMultibase.startsWith('z6Mk')) {
    throw new Error('publicKeyMultibase must be an Ed25519 multibase (z6Mk…)');
  }
  const vmId = `${did}#${ISSUER_KEY_FRAGMENT}`;
  return {
    '@context': [DID_CONTEXT, ED25519_CONTEXT],
    id: did,
    verificationMethod: [
      { id: vmId, type: 'Ed25519VerificationKey2020', controller: did, publicKeyMultibase },
    ],
    assertionMethod: [vmId],
    authentication: [vmId],
  };
}
