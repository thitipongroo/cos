// CredentialService persistence (ADR-019; CS-8). Raw SQL against the `credentials` schema (CS-1) via a
// pg client already inside a tenant-scoped transaction (db.withTenant → RLS by app.current_tenant_id).
import type { PoolClient } from 'pg';

export interface IssuerRecord {
  did: string;
  publicKeyMultibase: string;
  encryptedPrivateKey: string;
  didDocument: unknown;
}

export interface ProvisionIssuerParams {
  tenantId: string;
  did: string;
  publicKeyMultibase: string;
  encryptedPrivateKey: string;
  didDocument: unknown;
}

/** Insert the tenant's persistent did:web issuer (idempotent). */
export async function provisionIssuer(client: PoolClient, p: ProvisionIssuerParams): Promise<void> {
  await client.query(
    `INSERT INTO credentials.did_documents
       (tenant_id, did, method, did_role, did_document, encrypted_private_key)
     VALUES ($1, $2, 'WEB', 'ISSUER', $3::jsonb, $4)
     ON CONFLICT (tenant_id, did) DO NOTHING`,
    [p.tenantId, p.did, JSON.stringify(p.didDocument), p.encryptedPrivateKey],
  );
}

/** Fetch the tenant's active issuer (for signing + did:web resolution). */
export async function getIssuer(
  client: PoolClient,
  tenantId: string,
): Promise<IssuerRecord | null> {
  const { rows } = await client.query(
    `SELECT did, did_document, encrypted_private_key
       FROM credentials.did_documents
      WHERE tenant_id = $1 AND did_role = 'ISSUER' AND status = 'ACTIVE'
      ORDER BY created_at DESC LIMIT 1`,
    [tenantId],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  const doc = row.did_document as { verificationMethod?: Array<{ publicKeyMultibase?: string }> };
  return {
    did: row.did,
    encryptedPrivateKey: row.encrypted_private_key,
    didDocument: row.did_document,
    publicKeyMultibase: doc.verificationMethod?.[0]?.publicKeyMultibase ?? '',
  };
}

export interface SaveVcParams {
  tenantId: string;
  credentialType: 'CONTRACT_SIGNATURE' | 'LICENCE' | 'EQUIPMENT_CERT' | 'TRAINING_RECORD';
  issuerDid: string;
  subjectDid?: string;
  credential: unknown;
  documentHash?: string;
  statusListId?: string; // revocable worker VCs only (CS-6)
  statusListIndex?: number;
}

/** Persist an issued VC; returns its vc_id. */
export async function saveVerifiableCredential(
  client: PoolClient,
  p: SaveVcParams,
): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO credentials.verifiable_credentials
       (tenant_id, credential_type, issuer_did, subject_did, credential, document_hash,
        status_list_id, status_list_index)
     VALUES ($1, $2::credentials."CredentialType", $3, $4, $5::jsonb, $6, $7, $8)
     RETURNING vc_id`,
    [
      p.tenantId,
      p.credentialType,
      p.issuerDid,
      p.subjectDid ?? null,
      JSON.stringify(p.credential),
      p.documentHash ?? null,
      p.statusListId ?? null,
      p.statusListIndex ?? null,
    ],
  );
  return rows[0].vc_id as string;
}

/** A revoked VC's status-list position, so the caller can flip the published bit (CS-6). */
export interface RevokedVcEntry {
  statusListId: string | null;
  statusListIndex: number | null;
}

/**
 * Mark a VC revoked (worker credentials); returns its status-list position, or null when there was no
 * ACTIVE VC to revoke. A CONTRACT_SIGNATURE VC has no position (point-in-time, non-revocable per
 * ADR-019) so both fields come back null.
 */
export async function revokeVerifiableCredential(
  client: PoolClient,
  tenantId: string,
  vcId: string,
): Promise<RevokedVcEntry | null> {
  const { rows } = await client.query(
    `UPDATE credentials.verifiable_credentials
        SET status = 'REVOKED'
      WHERE tenant_id = $1 AND vc_id = $2 AND status = 'ACTIVE'
      RETURNING status_list_id, status_list_index`,
    [tenantId, vcId],
  );
  if (rows.length === 0) return null;
  return { statusListId: rows[0].status_list_id, statusListIndex: rows[0].status_list_index };
}

// ─── Status lists (W3C Status List 2021; CS-6) ────────────────────────────────

export interface StatusListRecord {
  statusListId: string;
  encodedList: string;
  capacity: number;
  nextIndex: number;
  version: number;
  statusListCredential: unknown;
}

function toStatusListRecord(row: {
  status_list_id: string;
  encoded_list: string;
  capacity: number;
  next_index: number;
  version: number;
  status_list_credential: unknown;
}): StatusListRecord {
  return {
    statusListId: row.status_list_id,
    encodedList: row.encoded_list,
    capacity: row.capacity,
    nextIndex: row.next_index,
    version: row.version,
    statusListCredential: row.status_list_credential,
  };
}

const STATUS_LIST_COLUMNS =
  'status_list_id, encoded_list, capacity, next_index, version, status_list_credential';

/** The tenant's current revocation list that still has free bits, if any. */
export async function getOpenStatusList(
  client: PoolClient,
  tenantId: string,
): Promise<StatusListRecord | null> {
  const { rows } = await client.query(
    `SELECT ${STATUS_LIST_COLUMNS}
       FROM credentials.revocation_status_lists
      WHERE tenant_id = $1 AND purpose = 'REVOCATION' AND next_index < capacity
      ORDER BY created_at ASC LIMIT 1`,
    [tenantId],
  );
  return rows.length === 0 ? null : toStatusListRecord(rows[0]);
}

/** Fetch one list by id (public publication endpoint + DB-backed status check). */
export async function getStatusListById(
  client: PoolClient,
  tenantId: string,
  statusListId: string,
): Promise<StatusListRecord | null> {
  const { rows } = await client.query(
    `SELECT ${STATUS_LIST_COLUMNS}
       FROM credentials.revocation_status_lists
      WHERE tenant_id = $1 AND status_list_id = $2`,
    [tenantId, statusListId],
  );
  return rows.length === 0 ? null : toStatusListRecord(rows[0]);
}

export interface InsertStatusListParams {
  tenantId: string;
  statusListId: string; // generated by the caller — the signed credential's URL embeds it
  encodedList: string;
  capacity: number;
  statusListCredential: unknown;
}

/** Insert a freshly provisioned, signed status list. */
export async function insertStatusList(
  client: PoolClient,
  p: InsertStatusListParams,
): Promise<void> {
  await client.query(
    `INSERT INTO credentials.revocation_status_lists
       (status_list_id, tenant_id, purpose, status_list_credential, encoded_list, capacity, next_index)
     VALUES ($1, $2, 'REVOCATION', $3::jsonb, $4, $5, 0)`,
    [p.statusListId, p.tenantId, JSON.stringify(p.statusListCredential), p.encodedList, p.capacity],
  );
}

/**
 * Claim the next free bit index atomically. The conditional UPDATE ... RETURNING is the allocation
 * lock: two concurrent issuances can never receive the same index. Returns null if the list filled up
 * between the read and the claim.
 */
export async function allocateStatusIndex(
  client: PoolClient,
  tenantId: string,
  statusListId: string,
): Promise<number | null> {
  const { rows } = await client.query(
    `UPDATE credentials.revocation_status_lists
        SET next_index = next_index + 1, updated_at = now()
      WHERE tenant_id = $1 AND status_list_id = $2 AND next_index < capacity
      RETURNING next_index - 1 AS allocated_index`,
    [tenantId, statusListId],
  );
  return rows.length === 0 ? null : (rows[0].allocated_index as number);
}

/** Replace the bitstring + re-signed credential after a revocation; bumps `version`. */
export async function updateStatusList(
  client: PoolClient,
  p: { tenantId: string; statusListId: string; encodedList: string; statusListCredential: unknown },
): Promise<void> {
  await client.query(
    `UPDATE credentials.revocation_status_lists
        SET encoded_list = $3, status_list_credential = $4::jsonb,
            version = version + 1, updated_at = now()
      WHERE tenant_id = $1 AND status_list_id = $2`,
    [p.tenantId, p.statusListId, p.encodedList, JSON.stringify(p.statusListCredential)],
  );
}

export interface AuditLogParams {
  tenantId: string;
  actorId: string; // x-user-id of the caller
  action: 'CREDENTIAL_ISSUED' | 'CREDENTIAL_REVOKED';
  resourceType: string; // 'verifiable_credential'
  resourceId: string; // vc_id
  metadata?: Record<string, unknown>;
}

/**
 * Append an immutable audit entry (QM-4; §5.9.8 Repudiation). Call inside the same tenant transaction as
 * the state change so a change can never be committed un-audited. The table grants app_user SELECT+INSERT
 * only (no UPDATE/DELETE) — the row cannot be altered after the fact.
 */
export async function writeAuditLog(client: PoolClient, p: AuditLogParams): Promise<void> {
  await client.query(
    `INSERT INTO credentials.audit_log (tenant_id, actor_id, action, resource_type, resource_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      p.tenantId,
      p.actorId,
      p.action,
      p.resourceType,
      p.resourceId,
      p.metadata ? JSON.stringify(p.metadata) : null,
    ],
  );
}
