// Integration tests: Photo annotation (ADR-056; 17-offline-mobile-sync §17.5).
// Exercises the real DB (Testcontainer): GET endpoint, the sync-push write path, and the
// version-based CONFLICT_FLAGGED outcome end to end. Conflict logic is unit-tested exhaustively in
// site-ops/__tests__/conflict-handler.spec.ts and files/__tests__/annotation.service.spec.ts.

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtAuthGuard } from '../src/modules/identity/guards/jwt-auth.guard';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  clsAuthGuard,
  type IntegrationInfra,
} from './helpers/integration-infra';
import { AppModule } from '../src/app.module';

const TOKEN = 'Bearer test-engineer-token';
const TENANT_ID = 'ee000009-0001-4000-8000-000000000001';
const USER_ID = 'ee000009-0003-4000-8000-000000000001';
const FILE_ID = 'ee000009-00f0-4000-8000-000000000001';
const NO_ANNOTATION_FILE = 'ee000009-00f0-4000-8000-000000000002';

const strokes = [{ tool: 'pen', color: '#FF3B30', points: [0.1, 0.2, 0.3, 0.4] }];

describe('Photo Annotation Integration (ADR-056)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRaw`
      INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
      VALUES (${TENANT_ID}::uuid, 'annot_corp', 'Annotation Integration Tenant', 'annot-realm', 'STARTER'::platform."PlanType", true)
    `;
    // The acting user — the audit interceptor writes audit_logs.actor_id FK'd to platform.users.
    await infra.prisma.$executeRaw`
      INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name, is_active)
      VALUES (${USER_ID}::uuid, ${TENANT_ID}::uuid, 'kc-annot-1', 'engineer@annot.test', 'Annot Engineer', true)
    `;
    // Two photos to annotate; the annotation FK references these.
    for (const fid of [FILE_ID, NO_ANNOTATION_FILE]) {
      await infra.prisma.$executeRaw`
        INSERT INTO files.files
          (file_id, tenant_id, original_filename, stored_key, bucket_name, mime_type, file_size_bytes, file_status, uploaded_by)
        VALUES
          (${fid}::uuid, ${TENANT_ID}::uuid, 'site.jpg', ${'k/' + fid}, 'cos-files', 'image/jpeg', 1024,
           'CLEAN'::files."FileStatus", ${USER_ID}::uuid)
      `;
    }

    const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue(
        clsAuthGuard(() => ({
          tenant_id: TENANT_ID,
          user_id: USER_ID,
          role: 'SITE_ENGINEER',
          tenantCode: 'annot_corp',
        })),
      )
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

  it('GET returns 404 when the photo has no annotation yet', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/files/${NO_ANNOTATION_FILE}/annotation`)
      .set('Authorization', TOKEN);
    expect(res.status).toBe(404);
  });

  it('first sync push creates the annotation at version 1 (ACCEPTED)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/push')
      .set('Authorization', TOKEN)
      .send({
        entity_type: 'photo_annotation',
        entity_id: FILE_ID,
        operation: 'UPDATE',
        payload: { strokes, version: 0 },
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACCEPTED');
    expect(res.body.server_payload.version).toBe(1);
  });

  it('GET now returns the stored strokes + version', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/files/${FILE_ID}/annotation`)
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(res.body.strokes).toEqual(strokes);
    expect(res.body.modified_by).toBe(USER_ID);
  });

  it('editing from the current version fast-forwards to version 2', async () => {
    const next = [...strokes, { tool: 'arrow', points: [0.5, 0.5, 0.9, 0.9] }];
    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/push')
      .set('Authorization', TOKEN)
      .send({
        entity_type: 'photo_annotation',
        entity_id: FILE_ID,
        operation: 'UPDATE',
        payload: { strokes: next, version: 1 },
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACCEPTED');
    expect(res.body.server_payload.version).toBe(2);
  });

  it('editing from a stale version is CONFLICT_FLAGGED and does not overwrite', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/push')
      .set('Authorization', TOKEN)
      .send({
        entity_type: 'photo_annotation',
        entity_id: FILE_ID,
        operation: 'UPDATE',
        payload: { strokes: [{ tool: 'text' }], version: 1 }, // stale — server is at 2
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CONFLICT_FLAGGED');
    // Server kept version 2; the stale write was not applied.
    expect(res.body.server_payload.version).toBe(2);

    const get = await request(app.getHttpServer())
      .get(`/api/v1/files/${FILE_ID}/annotation`)
      .set('Authorization', TOKEN);
    expect(get.body.version).toBe(2);
    // The flagged strokes ({tool:text}) did not land.
    expect(get.body.strokes).not.toEqual([{ tool: 'text' }]);
  });
});
