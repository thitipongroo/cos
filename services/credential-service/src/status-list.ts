// Revocation via W3C Status List 2021 (ADR-019; CS-6). A per-tenant bitstring credential; a revocable
// worker VC references a bit index. Ephemeral contract-signature VCs are point-in-time (non-revocable)
// and do not occupy an index. The encodedList is stored in credentials.revocation_status_lists.
import { createList, decodeList, createCredential } from '@digitalbazaar/vc-status-list';

export const DEFAULT_STATUS_LIST_LENGTH = 131072; // 16 KB bitstring

/**
 * Where a tenant's status-list credential is published, mirroring the did:web layout
 * (`/tenants/{tenantId}/did.json`). This URL is embedded in every revocable VC's `credentialStatus`,
 * so it must be reconstructable from (baseDomain, tenantId, statusListId) alone — never stored.
 */
export function statusListUrl(baseDomain: string, tenantId: string, statusListId: string): string {
  if (!baseDomain) throw new Error('baseDomain is required to build a status list URL');
  return `https://${baseDomain}/tenants/${tenantId}/status-lists/${statusListId}`;
}

/** Parse a status-list URL back to its id — returns null if it is not one of ours. */
export function parseStatusListUrl(
  url: string,
  baseDomain: string,
  tenantId: string,
): string | null {
  const prefix = `https://${baseDomain}/tenants/${tenantId}/status-lists/`;
  if (!baseDomain || !url.startsWith(prefix)) return null;
  const id = url.slice(prefix.length);
  return id.length > 0 && !id.includes('/') ? id : null;
}

/** Create a fresh, all-valid encoded status list. */
export async function createEmptyEncodedList(
  length: number = DEFAULT_STATUS_LIST_LENGTH,
): Promise<string> {
  const list = await createList({ length });
  return list.encode();
}

/** Return a new encoded list with `index` set to the given revoked state. */
export async function setRevoked(
  encodedList: string,
  index: number,
  revoked: boolean,
): Promise<string> {
  const list = await decodeList({ encodedList });
  list.setStatus(index, revoked);
  return list.encode();
}

/** Whether `index` is revoked in the encoded list. */
export async function isRevoked(encodedList: string, index: number): Promise<boolean> {
  const list = await decodeList({ encodedList });
  return list.getStatus(index);
}

export interface StatusListCredentialParams {
  id: string; // the status list credential URL
  encodedList: string;
  issuerDid: string;
  issuanceDate: string;
}

export interface StatusListCredential {
  type: string[];
  issuer: string;
  issuanceDate: string;
  credentialSubject: Record<string, unknown>;
  [key: string]: unknown;
}

/** Build the (unsigned) StatusList2021Credential; the issuer signs it before publishing. */
export async function buildStatusListCredential(
  params: StatusListCredentialParams,
): Promise<StatusListCredential> {
  const list = await decodeList({ encodedList: params.encodedList });
  const credential = await createCredential({ id: params.id, list, statusPurpose: 'revocation' });
  credential.issuer = params.issuerDid;
  credential.issuanceDate = params.issuanceDate;
  return credential;
}
