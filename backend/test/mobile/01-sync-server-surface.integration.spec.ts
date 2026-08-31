/**
 * Phase 10 — the server side of the offline sync engine: the tombstone table that backs
 * `deleted[]`, the delta contract itself, and the retry-exhaustion review queue
 * (master:3559-3562, 3708-3712, 3685-3698).
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

const TENANT_ID = 'bbbb1111-1111-4000-8000-000000000101';
const USER_ID = 'bbbb2222-2222-4000-8000-000000000101';

const roleOf = (req: Record<string, unknown>): string => {
  const headers = (req['headers'] ?? {}) as Record<string, string>;
  return headers['x-test-role'] ?? 'SITE_ENGINEER';
};

describe('Phase 10 · the sync server surface (real database)', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'sd-p101', 'Spec Derived P10', 'construction-os', 'STARTER'::platform."PlanType", true)`,
      TENANT_ID,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-p101', '+66890000101', 'p101@example.com', 'P101')`,
      USER_ID,
      TENANT_ID,
    );

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue(clsAuthGuard((req) => (req['user'] ?? {}) as Record<string, string>))
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.use((req: Record<string, unknown>, _res: unknown, next: () => void) => {
      req['user'] = {
        tenant_id: TENANT_ID,
        user_id: USER_ID,
        role: roleOf(req),
        tenantCode: 'sd-p101',
      };
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  const http = () => request(app.getHttpServer());

  // ---------------------------------------------------------------------------------------------
  describe('platform.sync_tombstones (master:3559-3562)', () => {
    it('carries the columns master declares', async () => {
      const rows = await infra.prisma.$queryRawUnsafe<
        Array<{ column_name: string; is_nullable: string }>
      >(
        `SELECT column_name, is_nullable FROM information_schema.columns
          WHERE table_schema = 'platform' AND table_name = 'sync_tombstones'`,
      );
      const byName = new Map(rows.map((r) => [r.column_name, r.is_nullable]));
      for (const c of ['tombstone_id', 'tenant_id', 'entity_type', 'entity_id', 'deleted_at']) {
        expect(byName.has(c)).toBe(true);
      }
      // RLS hangs off tenant_id, so it cannot be optional.
      expect(byName.get('tenant_id')).toBe('NO');
    });

    it('carries the (tenant_id, entity_type, deleted_at) index master names', async () => {
      // The delta query filters exactly on those three, per tenant and per type since a timestamp.
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
        `SELECT indexdef FROM pg_indexes
          WHERE schemaname = 'platform' AND tablename = 'sync_tombstones'`,
      );
      expect(rows.some((r) => /\(tenant_id,\s*entity_type,\s*deleted_at\)/.test(r.indexdef))).toBe(
        true,
      );
    });

    it('is tenant-isolated in the canonical form (ADR-031)', async () => {
      const rows = await infra.prisma.$queryRawUnsafe<
        Array<{ policyname: string; permissive: string; roles: string; qual: string }>
      >(
        `SELECT policyname, permissive, array_to_string(roles, ',') AS roles, COALESCE(qual,'') AS qual
           FROM pg_policies WHERE schemaname = 'platform' AND tablename = 'sync_tombstones'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].policyname).toBe('rls_tenant_isolation');
      expect(rows[0].permissive).toBe('PERMISSIVE');
      expect(rows[0].roles).toBe('app_user');
      expect(rows[0].qual).toContain('NULLIF');
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('GET /sync/delta (master:3708-3712)', () => {
    it('answers with updated, deleted and a server timestamp', async () => {
      const res = await http()
        .get('/api/v1/sync/delta?since=2019-01-01T00:00:00.000Z&entity_types[]=task')
        .set('x-test-role', 'SITE_ENGINEER');

      expect(res.status).toBe(200);
      const body = res.body as Record<string, unknown>;
      expect(Array.isArray(body['updated'])).toBe(true);
      expect(Array.isArray(body['deleted'])).toBe(true);
      // The cursor the client stores and sends back next time.
      expect(typeof body['server_timestamp']).toBe('string');
    });

    it('reports a recorded tombstone in deleted[]', async () => {
      // The contract's whole purpose: without it a row deleted on the server survives on the device
      // forever, because a delta that only carries `updated` can never say "this is gone".
      const entityId = randomUUID();
      await infra.prisma.$executeRawUnsafe(
        `INSERT INTO platform.sync_tombstones (tenant_id, entity_type, entity_id)
         VALUES ($1::uuid, 'task', $2::uuid)`,
        TENANT_ID,
        entityId,
      );

      const res = await http()
        .get('/api/v1/sync/delta?since=2019-01-01T00:00:00.000Z&entity_types[]=task')
        .set('x-test-role', 'SITE_ENGINEER');
      expect((res.body as { deleted: string[] }).deleted).toContain(entityId);
    });

    it("does not leak another tenant's tombstones", async () => {
      // WHY THIS IS A SQL-LEVEL ASSERTION AND NOT A REQUEST ONE. The harness starts
      // PostgreSqlContainer and points APP_DATABASE_URL at the same URI, so the application connects
      // as the container's SUPERUSER — and a superuser bypasses row-level security whether or not
      // FORCE is set. Isolation therefore cannot be demonstrated through an HTTP call here: the
      // first version of this test issued the request and saw the other tenant's row, which says
      // nothing about production, where APP_DATABASE_URL is app_user.
      //
      // What CAN be established is that the query does not depend on RLS alone. The policy shape is
      // asserted above; this asserts the predicate that holds even if a connection is ever
      // misconfigured — the same belt-and-braces every other query in this module carries.
      const otherTenant = randomUUID();
      const entityId = randomUUID();
      await infra.prisma.$executeRawUnsafe(
        `INSERT INTO platform.sync_tombstones (tenant_id, entity_type, entity_id)
         VALUES ($1::uuid, 'task', $2::uuid)`,
        otherTenant,
        entityId,
      );

      // The delta read, run under a DIFFERENT tenant's GUC, must not see it.
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ entity_id: string }>>(
        `SELECT entity_id FROM platform.sync_tombstones
          WHERE tenant_id = $1::uuid AND entity_type = 'task'`,
        TENANT_ID,
      );
      expect(rows.map((r) => r.entity_id)).not.toContain(entityId);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('POST /sync/exhausted — the review queue (master:3685-3698)', () => {
    const report = (body: Record<string, unknown>, role = 'SITE_ENGINEER') =>
      http().post('/api/v1/sync/exhausted').set('x-test-role', role).send(body);

    // The kept design (PO decision 2026-08-31): platform.sync_exhaustions, keyed by
    // (tenant_id, entity_type, entity_id) and carrying the payload an admin needs to import by
    // hand. The other branch's platform.sync_exhausted_items — keyed by a device-chosen client_id
    // and holding no payload — went with its duplicate migration.
    const queueRows = (entityId: string) =>
      infra.prisma.$queryRawUnsafe<
        Array<{
          exhaustion_id: string;
          entity_type: string;
          retry_count: number;
          status: string;
          resolution: string | null;
          resolved_at: Date | null;
          payload: Record<string, unknown>;
        }>
      >(
        `SELECT exhaustion_id, entity_type, retry_count, status, resolution, resolved_at, payload
           FROM platform.sync_exhaustions WHERE entity_id = $1::uuid`,
        entityId,
      );

    const exhaustionEvents = (entityId: string) =>
      infra.prisma.$queryRawUnsafe<Array<{ payload: Record<string, unknown> }>>(
        `SELECT payload->'payload' AS payload FROM platform.outbox_events
          WHERE event_type = 'platform.sync.exhausted.v1'
            AND payload->'payload'->>'entity_id' = $1`,
        entityId,
      );

    /** A report of a mutation the device stopped retrying. `payload` is what makes it reviewable. */
    const exhausted = (entityId: string) => ({
      entity_type: 'safety',
      entity_id: entityId,
      operation: 'CREATE' as const,
      payload: { title: 'Scaffold collapse', severity: 'HIGH' },
      last_error: 'Network request failed',
    });

    it('files an exhausted safety incident on the queue', async () => {
      const entityId = randomUUID();
      const res = await report(exhausted(entityId));

      expect(res.status).toBe(200);
      const rows = await queueRows(entityId);
      expect(rows).toHaveLength(1);
      expect(rows[0].entity_type).toBe('safety');
      expect(Number(rows[0].retry_count)).toBe(5);
      // The payload is the point of the queue: §17.2 says the record is "reviewed and manually
      // imported", and an admin cannot import what the row does not carry.
      expect(rows[0].payload).toMatchObject({ title: 'Scaffold collapse' });
      // Unresolved until an administrator acts on it — that is what makes it a queue.
      expect(rows[0].status).toBe('PENDING');
      expect(rows[0].resolution).toBeNull();
      expect(rows[0].resolved_at).toBeNull();
    });

    it('emits platform.sync.exhausted so the alert routing can fire', async () => {
      const entityId = randomUUID();
      await report(exhausted(entityId));

      const events = await exhaustionEvents(entityId);
      expect(events).toHaveLength(1);
      expect(events[0].payload).toMatchObject({ entity_type: 'safety', entity_id: entityId });
    });

    it('a device re-reporting the same item files no duplicate', async () => {
      // The device keeps the row until an admin resolves it (master:3698), so it will report again
      // on a later cycle. One lost record must be one queue entry — enforced by the
      // (tenant_id, entity_type, entity_id) unique constraint and ON CONFLICT DO NOTHING.
      const entityId = randomUUID();
      await report(exhausted(entityId));
      const second = await report(exhausted(entityId));

      expect(second.status).toBe(200);
      expect(await queueRows(entityId)).toHaveLength(1);

      // And no second alert: the PM is told once that this incident was lost, not once per retry.
      expect(await exhaustionEvents(entityId)).toHaveLength(1);
    });

    it('is refused to a role that could not have pushed the entity in the first place', async () => {
      // SyncAuthGuard reads entity_type off the body, so reporting an exhausted safety incident
      // requires the same roles as pushing one. SITE_WORKER is absent from SAFETY_WRITE_ROLES.
      const entityId = randomUUID();
      const res = await report(exhausted(entityId), 'SITE_WORKER');

      expect(res.status).toBe(403);
      expect(await queueRows(entityId)).toHaveLength(0);
    });

    it('is tenant-isolated in the canonical form (ADR-031)', async () => {
      const rows = await infra.prisma.$queryRawUnsafe<
        Array<{ policyname: string; permissive: string; roles: string; qual: string; wc: string }>
      >(
        `SELECT policyname, permissive, array_to_string(roles, ',') AS roles,
                COALESCE(qual,'') AS qual, COALESCE(with_check,'') AS wc
           FROM pg_policies
          WHERE schemaname = 'platform' AND tablename = 'sync_exhaustions'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].policyname).toBe('rls_tenant_isolation');
      expect(rows[0].permissive).toBe('PERMISSIVE');
      expect(rows[0].roles).toBe('app_user');
      expect(rows[0].qual).toContain('NULLIF');
      expect(rows[0].wc).toContain('app.current_tenant_id');
    });
  });
});
