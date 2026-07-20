// RLS tenant-isolation integration test (CS-9) — real Postgres 16 via Testcontainers, exercised as the
// non-superuser app_user so the credentials.* RLS policies actually apply. Proves that data written
// under tenant A's context is invisible (and un-revocable) under tenant B's context, and vice-versa.
//
// Data classification is RESTRICTED (identity + credential material); cross-tenant leakage here would be
// a security incident, so this is asserted against real RLS, not a mock.
import { withTenant } from '../../db.js';
import {
  provisionIssuer,
  getIssuer,
  saveVerifiableCredential,
  revokeVerifiableCredential,
  writeAuditLog,
} from '../../credential-repository.js';
import { generateIssuerKey } from '../../key-manager.js';
import { tenantIssuerDid, buildIssuerDidDocument } from '../../did-web.js';
import { startInfra, stopInfra, type Infra } from './infra.js';

const TENANT_A = 'aaaaaaaa-0001-4000-8000-000000000001';
const TENANT_B = 'bbbbbbbb-0002-4000-8000-000000000002';

async function seedTenant(infra: Infra, tenantId: string): Promise<string> {
  const key = await generateIssuerKey();
  const did = tenantIssuerDid('cos.dev', tenantId);
  const didDocument = buildIssuerDidDocument(did, key.publicKeyMultibase);
  await withTenant(infra.appPool, tenantId, (c) =>
    provisionIssuer(c, {
      tenantId,
      did,
      publicKeyMultibase: key.publicKeyMultibase,
      encryptedPrivateKey: key.encryptedPrivateKey,
      didDocument,
    }),
  );
  return withTenant(infra.appPool, tenantId, (c) =>
    saveVerifiableCredential(c, {
      tenantId,
      credentialType: 'LICENCE',
      issuerDid: did,
      subjectDid: `did:key:z6MkSubject-${tenantId}`,
      credential: { hello: tenantId },
    }),
  );
}

async function countVcs(infra: Infra, tenantId: string): Promise<number> {
  return withTenant(infra.appPool, tenantId, async (c) => {
    const { rows } = await c.query(
      'SELECT count(*)::int AS n FROM credentials.verifiable_credentials',
    );
    return rows[0].n as number;
  });
}

describe('credentials RLS isolation (integration — Testcontainers)', () => {
  let infra: Infra;
  let vcIdA: string;

  beforeAll(async () => {
    infra = await startInfra();
    vcIdA = await seedTenant(infra, TENANT_A);
  });
  afterAll(async () => {
    await stopInfra(infra);
  });

  it('scopes issuer + VC rows to the writing tenant', async () => {
    // Tenant A sees exactly what it wrote.
    const issuerA = await withTenant(infra.appPool, TENANT_A, (c) => getIssuer(c, TENANT_A));
    expect(issuerA?.did).toBe(tenantIssuerDid('cos.dev', TENANT_A));
    expect(await countVcs(infra, TENANT_A)).toBe(1);

    // Tenant B (never provisioned) sees nothing — RLS hides A's rows.
    const issuerB = await withTenant(infra.appPool, TENANT_B, (c) => getIssuer(c, TENANT_B));
    expect(issuerB).toBeNull();
    expect(await countVcs(infra, TENANT_B)).toBe(0);
  });

  it('prevents a foreign tenant from revoking another tenant’s VC', async () => {
    // B cannot revoke A's VC (the row is invisible under B's context → 0 rows updated).
    const revokedByB = await withTenant(infra.appPool, TENANT_B, (c) =>
      revokeVerifiableCredential(c, TENANT_B, vcIdA),
    );
    expect(revokedByB).toBe(false);

    // A can revoke its own VC.
    const revokedByA = await withTenant(infra.appPool, TENANT_A, (c) =>
      revokeVerifiableCredential(c, TENANT_A, vcIdA),
    );
    expect(revokedByA).toBe(true);
  });

  it('isolates the audit log per tenant and enforces immutability (no UPDATE/DELETE)', async () => {
    await withTenant(infra.appPool, TENANT_A, (c) =>
      writeAuditLog(c, {
        tenantId: TENANT_A,
        actorId: '11111111-0000-4000-8000-000000000001',
        action: 'CREDENTIAL_ISSUED',
        resourceType: 'verifiable_credential',
        resourceId: vcIdA,
        metadata: { credentialType: 'LICENCE' },
      }),
    );

    const countAudit = (tenantId: string): Promise<number> =>
      withTenant(infra.appPool, tenantId, async (c) => {
        const { rows } = await c.query('SELECT count(*)::int AS n FROM credentials.audit_log');
        return rows[0].n as number;
      });
    expect(await countAudit(TENANT_A)).toBeGreaterThanOrEqual(1);
    expect(await countAudit(TENANT_B)).toBe(0); // RLS hides A's audit rows from B

    // Immutable: app_user is granted SELECT + INSERT only → UPDATE and DELETE are denied.
    await expect(
      withTenant(infra.appPool, TENANT_A, (c) =>
        c.query(`UPDATE credentials.audit_log SET action = 'TAMPERED'`),
      ),
    ).rejects.toThrow();
    await expect(
      withTenant(infra.appPool, TENANT_A, (c) => c.query('DELETE FROM credentials.audit_log')),
    ).rejects.toThrow();
  });
});
