/**
 * Phase 22 — Workforce Service against a real database (master:5329-5420).
 *
 * Four things here can only be settled by running: that BOTH hypertables were created and on the
 * partition columns the spec names, that the timesheet table really chunks by month, that the
 * check-in/out cycle computes hours end to end (master:5395-5396), and that the approval gate the spec
 * writes inline actually refuses a Project Manager.
 *
 * The event assertions read the OUTBOX rather than Kafka. That is not a shortcut: the outbox row is
 * the exact envelope the poller hands to KafkaProducer.publish, so a payload that cannot Avro-encode
 * is visible here — which is how the check-in event was found to be unpublishable for its whole life.
 */
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  clsAuthGuard,
  type IntegrationInfra,
} from '../helpers/integration-infra';
import { AppModule } from '../../src/app.module';
import { JwtAuthGuard } from '../../src/shared/guards/jwt-auth.guard';

jest.setTimeout(900_000);

const TENANT_ID = 'ffffffff-1111-4000-8000-000000000022';
const USER_ID = 'ffffffff-2222-4000-8000-000000000022';
const PROJECT_ID = 'ffffffff-3333-4000-8000-000000000022';

const roleOf = (req: Record<string, unknown>): string => {
  const headers = (req['headers'] ?? {}) as Record<string, string>;
  return headers['x-test-role'] ?? 'TENANT_ADMIN';
};

describe('Phase 22 · workforce over HTTP', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;
  let seq = 0;

  const api = (): ReturnType<typeof request> => request(app.getHttpServer());

  const expectStatus = (res: request.Response, code: number): request.Response => {
    if (res.status !== code) {
      throw new Error(`expected ${code}, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res;
  };

  const createWorker = async (): Promise<string> => {
    const res = expectStatus(
      await api()
        .post('/api/v1/workers')
        .send({
          employee_code: `W-${(seq += 1).toString().padStart(3, '0')}`,
          full_name: 'Somchai',
          trade_type: 'Carpenter',
          employment_type: 'PERMANENT',
        }),
      201,
    );
    return (res.body as { worker_id: string }).worker_id;
  };

  const outboxPayloads = async (eventType: string): Promise<Array<Record<string, unknown>>> => {
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ payload: { payload: unknown } }>>(
      `SELECT payload FROM platform.outbox_events WHERE tenant_id = $1 AND event_type = $2`,
      TENANT_ID,
      eventType,
    );
    return rows.map((r) => r.payload.payload as Record<string, unknown>);
  };

  beforeAll(async () => {
    infra = await startIntegrationInfra();

    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'sd-p22', 'Spec Derived P22', 'realm-sd-p22', 'STARTER'::platform."PlanType", true)`,
      TENANT_ID,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-sd-p22', 'p22@example.com', 'Spec User')`,
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
        tenantCode: 'sd-p22',
      };
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  // ── 13. Schema on a real database ─────────────────────────────────────────

  describe('entities and hypertables (master:5337-5382)', () => {
    it('creates both workforce tables', async () => {
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'workforce'`,
      );
      expect(rows.map((r) => r.table_name).sort()).toEqual(['project_workforce', 'workers']);
    });

    it('registers BOTH telemetry tables as hypertables', async () => {
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ hypertable_name: string }>>(
        `SELECT hypertable_name FROM timescaledb_information.hypertables
          WHERE hypertable_schema = 'workforce_telemetry' ORDER BY hypertable_name`,
      );
      expect(rows.map((r) => r.hypertable_name)).toEqual(['attendance_logs', 'timesheets']);
    });

    it('partitions each on the column the spec names', async () => {
      const rows = await infra.prisma.$queryRawUnsafe<
        Array<{ hypertable_name: string; column_name: string }>
      >(
        // No time_interval here: it is a PostgreSQL `interval`, which Prisma refuses to deserialise
        // unless cast. The next test selects it as text for exactly that reason.
        `SELECT hypertable_name, column_name FROM timescaledb_information.dimensions
          WHERE hypertable_schema = 'workforce_telemetry' ORDER BY hypertable_name`,
      );
      expect(rows.map((r) => [r.hypertable_name, r.column_name])).toEqual([
        ['attendance_logs', 'recorded_at'],
        ['timesheets', 'period_date'],
      ]);
    });

    it('chunks timesheets at month scale, not at the seven-day default', async () => {
      // master:5376 says "partition key (by month)". Timescale's default is 7 days, which still
      // works and would quietly shard every monthly period into four chunks.
      //
      // The migration writes INTERVAL '1 month' and Timescale reports it back as "30 days" — it
      // normalises a month against a DATE partition column. So the assertion is on the SCALE, which
      // is the thing that matters, rather than on the word: at 7 days this reads "7 days" and fails.
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ time_interval: string }>>(
        `SELECT time_interval::text FROM timescaledb_information.dimensions
          WHERE hypertable_schema = 'workforce_telemetry' AND hypertable_name = 'timesheets'`,
      );
      const days = Number(/^(\d+)\s+days?$/.exec(rows[0].time_interval)?.[1] ?? NaN);
      expect(rows[0].time_interval).toMatch(/^\d+ days?$|mon/);
      if (!Number.isNaN(days)) expect(days).toBeGreaterThanOrEqual(28);
    });

    it('carries BOTH attendance indexes the spec names, on the right columns in the right order', async () => {
      // master:5371-5372 names two indexes on attendance_logs, and names their columns in order:
      // (worker_id, recorded_at DESC) and (project_id, recorded_at DESC). A hypertable inherits the
      // parent definition into every chunk, so a missing index here is a missing index everywhere —
      // and nothing else in the estate reads these. Asserted on the COLUMN TUPLE rather than the
      // index name, because the name is ours and the columns are the spec's.
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
        `SELECT indexdef FROM pg_indexes
          WHERE schemaname = 'workforce_telemetry' AND tablename = 'attendance_logs'`,
      );
      const tuples = rows.map((r) =>
        (/\(([^)]*)\)\s*$/.exec(r.indexdef)?.[1] ?? '')
          .split(',')
          .map((c) => c.trim())
          .join(', '),
      );
      expect(tuples).toContain('worker_id, recorded_at DESC');
      expect(tuples).toContain('project_id, recorded_at DESC');
    });

    it('declares both enums with exactly the symbols the spec lists', async () => {
      // master:5344 and master:5382 each fix three symbols. PostgreSQL enum labels are ordered, and
      // that order is what `<` and ORDER BY use, so the assertion is on the ordered array: a symbol
      // added, dropped, renamed or reordered all fail here. Only PERMANENT and the two timesheet
      // statuses the service writes are otherwise exercised anywhere.
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ typname: string; label: string }>>(
        `SELECT t.typname, e.enumlabel AS label
           FROM pg_type t
           JOIN pg_enum e ON e.enumtypid = t.oid
          WHERE t.typname IN ('employment_type_enum', 'timesheet_status_enum')
          ORDER BY t.typname, e.enumsortorder`,
      );
      const labels = (name: string): string[] =>
        rows.filter((r) => r.typname === name).map((r) => r.label);
      expect(labels('employment_type_enum')).toEqual(['PERMANENT', 'CONTRACT', 'SUBCONTRACT']);
      expect(labels('timesheet_status_enum')).toEqual(['DRAFT', 'SUBMITTED', 'APPROVED']);
    });

    it.each(['PERMANENT', 'CONTRACT', 'SUBCONTRACT'])(
      'accepts employment_type %s through the API and stores it',
      async (employmentType) => {
        // The suite proved PERMANENT accepted and FREELANCE refused, which a one-value allowlist
        // would also pass. CONTRACT and SUBCONTRACT are the two the spec names and nothing tried.
        const code = `E-${(seq += 1).toString().padStart(3, '0')}`;
        const res = expectStatus(
          await api().post('/api/v1/workers').send({
            employee_code: code,
            full_name: 'Somchai',
            trade_type: 'Welder',
            employment_type: employmentType,
          }),
          201,
        );
        const id = (res.body as { worker_id: string }).worker_id;
        const rows = await infra.prisma.$queryRawUnsafe<Array<{ employment_type: string }>>(
          `SELECT employment_type::text FROM workforce.workers WHERE worker_id = $1::uuid`,
          id,
        );
        expect(rows.map((r) => r.employment_type)).toEqual([employmentType]);
      },
    );
  });

  // ── 14. RLS ───────────────────────────────────────────────────────────────

  describe('tenant isolation', () => {
    it('carries the canonical policy on the workforce tables', async () => {
      const rows = await infra.prisma.$queryRawUnsafe<
        Array<{ tablename: string; policyname: string; permissive: string; qual: string | null }>
      >(
        `SELECT tablename, policyname, permissive, qual FROM pg_policies WHERE schemaname = 'workforce'`,
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.filter((r) => r.permissive !== 'PERMISSIVE')).toEqual([]);
      expect(rows.filter((r) => r.policyname !== 'rls_tenant_isolation')).toEqual([]);
      expect(rows.filter((r) => !(r.qual ?? '').includes('NULLIF'))).toEqual([]);
    });

    it('hides another tenant rows from app_user', async () => {
      await createWorker();
      const other = randomUUID();
      const scoped = await infra.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE app_user');
        await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', $1, true)`, other);
        return tx.$queryRawUnsafe<Array<{ n: bigint }>>(
          `SELECT count(*)::bigint AS n FROM workforce.workers`,
        );
      });
      // CONTROL: the superuser connection sees what this suite created, so the zero above means
      // "RLS filtered them", not "the table is empty".
      const all = await infra.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*)::bigint AS n FROM workforce.workers`,
      );
      expect(Number(scoped[0].n)).toBe(0);
      expect(Number(all[0].n)).toBeGreaterThan(0);
    });
  });

  // ── 15. Check-in / check-out cycle ────────────────────────────────────────

  describe('check-in / check-out cycle (master:5395-5396)', () => {
    it('records a check-in and emits a payload the event schema can encode', async () => {
      const workerId = await createWorker();

      expectStatus(
        await api().post(`/api/v1/workers/${workerId}/attendance`).send({
          project_id: PROJECT_ID,
          check_in_at: '2026-08-25T01:00:00.000Z',
          latitude: 13.7563,
          longitude: 100.5018,
        }),
        201,
      );

      const payloads = await outboxPayloads('workforce.checkin.created.v1');
      expect(payloads.length).toBeGreaterThan(0);
      const p = payloads[payloads.length - 1];
      // Every field workforce.checkin.created.v1.avsc requires WITHOUT a default. The old payload
      // carried none of checkin_id / checkin_at / method, so it could never encode.
      expect(Object.keys(p).sort()).toEqual(
        ['checkin_at', 'checkin_id', 'location', 'method', 'project_id', 'worker_id'].sort(),
      );
      expect(p['method']).toBe('MANUAL');
      expect(p['location']).toEqual({ lat: 13.7563, lng: 100.5018 });
    });

    it('computes hours_worked from the two timestamps on check-out', async () => {
      const workerId = await createWorker();
      expectStatus(
        await api().post(`/api/v1/workers/${workerId}/attendance`).send({
          project_id: PROJECT_ID,
          check_in_at: '2026-08-25T01:00:00.000Z',
          check_out_at: '2026-08-25T09:30:00.000Z',
        }),
        201,
      );

      const rows = await infra.prisma.$queryRawUnsafe<Array<{ hours_worked: string | null }>>(
        `SELECT hours_worked FROM workforce_telemetry.attendance_logs
          WHERE tenant_id = $1::uuid AND worker_id = $2::uuid`,
        TENANT_ID,
        workerId,
      );
      expect(rows).toHaveLength(1);
      // 8.5 hours, to two decimal places — the column is DECIMAL(5,2).
      expect(Number(rows[0].hours_worked)).toBeCloseTo(8.5, 2);
    });

    it('emits checkout, not checkin, once a check-out time is present', async () => {
      const payloads = await outboxPayloads('workforce.checkout.created.v1');
      expect(payloads.length).toBeGreaterThan(0);
      expect(Object.keys(payloads[payloads.length - 1]).sort()).toEqual([
        'hours_worked',
        'project_id',
        'worker_id',
      ]);
    });
  });

  // ── 16. Timesheet approval ────────────────────────────────────────────────

  describe('timesheet approval (master:5398)', () => {
    const submit = async (workerId: string): Promise<string> => {
      const res = expectStatus(
        await api().post('/api/v1/timesheets').send({
          worker_id: workerId,
          project_id: PROJECT_ID,
          period_date: '2026-08-01',
          regular_hours: 160,
          overtime_hours: 8,
        }),
        201,
      );
      return (res.body as { timesheet_id: string }).timesheet_id;
    };

    it('refuses approval from a Project Manager', async () => {
      // master:5398 names SITE_ENGINEER on this route specifically — a tighter authority than the
      // roles that may RECORD hours, because approval is where hours become payable.
      const id = await submit(await createWorker());
      await api()
        .patch(`/api/v1/timesheets/${id}/approve`)
        .set('x-test-role', 'PROJECT_MANAGER')
        .send({})
        .expect(403);
    });

    it('accepts approval from a Site Engineer and emits the event', async () => {
      const workerId = await createWorker();
      const id = await submit(workerId);
      expectStatus(
        await api()
          .patch(`/api/v1/timesheets/${id}/approve`)
          .set('x-test-role', 'SITE_ENGINEER')
          .send({}),
        200,
      );

      const payloads = await outboxPayloads('workforce.timesheet.approved.v1');
      expect(payloads.length).toBeGreaterThan(0);
      expect(Object.keys(payloads[payloads.length - 1]).sort()).toEqual([
        'period_date',
        'project_id',
        'total_hours',
        'worker_id',
      ]);
    });

    it('moves the row SUBMITTED then APPROVED, and never leaves it behind', async () => {
      // The two tests above assert HTTP status and the event payload. Neither reads the timesheet
      // row, so an approve that emitted the event and forgot the UPDATE would pass both. These are
      // two of the three symbols master:5382 fixes; the third, DRAFT, is the column default.
      const id = await submit(await createWorker());
      const statusOf = async (): Promise<string> =>
        (
          await infra.prisma.$queryRawUnsafe<Array<{ status: string }>>(
            `SELECT status::text FROM workforce_telemetry.timesheets WHERE timesheet_id = $1::uuid`,
            id,
          )
        )[0].status;

      expect(await statusOf()).toBe('SUBMITTED');
      expectStatus(
        await api()
          .patch(`/api/v1/timesheets/${id}/approve`)
          .set('x-test-role', 'SITE_ENGINEER')
          .send({}),
        200,
      );
      expect(await statusOf()).toBe('APPROVED');
    });
  });

  // ── Actor attribution ─────────────────────────────────────────────────────

  describe('event actor attribution', () => {
    it('records the acting user, never the literal "system"', async () => {
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ payload: { actor_id: string } }>>(
        `SELECT payload FROM platform.outbox_events WHERE tenant_id = $1`,
        TENANT_ID,
      );
      expect(rows.length).toBeGreaterThan(0);
      const actors = [...new Set(rows.map((r) => r.payload.actor_id))];
      expect(actors).toEqual([USER_ID]);
    });
  });

  // ── DTO validation at the HTTP boundary ─────────────────────────────────
  //
  // Absorbed from backend/test/workforce.integration.spec.ts (deleted 2026-08-25) when the two
  // workforce suites were merged. Only the STRICT cases came across: 10 of that file's 17 asserted
  // `expect([201, 404, 500]).toContain(res.status)`, which passes when the endpoint 500s, so they
  // could not fail and were not worth carrying. These seven assert one status and do fail.
  //
  // They belong at this level rather than in a unit test: whether a missing field is rejected
  // depends on the ValidationPipe being wired with the same options main.ts uses, which only a
  // booted app can show.

  describe('rejects a malformed payload before it reaches the database', () => {
    it('refuses a worker with no employee_code', async () => {
      const res = await api().post('/api/v1/workers').send({
        full_name: 'Somchai Jaidee',
        trade_type: 'Carpenter',
        employment_type: 'PERMANENT',
      });
      expect(res.status).toBe(400);
    });

    it('refuses an employment_type outside the enum', async () => {
      const res = await api().post('/api/v1/workers').send({
        employee_code: 'EMP-BAD',
        full_name: 'Somchai Jaidee',
        trade_type: 'Carpenter',
        employment_type: 'FREELANCE',
      });
      expect(res.status).toBe(400);
    });

    it('refuses attendance with no project_id', async () => {
      // A check-in that names no project cannot be counted into any site's manpower total.
      const workerId = await createWorker();
      const res = await api()
        .post(`/api/v1/workers/${workerId}/attendance`)
        .send({ check_in_at: '2026-06-12T08:00:00Z' });
      expect(res.status).toBe(400);
    });

    it('refuses an allocation whose worker_id is not a UUID', async () => {
      const res = await api()
        .post(`/api/v1/projects/${PROJECT_ID}/workforce`)
        .send({ worker_id: 'not-a-uuid', start_date: '2026-06-12' });
      expect(res.status).toBe(400);
    });

    it('refuses an allocation with no start_date', async () => {
      const workerId = await createWorker();
      const res = await api()
        .post(`/api/v1/projects/${PROJECT_ID}/workforce`)
        .send({ worker_id: workerId });
      expect(res.status).toBe(400);
    });

    it('refuses a timesheet with no period_date', async () => {
      const workerId = await createWorker();
      const res = await api()
        .post('/api/v1/timesheets')
        .send({ worker_id: workerId, project_id: PROJECT_ID });
      expect(res.status).toBe(400);
    });

    it('refuses a timesheet whose worker_id is not a UUID', async () => {
      const res = await api().post('/api/v1/timesheets').send({
        worker_id: 'not-a-uuid',
        project_id: PROJECT_ID,
        period_date: '2026-06-01',
      });
      expect(res.status).toBe(400);
    });
  });
});
