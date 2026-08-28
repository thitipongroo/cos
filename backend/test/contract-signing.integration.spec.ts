// Integration tests: client contract signing — QM-1 "integration tests required for
// every public API endpoint". Drives the full bilateral flow over HTTP against a real Postgres
// (Testcontainers) with real RLS: create → attach document → contractor signs → issue client magic-link →
// external client signs (no JWT) → contract becomes SIGNED → activate → terminate.
//
// Only the two cross-service HTTP clients are overridden (File Service, CredentialService) — those are
// separate deployables, stubbed here the same way Kafka/OpenSearch are stubbed globally for integration
// specs. Everything else (controllers, guards, service logic, repository SQL, RLS) is real.

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtAuthGuard } from '../src/shared/guards/jwt-auth.guard';
import { FileServiceClient } from '../src/modules/files/file-service-client.service';
import { CredentialClientService } from '../src/modules/credentials/credential-client.service';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  clsAuthGuard,
  type IntegrationInfra,
} from './helpers/integration-infra';
import { AppModule } from '../src/app.module';

const TOKEN = 'Bearer test-contract-token';
const TENANT_ID = 'ee000002-0001-4000-8000-000000000001';
const USER_ID = 'ee000002-0002-4000-8000-000000000001';
const PROJECT_ID = 'ee000002-0003-4000-8000-000000000001';
const FILE_ID = 'ee000002-0004-4000-8000-000000000001';
const DOC_SHA256 = 'a'.repeat(64);

describe('Contract signing integration', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  let contractId: string;
  let signToken: string;
  let vcCounter = 0;

  const contractStatus = async (): Promise<string> => {
    const rows = await infra.prisma.$queryRaw<{ status: string }[]>`
      SELECT status FROM finance.contracts WHERE contract_id = ${contractId}::uuid
    `;
    return rows[0]!.status;
  };

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRaw`
      INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
      VALUES (${TENANT_ID}::uuid, 'contract-int', 'Contract Integration Tenant', 'con-realm', 'STARTER'::platform."PlanType", true)
    `;
    await infra.prisma.$executeRaw`
      INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
      VALUES (${USER_ID}::uuid, ${TENANT_ID}::uuid, 'kc-con', 'pm@contract-int.test', 'Contract PM')
    `;
    // finance.contracts.signed_document_id has a real FK → files.files, so seed the document row.
    await infra.prisma.$executeRaw`
      INSERT INTO files.files
        (file_id, tenant_id, original_filename, stored_key, bucket_name, mime_type, file_size_bytes, uploaded_by, sha256)
      VALUES (${FILE_ID}::uuid, ${TENANT_ID}::uuid, 'contract.pdf', '2026/07/contract.pdf', 'cos-files',
              'application/pdf', 2048, ${USER_ID}::uuid, ${DOC_SHA256})
    `;

    const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue(
        clsAuthGuard((req) => ({
          tenant_id: TENANT_ID,
          user_id: USER_ID,
          // TENANT_ADMIN by default (satisfies CONTRACT_SIGN / CONTRACT_WRITE / BILLING_READ); a test
          // can impersonate another role with the x-test-role header to exercise RolesGuard.
          role:
            ((req.headers as Record<string, string> | undefined)?.['x-test-role'] as string) ??
            'TENANT_ADMIN',
          tenantCode: 'contract-int',
        })),
      )
      .overrideProvider(FileServiceClient)
      .useValue({
        getFileMetadata: jest.fn().mockResolvedValue({ file_id: FILE_ID, sha256: DOC_SHA256 }),
        upload: jest.fn().mockResolvedValue({ file_id: FILE_ID }),
      })
      .overrideProvider(CredentialClientService)
      .useValue({
        issue: jest.fn().mockImplementation(() => {
          vcCounter += 1;
          return Promise.resolve({
            vcId: `vc-int-${vcCounter}`,
            credential: { id: `urn:vc:${vcCounter}` },
          });
        }),
        verify: jest.fn().mockResolvedValue({ verified: true }),
      })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  it('creates a contract that starts in DRAFT (CT-7 lifecycle default)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/finance/contracts')
      .set('Authorization', TOKEN)
      .send({
        project_id: PROJECT_ID,
        contract_type: 'MAIN_CONTRACT',
        contract_value: '1000000',
        terms: 'Net 30; retention 5%',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    contractId = res.body.contract_id as string;
  });

  it('POST /contracts/:id/document attaches the document (upload mode, CT-2)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/finance/contracts/${contractId}/document`)
      .set('Authorization', TOKEN)
      .send({ mode: 'upload', file_id: FILE_ID });

    expect(res.status).toBe(201);
    expect(res.body.signed_document_id).toBe(FILE_ID);
  });

  it('POST /contracts/:id/sign records a VERIFIED INTERNAL signature bound to the document hash (CT-3)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/finance/contracts/${contractId}/sign`)
      .set('Authorization', TOKEN)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.signer_party).toBe('INTERNAL');
    expect(res.body.verification_status).toBe('VERIFIED');
    expect(res.body.document_hash).toBe(DOC_SHA256);
    // Only one party has signed → still DRAFT.
    expect(await contractStatus()).toBe('DRAFT');
  });

  it('POST /contracts/:id/sign-links issues a client magic-link (CT-4)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/finance/contracts/${contractId}/sign-links`)
      .set('Authorization', TOKEN)
      .send({ client_name: 'ACME Co', client_email: 'signer@acme.test' });

    expect(res.status).toBe(201);
    expect(res.body.url).toContain('/contracts/sign/');
    expect(new Date(res.body.expires_at as string).getTime()).toBeGreaterThan(Date.now());
    signToken = (res.body.url as string).split('/contracts/sign/')[1]!;
  });

  it('POST /contracts/sign/:token — external client signs WITHOUT a JWT, contract becomes SIGNED (CT-5/CT-7)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/finance/contracts/sign/${signToken}`)
      .send({ client_name: 'ACME Co', client_email: 'signer@acme.test' }); // no Authorization header

    expect(res.status).toBe(201);
    expect(res.body.signer_party).toBe('CLIENT');
    expect(res.body.verification_status).toBe('VERIFIED');
    // Both parties VERIFIED → draft→signed transition.
    expect(await contractStatus()).toBe('SIGNED');
  });

  it('rejects reuse of the same magic-link (single-use, CT-5)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/finance/contracts/sign/${signToken}`)
      .send({ client_name: 'ACME Co' });

    expect(res.status).toBe(401);
  });

  it('rejects a tampered/unknown sign token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/finance/contracts/sign/not-a-valid-token')
      .send({});

    expect(res.status).toBe(401);
  });

  it('GET /contracts/:id/signatures returns both signatures (CT-6)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/finance/contracts/${contractId}/signatures`)
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect((res.body as { signer_party: string }[]).map((s) => s.signer_party).sort()).toEqual([
      'CLIENT',
      'INTERNAL',
    ]);
  });

  it('POST /contracts/:id/activate puts the signed contract into force (CT-8)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/finance/contracts/${contractId}/activate`)
      .set('Authorization', TOKEN);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ACTIVE');
  });

  it('POST /contracts/:id/terminate ends the contract (CT-8)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/finance/contracts/${contractId}/terminate`)
      .set('Authorization', TOKEN);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('TERMINATED');
  });

  // §5.9.8 (E): "the backend enforces who may initiate signing before calling the service" was the last
  // open [verify] on the credential-service threat model. RolesGuard is applied at the controller class
  // and CONTRACT_SIGN_ROLES is TENANT_ADMIN / EXECUTIVE / PROJECT_MANAGER — this proves the guard is
  // actually wired, not just decorated: a role outside that set cannot reach the signing logic at all.
  it('refuses contract signing to a role outside CONTRACT_SIGN_ROLES (§5.9.8 E)', async () => {
    for (const url of [
      `/api/v1/finance/contracts/${contractId}/sign`,
      `/api/v1/finance/contracts/${contractId}/document`,
      `/api/v1/finance/contracts/${contractId}/sign-links`,
    ]) {
      const res = await request(app.getHttpServer())
        .post(url)
        .set('Authorization', TOKEN)
        .set('x-test-role', 'SITE_ENGINEER')
        .send({});
      expect(res.status).toBe(403);
    }
  });

  it('rejects activating a contract that is not SIGNED (CT-8 guard)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/finance/contracts/${contractId}/activate`)
      .set('Authorization', TOKEN);

    expect(res.status).toBe(400); // now TERMINATED
  });
});
