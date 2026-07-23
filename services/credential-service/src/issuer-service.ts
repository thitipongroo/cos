// Issuer provisioning (ADR-019; CS-8b). Get the tenant's persistent did:web issuer, provisioning one on
// first use (generate Ed25519 key → encrypt private key → build DID document → store). Runs inside the
// tenant RLS transaction.
import type { Pool } from 'pg';
import { withTenant } from './db.js';
import { getIssuer, provisionIssuer, type IssuerRecord } from './credential-repository.js';
import { generateIssuerKey } from './key-manager.js';
import { tenantIssuerDid, buildIssuerDidDocument } from './did-web.js';

export async function getOrProvisionIssuer(
  pool: Pool,
  tenantId: string,
  baseDomain: string,
): Promise<IssuerRecord> {
  return withTenant(pool, tenantId, async (client) => {
    const existing = await getIssuer(client, tenantId);
    if (existing) return existing;
    const { publicKeyMultibase, encryptedPrivateKey } = await generateIssuerKey();
    const did = tenantIssuerDid(baseDomain, tenantId);
    const didDocument = buildIssuerDidDocument(did, publicKeyMultibase);
    await provisionIssuer(client, {
      tenantId,
      did,
      publicKeyMultibase,
      encryptedPrivateKey,
      didDocument,
    });
    return { did, publicKeyMultibase, encryptedPrivateKey, didDocument };
  });
}
