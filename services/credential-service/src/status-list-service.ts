// Status List 2021 lifecycle (ADR-067 §Revocation; CS-6). One signed bitstring credential per tenant:
// every revocable worker VC claims a bit index at issuance and carries a `credentialStatus` pointing at
// the published list; revoking flips that bit and re-signs the list. Contract-signature VCs are
// point-in-time and never occupy an index (ADR-067).
//
// The list is signed by the same persistent did:web issuer as the tenant's worker VCs, so an offline
// verifier that already trusts the issuer DID document needs no additional trust anchor.
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { withTenant } from './db.js';
import {
  getOpenStatusList,
  getStatusListById,
  insertStatusList,
  allocateStatusIndex,
  updateStatusList,
  type StatusListRecord,
} from './credential-repository.js';
import {
  createEmptyEncodedList,
  buildStatusListCredential,
  setRevoked,
  isRevoked,
  statusListUrl,
  parseStatusListUrl,
  DEFAULT_STATUS_LIST_LENGTH,
} from './status-list.js';
import { signCredential, type StatusCheckResult } from './vc-service.js';

/** The tenant issuer key material needed to sign the list credential. */
export interface StatusListSigner {
  did: string;
  suite: unknown;
  allowedIssuerDomains?: string[];
}

/** A claimed bit position, and the URL the verifier will fetch. */
export interface StatusListEntry {
  statusListId: string;
  statusListIndex: number;
  statusListCredentialUrl: string;
}

async function signListCredential(
  url: string,
  encodedList: string,
  signer: StatusListSigner,
): Promise<unknown> {
  const credential = await buildStatusListCredential({
    id: url,
    encodedList,
    issuerDid: signer.did,
    issuanceDate: new Date().toISOString(),
  });
  return signCredential({
    credential,
    suite: signer.suite,
    allowedIssuerDomains: signer.allowedIssuerDomains,
  });
}

/** Return the tenant's open status list, provisioning (and signing) one on first use. */
async function getOrProvisionStatusList(
  client: PoolClient,
  tenantId: string,
  baseDomain: string,
  signer: StatusListSigner,
): Promise<StatusListRecord> {
  const existing = await getOpenStatusList(client, tenantId);
  if (existing) return existing;

  // Full (or first ever) → provision the next list. The id is generated here, not by the database,
  // because the signed credential's own `id` is the URL that embeds it.
  const statusListId = randomUUID();
  const encodedList = await createEmptyEncodedList();
  const statusListCredential = await signListCredential(
    statusListUrl(baseDomain, tenantId, statusListId),
    encodedList,
    signer,
  );
  await insertStatusList(client, {
    tenantId,
    statusListId,
    encodedList,
    capacity: DEFAULT_STATUS_LIST_LENGTH,
    statusListCredential,
  });
  return {
    statusListId,
    encodedList,
    capacity: DEFAULT_STATUS_LIST_LENGTH,
    nextIndex: 0,
    version: 1,
    statusListCredential,
  };
}

/**
 * Claim the next revocation bit for a worker VC. Runs in the caller's tenant transaction so the
 * allocation commits atomically with the VC row — a claimed index can never be orphaned.
 */
export async function allocateStatusEntry(
  client: PoolClient,
  tenantId: string,
  baseDomain: string,
  signer: StatusListSigner,
): Promise<StatusListEntry> {
  const list = await getOrProvisionStatusList(client, tenantId, baseDomain, signer);
  const statusListIndex = await allocateStatusIndex(client, tenantId, list.statusListId);
  if (statusListIndex === null) {
    throw new Error(`status list ${list.statusListId} exhausted`);
  }
  return {
    statusListId: list.statusListId,
    statusListIndex,
    statusListCredentialUrl: statusListUrl(baseDomain, tenantId, list.statusListId),
  };
}

/** Flip a revoked bit and re-sign + republish the list. */
export async function revokeStatusEntry(
  client: PoolClient,
  params: {
    tenantId: string;
    baseDomain: string;
    statusListId: string;
    statusListIndex: number;
    signer: StatusListSigner;
  },
): Promise<void> {
  const list = await getStatusListById(client, params.tenantId, params.statusListId);
  if (!list) throw new Error(`status list ${params.statusListId} not found`);
  const encodedList = await setRevoked(list.encodedList, params.statusListIndex, true);
  const url = statusListUrl(params.baseDomain, params.tenantId, params.statusListId);
  const statusListCredential = await signListCredential(url, encodedList, params.signer);
  await updateStatusList(client, {
    tenantId: params.tenantId,
    statusListId: params.statusListId,
    encodedList,
    statusListCredential,
  });
}

/** The `credentialStatus` shape a revocable VC carries (W3C StatusList2021Entry). */
interface CredentialStatusField {
  statusListCredential?: unknown;
  statusListIndex?: unknown;
}

/**
 * Build the `checkStatus` function @digitalbazaar/vc requires for any VC carrying `credentialStatus`.
 * Reads the bit straight from this tenant's stored list rather than fetching the published URL — the
 * data is already local, and it keeps `verify` free of any outbound request (SSRF, §5.9.8).
 *
 * Fail-closed: a status entry we cannot resolve to one of our own lists is reported unverified rather
 * than assumed valid.
 */
export function createDbStatusChecker(
  pool: Pool,
  tenantId: string,
  baseDomain: string,
): (options: { credential: unknown }) => Promise<StatusCheckResult> {
  return async ({ credential }) => {
    const status = (credential as { credentialStatus?: CredentialStatusField }).credentialStatus;
    const url = typeof status?.statusListCredential === 'string' ? status.statusListCredential : '';
    const index = Number(status?.statusListIndex);
    const statusListId = parseStatusListUrl(url, baseDomain, tenantId);
    if (statusListId === null || !Number.isInteger(index) || index < 0) {
      return { verified: false, revoked: false, error: 'UNRESOLVABLE_STATUS_LIST' };
    }
    const list = await withTenant(pool, tenantId, (client) =>
      getStatusListById(client, tenantId, statusListId),
    );
    if (!list) return { verified: false, revoked: false, error: 'STATUS_LIST_NOT_FOUND' };
    const revoked = await isRevoked(list.encodedList, index);
    return { verified: !revoked, revoked };
  };
}
