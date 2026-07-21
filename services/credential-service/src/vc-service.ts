// VC issuance + verification (ADR-067; CS-4/CS-5). Ed25519Signature2020 (JSON-LD Data Integrity).
// The ephemeral contract signer uses a self-contained did:key (embeds its public key → offline
// verifiable). Worker/issuer VCs (did:web) verify by resolving the issuer DID document (integration).
// Service is ESM, so the ESM @digitalbazaar stack is imported statically.
import * as vc from '@digitalbazaar/vc';
import { Ed25519Signature2020 } from '@digitalbazaar/ed25519-signature-2020';
import { Ed25519VerificationKey2020 } from '@digitalbazaar/ed25519-verification-key-2020';
import * as didKey from '@digitalbazaar/did-method-key';
import * as didWeb from '@digitalbazaar/did-method-web';
import { securityLoader } from '@digitalbazaar/security-document-loader';
import statusListContext from '@digitalbazaar/vc-status-list-context';
import { COS_CREDENTIALS_CONTEXT_URL, COS_CREDENTIALS_CONTEXT } from './credential-context.js';
import { ISSUER_KEY_FRAGMENT } from './did-web.js';

// The @digitalbazaar DID drivers ship no types; we only rely on `.get({did|url})` returning a document.
interface DidDriver {
  get(options: { did?: string; url?: string }): Promise<unknown>;
}

function didKeyDriver() {
  const driver = didKey.driver();
  driver.use({ multibaseMultikeyHeader: 'z6Mk', fromMultibase: Ed25519VerificationKey2020.from });
  return driver;
}

// SSRF/DoS guard (§5.9.8): `verify` resolves the issuer from an untrusted VC, which for did:web means
// an outbound HTTPS fetch. Bound it — only platform issuer domains may be resolved, with a fetch
// timeout — so an attacker-supplied `issuer: did:web:evil.example` cannot make us fetch arbitrary hosts.
const DID_WEB_FETCH_TIMEOUT_MS = 5000;

// did:web resolver — fetches the issuer DID document over HTTPS (the library mandates https:; see
// @digitalbazaar/did-method-web assertions). `allowList` restricts which domains may be resolved: a
// non-empty list blocks every other host; an empty list (the did:key-only callers) allows all — but the
// verify/issue routes always pass the configured issuer domain, so the resolver is bounded in practice.
function didWebDriver(allowList: string[]) {
  return didWeb.driver({ allowList, fetchOptions: { timeout: DID_WEB_FETCH_TIMEOUT_MS } });
}

/**
 * Route a `did:` URL to the right driver: did:key resolves offline (key embedded in the DID); did:web
 * resolves by fetching the issuer DID document over HTTPS. Drivers are injected so the dispatch is unit-
 * testable without the network — the real HTTPS path is exercised by the integration suite (CS-9).
 */
export function createDidResolver(
  keyDriver: DidDriver,
  webDriver: DidDriver,
): { get: (options: { did?: string; url?: string }) => Promise<unknown> } {
  return {
    get(options: { did?: string; url?: string }) {
      const id = options?.did ?? options?.url ?? '';
      if (id.startsWith('did:web:')) return webDriver.get(options);
      if (id.startsWith('did:key:')) return keyDriver.get(options);
      return Promise.reject(new Error(`Unsupported DID method: ${id}`));
    },
  };
}

/**
 * Document loader that resolves security contexts + did:key (offline) + did:web (HTTPS).
 * `allowedIssuerDomains` bounds did:web resolution (SSRF guard, §5.9.8) — the routes pass the configured
 * platform issuer domain; the did:key-only paths default to none.
 */
export function createDocumentLoader(allowedIssuerDomains: string[] = []) {
  const loader = securityLoader();
  const handler = createDidResolver(didKeyDriver(), didWebDriver(allowedIssuerDomains));
  loader.setProtocolHandler({ protocol: 'did', handler });
  loader.addStatic(COS_CREDENTIALS_CONTEXT_URL, COS_CREDENTIALS_CONTEXT);
  // StatusList2021 terms (credentialStatus / StatusList2021Credential) are NOT in securityLoader —
  // without this, signing a revocable VC or the status-list credential itself fails JSON-LD safe mode.
  // Served from the official context package, statically → still no outbound fetch (CS-6).
  loader.addStatic(statusListContext.CONTEXT_URL_V1, statusListContext.CONTEXT_V1);
  return loader.build();
}

export interface SigningKeyInput {
  publicKeyMultibase: string;
  privateKeyMultibase: string;
}

export interface DidKeySuite {
  suite: unknown;
  did: string;
  verificationMethodId: string;
}

/** Build an Ed25519Signature2020 suite + the did:key identity from an Ed25519 key pair. */
export async function buildDidKeySuite(input: SigningKeyInput): Promise<DidKeySuite> {
  const driver = didKeyDriver();
  const vk = await Ed25519VerificationKey2020.from({
    type: 'Ed25519VerificationKey2020',
    publicKeyMultibase: input.publicKeyMultibase,
    privateKeyMultibase: input.privateKeyMultibase,
  });
  const { didDocument, methodFor } = await driver.fromKeyPair({ verificationKeyPair: vk });
  const verificationMethodId = methodFor({ purpose: 'assertionMethod' }).id;
  vk.id = verificationMethodId;
  vk.controller = didDocument.id;
  return {
    suite: new Ed25519Signature2020({ key: vk }),
    did: didDocument.id,
    verificationMethodId,
  };
}

export interface IssuerKeyInput {
  did: string; // did:web:...
  publicKeyMultibase: string;
  privateKeyMultibase: string; // decrypted issuer key
}

/** Build an Ed25519Signature2020 suite for a persistent did:web issuer (worker/equipment/training VCs). */
export async function buildDidWebSuite(
  input: IssuerKeyInput,
): Promise<{ suite: unknown; verificationMethodId: string }> {
  const verificationMethodId = `${input.did}#${ISSUER_KEY_FRAGMENT}`;
  const key = await Ed25519VerificationKey2020.from({
    type: 'Ed25519VerificationKey2020',
    id: verificationMethodId,
    controller: input.did,
    publicKeyMultibase: input.publicKeyMultibase,
    privateKeyMultibase: input.privateKeyMultibase,
  });
  return { suite: new Ed25519Signature2020({ key }), verificationMethodId };
}

export interface IssueParams {
  suite: unknown;
  issuerDid: string;
  subjectId: string;
  issuanceDate: string;
  types?: string[]; // extra VC types (must be defined in the COS context)
  claims?: Record<string, unknown>; // extra subject claims (must be defined in the COS context)
  allowedIssuerDomains?: string[]; // bounds did:web resolution (SSRF guard, §5.9.8)
  credentialStatus?: StatusList2021Entry; // revocable worker VCs only (CS-6)
}

/** W3C StatusList2021Entry — the `credentialStatus` of a revocable VC. */
export interface StatusList2021Entry {
  id: string;
  type: 'StatusList2021Entry';
  statusPurpose: 'revocation';
  statusListIndex: string; // W3C: a string, even though it is an integer position
  statusListCredential: string; // URL the status-list credential is published at
}

/** A signed VC (the fields callers/tests read; @digitalbazaar returns an untyped object). */
export interface SignedCredential {
  '@context': unknown;
  type: string[];
  issuer: string;
  issuanceDate: string;
  credentialSubject: Record<string, unknown>;
  proof: { type: string; verificationMethod: string; [key: string]: unknown };
  [key: string]: unknown;
}

/** Issue a signed VC. Custom types/claims resolve via the COS credentials @context (CS-7). */
export async function issueCredential(params: IssueParams): Promise<SignedCredential> {
  const credential = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      COS_CREDENTIALS_CONTEXT_URL,
      // Only revocable VCs carry the StatusList2021 terms — an unused context term would otherwise
      // appear in every ephemeral contract-signature VC.
      ...(params.credentialStatus ? [statusListContext.CONTEXT_URL_V1 as string] : []),
    ],
    type: ['VerifiableCredential', ...(params.types ?? [])],
    issuer: params.issuerDid,
    issuanceDate: params.issuanceDate,
    credentialSubject: { id: params.subjectId, ...(params.claims ?? {}) },
    ...(params.credentialStatus ? { credentialStatus: params.credentialStatus } : {}),
  };
  return signCredential({
    credential,
    suite: params.suite,
    allowedIssuerDomains: params.allowedIssuerDomains,
  });
}

/**
 * Sign an already-assembled credential document. Used for the StatusList2021Credential (CS-6), whose
 * body is produced by @digitalbazaar/vc-status-list rather than assembled here.
 */
export async function signCredential(params: {
  credential: unknown;
  suite: unknown;
  allowedIssuerDomains?: string[];
}): Promise<SignedCredential> {
  const documentLoader = createDocumentLoader(params.allowedIssuerDomains ?? []);
  return (await vc.issue({
    credential: params.credential,
    suite: params.suite,
    documentLoader,
  })) as SignedCredential;
}

export interface VerifyResult {
  verified: boolean;
  revoked: boolean;
  error?: unknown;
}

/** What a status checker reports back; extra fields flow through to `result.statusResult`. */
export interface StatusCheckResult {
  verified: boolean;
  revoked: boolean;
  error?: unknown;
}

/** @digitalbazaar/vc `checkStatus` hook — see status-list-service.createDbStatusChecker. */
export type StatusChecker = (options: { credential: unknown }) => Promise<StatusCheckResult>;

/**
 * Verify a signed VC: Data Integrity proof **and** revocation status (ADR-067 §Verification).
 * `allowedIssuerDomains` bounds did:web resolution to platform issuers (SSRF guard, §5.9.8).
 *
 * `checkStatus` is not optional in practice — @digitalbazaar/vc refuses to verify any credential
 * carrying `credentialStatus` without one, so a revocable worker VC fails verification unless the
 * caller supplies the checker.
 */
export async function verifyCredential(
  signedVc: unknown,
  allowedIssuerDomains: string[] = [],
  checkStatus?: StatusChecker,
): Promise<VerifyResult> {
  const result = await vc.verifyCredential({
    credential: signedVc,
    suite: new Ed25519Signature2020(),
    documentLoader: createDocumentLoader(allowedIssuerDomains),
    ...(checkStatus ? { checkStatus } : {}),
  });
  return {
    verified: result.verified,
    revoked: result.statusResult?.revoked === true,
    error: result.error,
  };
}
