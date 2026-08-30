// Integration tests: Site Operations Service — Phase 6
// Sync flow including conflict scenarios (GAP 2 resolved — spec §Phase 6 Generate).
// Phase 18 wires full container stack (PostgreSQL + Redis testcontainer).
// This test covers HTTP contract, validation, and conflict resolution HTTP outcomes.
// Conflict strategies are additionally unit-tested exhaustively in __tests__/conflict-handler.spec.ts.

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtAuthGuard } from '../../src/shared/guards/jwt-auth.guard';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  clsAuthGuard,
  type IntegrationInfra,
} from '../helpers/integration-infra';
import { AppModule } from '../../src/app.module';
import { buildCreateSiteReportDto } from '@cos/test-utils';
import { SiteOpsRepository } from '../../src/modules/site-ops/site-ops.repository';
import type {
  SiteReportRow,
  IssueRow,
  ConflictRecordRow,
} from '../../src/modules/site-ops/site-ops.repository';

const ENGINEER_TOKEN = 'Bearer test-engineer-token';
const ADMIN_TOKEN = 'Bearer test-admin-token';
const TENANT_ID = 'ee000004-0001-4000-8000-000000000001';
const ADMIN_ID = 'ee000004-0002-4000-8000-000000000001';
const ENGINEER_ID = 'ee000004-0003-4000-8000-000000000001';

const REPORT_ID_A = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
// Valid UUID v4 (version nibble 4, variant 8) — @IsUUID() rejects an arbitrary-version nibble.
const REPORT_ID_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ISSUE_ID_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeServerReport(overrides: Partial<SiteReportRow> = {}): SiteReportRow {
  return {
    report_id: REPORT_ID_A,
    project_id: PROJECT_ID,
    tenant_id: 'tenant-integration-001',
    report_date: new Date('2026-06-11'),
    submitted_by: 'engineer-001',
    status: 'SUBMITTED',
    summary: 'Server version',
    weather: null,
    manpower_count: null,
    client_submitted_at: new Date('2026-06-11T07:00:00Z'),
    server_received_at: new Date('2026-06-11T08:00:00Z'),
    modified_at: new Date('2026-06-11T09:00:00Z'),
    ...overrides,
  };
}

function makeServerIssue(overrides: Partial<IssueRow> = {}): IssueRow {
  return {
    issue_id: ISSUE_ID_A,
    issue_number: 'ISS-2026-0001',
    project_id: PROJECT_ID,
    tenant_id: 'tenant-integration-001',
    report_id: null,
    title: 'Crack in wall',
    description: 'Original description',
    severity: 'HIGH',
    status: 'IN_PROGRESS',
    assigned_to: null,
    created_by: null, // pre-20260804000004 row — who raised it was never recorded
    resolution_note: null,
    client_submitted_at: new Date('2026-06-11T06:00:00Z'),
    modified_at: new Date('2026-06-11T09:00:00Z'),
    created_at: new Date('2026-06-11T05:00:00Z'),
    ...overrides,
  };
}

function makeConflictRecord(): ConflictRecordRow {
  return {
    conflict_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    tenant_id: 'tenant-integration-001',
    entity_type: 'site_reports',
    entity_id: REPORT_ID_A,
    client_payload: {},
    server_payload: {},
    conflict_type: 'FIELD_CONFLICT',
    reviewed_by: null,
    reviewed_at: null,
    created_at: new Date(),
  };
}

describe('SiteOps Integration (Phase 6)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRaw`
      INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
      VALUES (${TENANT_ID}::uuid, 'acme_corp', 'SiteOps Integration Tenant', 'siteops-realm', 'STARTER'::platform."PlanType", true)
    `;
    // The two acting users and the project every site_report hangs off. Seeding only the tenant left
    // audit_logs.actor_id and site_reports.project_id pointing at rows that do not exist, so the
    // create endpoint answered 500 on a VALID payload — hidden for as long as the assertion here read
    // `expect([201, 500]).toContain(res.status)`.
    await infra.prisma.$executeRaw`
      INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
      VALUES (${ADMIN_ID}::uuid, ${TENANT_ID}::uuid, 'kc-siteops-admin', 'admin@siteops.test', 'Admin'),
             (${ENGINEER_ID}::uuid, ${TENANT_ID}::uuid, 'kc-siteops-eng', 'eng@siteops.test', 'Engineer')
    `;
    await infra.prisma.$executeRaw`
      INSERT INTO projects.projects (project_id, tenant_id, project_code, project_name, project_type, status, created_by)
      VALUES (${PROJECT_ID}::uuid, ${TENANT_ID}::uuid, 'SITEOPS-1', 'SiteOps Project',
              'RESIDENTIAL'::"ProjectType", 'ACTIVE'::"ProjectStatus", ${ADMIN_ID}::uuid)
    `;

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(
        clsAuthGuard((req) => {
          const auth = (req['headers'] as Record<string, string>)?.['authorization'];
          return auth === ADMIN_TOKEN
            ? {
                tenant_id: TENANT_ID,
                user_id: ADMIN_ID,
                role: 'TENANT_ADMIN',
                tenantCode: 'acme_corp',
              }
            : {
                tenant_id: TENANT_ID,
                user_id: ENGINEER_ID,
                role: 'SITE_ENGINEER',
                tenantCode: 'acme_corp',
              };
        }),
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

  // ── HTTP contract + validation ─────────────────────────────────────────────

  describe('POST /api/v1/site/reports', () => {
    it('returns 201 with valid payload', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/site/reports')
        .set('Authorization', ENGINEER_TOKEN)
        .send(buildCreateSiteReportDto(PROJECT_ID, { report_date: '2026-06-04' }));
      expect(res.status).toBe(201);
    });

    it('returns 400 when report_date is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/site/reports')
        .set('Authorization', ENGINEER_TOKEN)
        .send({ project_id: REPORT_ID_A });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/site/reports/sync — validation', () => {
    it('returns 400 when items array is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/site/reports/sync')
        .set('Authorization', ENGINEER_TOKEN)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/site/issues — validation', () => {
    it('returns 400 when title is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/site/issues')
        .set('Authorization', ENGINEER_TOKEN)
        .send({ project_id: REPORT_ID_A });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/site/inspections — validation', () => {
    it('returns 400 when checklist_id is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/site/inspections')
        .set('Authorization', ENGINEER_TOKEN)
        .send({
          project_id: REPORT_ID_A,
          status: 'PASSED',
          inspected_at: '2026-06-04T08:00:00Z',
        });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/site/conflict-records', () => {
    it('returns 200 list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/site/conflict-records')
        .set('Authorization', ENGINEER_TOKEN);
      expect(res.status).toBe(200);
    });
  });

  // ── Conflict scenarios — LAST_WRITE_WINS (site_reports) ───────────────────

  describe('POST /api/v1/site/reports/sync — LAST_WRITE_WINS conflict scenarios', () => {
    afterEach(() => jest.restoreAllMocks());

    it('returns conflict_status CONFLICT_FLAGGED when server was modified after client last synced', async () => {
      // Server row modified_at (09:00) is after client's last_known_modified_at (06:00).
      //
      // Mocks findReportsByIds, NOT findReportById: the sync path was batched — it now resolves the
      // whole page with one `report_id = ANY($1::uuid[])` query instead of one round trip (and one
      // transaction) per queued item. This spy still named the old singular method, so nothing
      // intercepted the lookup, the real query found no row, and every item took the
      // "new report → ACCEPTED" branch. That is why this test failed while the conflict logic it
      // covers was correct all along.
      jest
        .spyOn(SiteOpsRepository.prototype, 'findReportsByIds')
        .mockResolvedValue(
          new Map([
            [REPORT_ID_A, makeServerReport({ modified_at: new Date('2026-06-11T09:00:00Z') })],
          ]),
        );
      jest
        .spyOn(SiteOpsRepository.prototype, 'createConflictRecord')
        .mockResolvedValue(makeConflictRecord());

      const res = await request(app.getHttpServer())
        .post('/api/v1/site/reports/sync')
        .set('Authorization', ENGINEER_TOKEN)
        .send({
          items: [
            {
              client_id: REPORT_ID_A,
              project_id: PROJECT_ID,
              report_date: '2026-06-11',
              client_submitted_at: '2026-06-11T07:00:00Z',
              last_known_modified_at: '2026-06-11T06:00:00Z',
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body[0]).toMatchObject({
        client_id: REPORT_ID_A,
        conflict_status: 'CONFLICT_FLAGGED',
      });
    });

    it('returns conflict_status ACCEPTED when server modified_at matches client last known', async () => {
      const sharedTs = new Date('2026-06-11T06:00:00Z');
      // Same stale-mock correction as the test above. This one was PASSING for the wrong reason:
      // the un-intercepted lookup sent it down the "new report" branch, which also answers ACCEPTED,
      // so the assertion held while the equal-timestamp case it exists to cover was never executed.
      const serverRow = makeServerReport({ report_id: REPORT_ID_B, modified_at: sharedTs });
      jest
        .spyOn(SiteOpsRepository.prototype, 'findReportsByIds')
        .mockResolvedValue(new Map([[REPORT_ID_B, serverRow]]));
      // Equal timestamps mean the client wins, so this resolution carries should_persist: true and
      // the service writes. The row exists only in the mock above, so the real UPDATE matches
      // nothing, returns null, and the service correctly answers CONFLICT_REJECTED rather than
      // claiming a write landed when it did not. Mock the write so the assertion is about the
      // conflict decision, which is what this test is for.
      jest.spyOn(SiteOpsRepository.prototype, 'updateSiteReport').mockResolvedValue(serverRow);

      const res = await request(app.getHttpServer())
        .post('/api/v1/site/reports/sync')
        .set('Authorization', ENGINEER_TOKEN)
        .send({
          items: [
            {
              client_id: REPORT_ID_B,
              project_id: PROJECT_ID,
              report_date: '2026-06-11',
              client_submitted_at: '2026-06-11T08:00:00Z',
              last_known_modified_at: '2026-06-11T06:00:00Z', // matches server modified_at exactly
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body[0]).toMatchObject({
        client_id: REPORT_ID_B,
        conflict_status: 'ACCEPTED',
      });
    });
  });

  // ── Conflict scenarios — FIELD_LEVEL_MERGE (issues) ───────────────────────

  describe('PATCH /api/v1/site/issues/:issueId — FIELD_LEVEL_MERGE conflict scenario', () => {
    afterEach(() => jest.restoreAllMocks());

    it('creates ConflictRecord when server changed status while client was offline', async () => {
      // Server has status IN_PROGRESS; client tries to set back to OPEN
      jest
        .spyOn(SiteOpsRepository.prototype, 'findIssueById')
        .mockResolvedValue(makeServerIssue({ status: 'IN_PROGRESS' }));
      const createConflictSpy = jest
        .spyOn(SiteOpsRepository.prototype, 'createConflictRecord')
        .mockResolvedValue({
          ...makeConflictRecord(),
          entity_type: 'issues',
          entity_id: ISSUE_ID_A,
          conflict_type: 'STATUS_CONFLICT',
        });
      jest.spyOn(SiteOpsRepository.prototype, 'updateIssue').mockResolvedValue(makeServerIssue());

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/site/issues/${ISSUE_ID_A}`)
        .set('Authorization', ENGINEER_TOKEN)
        .send({
          status: 'OPEN', // client wants OPEN
          client_submitted_at: '2026-06-11T07:00:00Z', // client was offline before server changed at 09:00
          // The state the client edited against. Its absence is what used to make this test pass for
          // the wrong reason: without it EVERY update looked like a status conflict, including a
          // plain online status change, so an issue's status could never move at all. master:2591
          // requires both halves — the server changed status AND the client held an offline edit.
          last_known_modified_at: '2026-06-11T06:00:00Z',
        });

      // Server status (IN_PROGRESS) wins per FIELD_LEVEL_MERGE; ConflictRecord created
      expect(res.status).toBe(200);
      expect(createConflictSpy).toHaveBeenCalledWith(
        expect.objectContaining({ entity_type: 'issues', conflict_type: 'STATUS_CONFLICT' }),
        // 2nd arg is the site.conflict.flagged.v1 outbox envelope, written inside the conflict
        // record's own INSERT transaction (§35.13 ESC-13).
        expect.objectContaining({ event_type: 'site.conflict.flagged.v1' }),
      );
    });

    it('does not create ConflictRecord when client submits without triggering status conflict', async () => {
      jest
        .spyOn(SiteOpsRepository.prototype, 'findIssueById')
        .mockResolvedValue(makeServerIssue({ status: 'OPEN' }));
      const createConflictSpy = jest
        .spyOn(SiteOpsRepository.prototype, 'createConflictRecord')
        .mockResolvedValue(makeConflictRecord());
      jest
        .spyOn(SiteOpsRepository.prototype, 'updateIssue')
        .mockResolvedValue(makeServerIssue({ status: 'OPEN' }));

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/site/issues/${ISSUE_ID_A}`)
        .set('Authorization', ENGINEER_TOKEN)
        .send({
          status: 'OPEN', // same as server status — no conflict
          client_submitted_at: '2026-06-11T08:00:00Z',
        });

      expect(res.status).toBe(200);
      expect(createConflictSpy).not.toHaveBeenCalled();
    });
  });

  // ── SERVER_WINS (safety_checklists) ───────────────────────────────────────
  // Note: there is no HTTP endpoint for syncing safety_checklists — clients submit
  // inspections against checklists but never push checklist data. SERVER_WINS is
  // exercised at the unit level in __tests__/conflict-handler.spec.ts.
});
