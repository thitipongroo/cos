// CredentialService persistence (ADR-067; CS-8). Raw SQL against the `credentials` schema (CS-1) via a
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
}

/** Persist an issued VC; returns its vc_id. */
export async function saveVerifiableCredential(
  client: PoolClient,
  p: SaveVcParams,
): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO credentials.verifiable_credentials
       (tenant_id, credential_type, issuer_did, subject_did, credential, document_hash)
     VALUES ($1, $2::credentials."CredentialType", $3, $4, $5::jsonb, $6)
     RETURNING vc_id`,
    [
      p.tenantId,
      p.credentialType,
      p.issuerDid,
      p.subjectDid ?? null,
      JSON.stringify(p.credential),
      p.documentHash ?? null,
    ],
  );
  return rows[0].vc_id as string;
}

/** Mark a VC revoked (worker credentials). */
export async function revokeVerifiableCredential(
  client: PoolClient,
  tenantId: string,
  vcId: string,
): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE credentials.verifiable_credentials
        SET status = 'REVOKED'
      WHERE tenant_id = $1 AND vc_id = $2 AND status = 'ACTIVE'`,
    [tenantId, vcId],
  );
  return (rowCount ?? 0) > 0;
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
