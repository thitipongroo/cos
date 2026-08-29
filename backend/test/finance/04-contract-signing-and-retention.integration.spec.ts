/**
 * Phase 7 — client contract signing (master:2978-2982; ADR-058) and retention (master:2926-2935).
 *
 * THE RULE THIS FILE EXISTS FOR: "signed when both INTERNAL+CLIENT signatures verify". Both halves
 * are tested — one signature must NOT be enough — because a transition guarded by a condition that
 * is always true looks identical to one that works, right up until a contract counts as executed on
 * the contractor's signature alone.
 *
 * FileServiceClient and CredentialClientService are stubbed: neither runs in this harness, and what
 * is under test is the platform's own rule about how many verified parties make a contract signed,
 * not whether a VC library validates a signature.
 */
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ MessageId: 'mock-msg-id' }),
  })),
  PublishCommand: jest.fn(),
}));

import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  clsAuthGuard,
  type IntegrationInfra,
} from '../helpers/integration-infra';
import { AppModule } from '../../src/app.module';
import { JwtAuthGuard } from '../../src/shared/guards/jwt-auth.guard';
import { FileServiceClient } from '../../src/modules/files/file-service-client.service';
import { CredentialClientService } from '../../src/modules/credentials/credential-client.service';

const TENANT_ID = 'bbbb1111-1111-4000-8000-000000000073';
const USER_ID = 'bbbb2222-2222-4000-8000-000000000073';
const FILE_ID = 'cccc0001-0000-4000-8000-000000000073';
const DOC_SHA256 = 'a'.repeat(64);

const roleOf = (req: Record<string, unknown>): string => {
  const headers = (req['headers'] ?? {}) as Record<string, string>;
  return headers['x-test-role'] ?? 'PROJECT_MANAGER';
};

// The endpoint walk lives next door in 05-sign-link-and-contract-endpoints: magic-link issuance and
// reuse, a tampered token, the external signature that carries no JWT, the role guard, activate and
// terminate. This file asserts the spec rules those endpoints have to satisfy. The two overlap on
// "both parties then SIGNED" on purpose — one reaches it through the HTTP flow, the other states it
// as the rule.

describe('Phase 7 · contract signing and retention (real database)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  let customerId = '';
  let vc = 0;
  let seq = 0;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'sd-p73', 'Spec Derived P7 Sign', 'construction-os', 'STARTER'::platform."PlanType", true)`,
      TENANT_ID,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-p73', '+66890000073', 'p73@example.com', 'P73')`,
      USER_ID,
      TENANT_ID,
    );

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue(clsAuthGuard((req) => (req['user'] ?? {}) as Record<string, string>))
      .overrideProvider(FileServiceClient)
      .useValue({
        getFileMetadata: jest.fn().mockResolvedValue({ file_id: FILE_ID, sha256: DOC_SHA256 }),
        upload: jest.fn().mockResolvedValue({ file_id: FILE_ID }),
      })
      .overrideProvider(CredentialClientService)
      .useValue({
        issue: jest.fn().mockImplementation(() => {
          vc += 1;
          return Promise.resolve({ vcId: `vc-p73-${vc}`, credential: { id: `urn:vc:${vc}` } });
        }),
        verify: jest.fn().mockResolvedValue({ verified: true }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.use((req: Record<string, unknown>, _res: unknown, next: () => void) => {
      req['user'] = {
        tenant_id: TENANT_ID,
        user_id: USER_ID,
        role: roleOf(req),
        tenantCode: 'sd-p73',
      };
      next();
    });
    await app.init();

    // contracts.signed_document_id is a real foreign key into files.files, so the document the
    // signatures are bound to has to exist as a row. Stubbing FileServiceClient covers the HTTP call
    // that returns the hash; it does not put anything in the database.
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO files.files
         (file_id, tenant_id, original_filename, stored_key, bucket_name, mime_type,
          file_size_bytes, uploaded_by, sha256)
       VALUES ($1::uuid, $2::uuid, 'contract.pdf', 'contracts/contract.pdf', 'cos-files',
               'application/pdf', 1024, $3::uuid, $4)`,
      FILE_ID,
      TENANT_ID,
      USER_ID,
      DOC_SHA256,
    );

    const cust = await request(app.getHttpServer())
      .post('/api/v1/finance/customers')
      .set('x-test-role', 'FINANCE')
      .send({ company_name: 'Signing Client' });
    expect([200, 201]).toContain(cust.status);
    customerId = (cust.body as { customer_id: string }).customer_id;
  });

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  const http = () => request(app.getHttpServer());

  const newProject = async (): Promise<string> => {
    seq += 1;
    const res = await http()
      .post('/api/v1/projects')
      .set('x-test-role', 'TENANT_ADMIN')
      .send({
        project_code: `SD-P73-${seq}`,
        project_name: `Sign Host ${seq}`,
        project_type: 'RESIDENTIAL',
        start_date: '2019-01-01',
        end_date: '2020-01-01',
      });
    expect([200, 201]).toContain(res.status);
    return (res.body as { project_id: string }).project_id;
  };

  /** A contract with a document attached — the precondition for signing. */
  const newContractWithDocument = async (): Promise<string> => {
    const projectId = await newProject();
    const res = await http()
      .post('/api/v1/finance/contracts')
      .set('x-test-role', 'PROJECT_MANAGER')
      .send({
        project_id: projectId,
        contract_type: 'MAIN_CONTRACT',
        contract_value: '5000000.0000',
        customer_id: customerId,
      });
    expect([200, 201]).toContain(res.status);
    const contractId = (res.body as { contract_id: string }).contract_id;

    const doc = await http()
      .post(`/api/v1/finance/contracts/${contractId}/document`)
      .set('x-test-role', 'PROJECT_MANAGER')
      // AttachContractDocumentDto spells the modes in lower case: 'upload' | 'generate'.
      .send({ mode: 'upload', file_id: FILE_ID });
    expect([200, 201]).toContain(doc.status);
    return contractId;
  };

  const contractStatus = async (contractId: string): Promise<string> => {
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ status: string }>>(
      `SELECT status::text FROM finance.contracts WHERE contract_id = $1::uuid`,
      contractId,
    );
    return rows[0]?.status ?? '(missing)';
  };

  const signaturesOf = (contractId: string) =>
    infra.prisma.$queryRawUnsafe<
      Array<{ signer_party: string; verification_status: string; document_hash: string }>
    >(
      `SELECT signer_party::text, verification_status::text, document_hash
         FROM finance.contract_signatures WHERE contract_id = $1::uuid`,
      contractId,
    );

  const signedEvents = (contractId: string) =>
    infra.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM platform.outbox_events
        WHERE event_type = 'finance.contract.signed.v1'
          AND payload->'payload'->>'contract_id' = $1`,
      contractId,
    );

  /** Contractor-side signature. */
  const signInternal = (contractId: string) =>
    http()
      .post(`/api/v1/finance/contracts/${contractId}/sign`)
      .set('x-test-role', 'PROJECT_MANAGER')
      .send({});

  /** Client-side signature, through the magic link the platform issues. */
  const signAsClient = async (contractId: string): Promise<number> => {
    const link = await http()
      .post(`/api/v1/finance/contracts/${contractId}/sign-links`)
      .set('x-test-role', 'PROJECT_MANAGER')
      .send({ client_name: 'Client Rep', client_email: 'rep@client.example' });
    expect([200, 201]).toContain(link.status);
    // issueSignLink returns { url, expires_at }; the raw token is the last path segment. Only its
    // sha256 is ever persisted (contract_sign_tokens.token_hash), so this response is the one place
    // the token itself exists — which is also why the link cannot be re-read later.
    const token = (link.body as { url: string }).url.split('/').pop();
    expect(token).toBeTruthy();

    const res = await request(app.getHttpServer())
      .post(`/api/v1/finance/contracts/sign/${token}`)
      .send({ client_name: 'Client Rep', client_email: 'rep@client.example' });
    return res.status;
  };

  // ---------------------------------------------------------------------------------------------
  describe('a contract is SIGNED only when BOTH parties have verified (master:2981)', () => {
    it('the contractor signature alone does not sign the contract', async () => {
      const contractId = await newContractWithDocument();
      const res = await signInternal(contractId);
      expect([200, 201]).toContain(res.status);

      const sigs = await signaturesOf(contractId);
      expect(sigs).toHaveLength(1);
      expect(sigs[0].signer_party).toBe('INTERNAL');
      // One party is not a bilateral agreement.
      expect(await contractStatus(contractId)).not.toBe('SIGNED');
      expect(await signedEvents(contractId)).toHaveLength(0);
    });

    it('the client signature alone does not sign it either', async () => {
      const contractId = await newContractWithDocument();
      expect([200, 201]).toContain(await signAsClient(contractId));

      const sigs = await signaturesOf(contractId);
      expect(sigs.map((s) => s.signer_party)).toEqual(['CLIENT']);
      expect(await contractStatus(contractId)).not.toBe('SIGNED');
      expect(await signedEvents(contractId)).toHaveLength(0);
    });

    it('both together transition it to SIGNED and emit ContractSigned (master:2981)', async () => {
      const contractId = await newContractWithDocument();
      await signInternal(contractId);
      expect([200, 201]).toContain(await signAsClient(contractId));

      const sigs = await signaturesOf(contractId);
      expect(sigs.map((s) => s.signer_party).sort()).toEqual(['CLIENT', 'INTERNAL']);
      expect(await contractStatus(contractId)).toBe('SIGNED');
      expect(await signedEvents(contractId)).toHaveLength(1);
    });

    it('signing is refused before a document is attached', async () => {
      // There is nothing to sign, and no hash to bind the signature to.
      const projectId = await newProject();
      const res = await http()
        .post('/api/v1/finance/contracts')
        .set('x-test-role', 'PROJECT_MANAGER')
        .send({
          project_id: projectId,
          contract_type: 'MAIN_CONTRACT',
          contract_value: '1000.0000',
          customer_id: customerId,
        });
      const contractId = (res.body as { contract_id: string }).contract_id;

      expect((await signInternal(contractId)).status).toBe(400);
    });
  });

  describe('the signature record (master:2982)', () => {
    it('binds each signature to the document hash', async () => {
      // "signature rows + document hash to WORM audit". Without the hash a signature attests to
      // nothing in particular: the document could be swapped afterwards.
      const contractId = await newContractWithDocument();
      await signInternal(contractId);

      const sigs = await signaturesOf(contractId);
      expect(sigs[0].document_hash).toBe(DOC_SHA256);
      expect(sigs[0].verification_status).toBe('VERIFIED');
    });

    it('exposes an audit trail through the API', async () => {
      const contractId = await newContractWithDocument();
      await signInternal(contractId);

      const res = await http()
        .get(`/api/v1/finance/contracts/${contractId}/signatures`)
        .set('x-test-role', 'FINANCE');
      expect(res.status).toBe(200);
      expect((res.body as unknown[]).length).toBeGreaterThan(0);
    });
  });

  describe('contract lifecycle beyond signing (§14:305-306; ADR-058)', () => {
    it('only a SIGNED contract can be activated', async () => {
      const contractId = await newContractWithDocument();
      const tooEarly = await http()
        .post(`/api/v1/finance/contracts/${contractId}/activate`)
        .set('x-test-role', 'PROJECT_MANAGER')
        .send({});
      expect(tooEarly.status).toBeGreaterThanOrEqual(400);

      await signInternal(contractId);
      await signAsClient(contractId);
      const res = await http()
        .post(`/api/v1/finance/contracts/${contractId}/activate`)
        .set('x-test-role', 'PROJECT_MANAGER')
        .send({});
      expect(res.status).toBeLessThan(400);
      expect(await contractStatus(contractId)).toBe('ACTIVE');
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('retention is entered, never derived (master:2931-2935)', () => {
    it('retention_amount = contract_amount x percentage / 100, computed exactly', async () => {
      // master:2932 gives the formula outright. 3.33% of 1,234,567.89 is 41,111.11... — a case where
      // float multiplication and decimal multiplication part company in the fourth decimal.
      const projectId = await newProject();
      const retentionId = randomUUID();
      await infra.prisma.$executeRawUnsafe(
        `INSERT INTO finance.retention_records
           (retention_id, po_id, project_id, tenant_id, retention_percentage, retention_amount,
            currency_code, status)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 3.33,
                 ROUND(1234567.89 * 3.33 / 100, 4), 'THB', 'HELD'::finance."RetentionStatus")`,
        retentionId,
        randomUUID(),
        projectId,
        TENANT_ID,
      );

      const rows = await infra.prisma.$queryRawUnsafe<Array<{ retention_amount: string }>>(
        `SELECT retention_amount::text FROM finance.retention_records WHERE retention_id = $1::uuid`,
        retentionId,
      );
      // Postgres numeric arithmetic is exact; this pins the arithmetic the column must hold.
      expect(rows[0].retention_amount).toBe('41111.1107');
    });

    it('a record may be filed with no percentage at all (master:2931 — "nullable; no system default")', async () => {
      // The column must not carry a default: withholding 5% of a subcontractor's money under a
      // contract that never agreed to it is not a sensible fallback.
      const projectId = await newProject();
      const retentionId = randomUUID();
      await infra.prisma.$executeRawUnsafe(
        `INSERT INTO finance.retention_records
           (retention_id, po_id, project_id, tenant_id, status)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'HELD'::finance."RetentionStatus")`,
        retentionId,
        randomUUID(),
        projectId,
        TENANT_ID,
      );

      const rows = await infra.prisma.$queryRawUnsafe<
        Array<{ retention_percentage: string | null; retention_amount: string | null }>
      >(
        `SELECT retention_percentage::text, retention_amount::text
           FROM finance.retention_records WHERE retention_id = $1::uuid`,
        retentionId,
      );
      expect(rows[0].retention_percentage).toBeNull();
      expect(rows[0].retention_amount).toBeNull();
    });
  });
});
