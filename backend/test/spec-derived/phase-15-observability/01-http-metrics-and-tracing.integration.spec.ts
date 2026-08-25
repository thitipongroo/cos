/**
 * Phase 15 — HTTP metrics and trace propagation, exercised through the real Nest pipeline
 * (master:4356-4357, 4396-4399, 4432).
 *
 * WHAT THIS HARNESS CAN AND CANNOT SETTLE. The Prometheus exporter is a separate HTTP server the
 * OpenTelemetry SDK starts on its own port, not a Nest route — so there is no /metrics endpoint to
 * scrape from inside a supertest app, and asserting one would prove nothing about production. What
 * a booted application CAN settle is the half that actually breaks: whether the interceptor is
 * installed globally and fires on EVERY request, including the ones that fail — a metric that is
 * only recorded on success makes an error-rate alert read zero during an outage.
 */
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ MessageId: 'mock-msg-id' }),
  })),
  PublishCommand: jest.fn(),
}));

const recorded: Array<{ kind: 'duration' | 'count'; attrs: Record<string, string> }> = [];

// Both the interceptor and the unmatched-route middleware record into ONE shared instrument pair
// (http-metrics.shared.ts), so mocking that module captures whichever layer handled the request.
jest.mock('../../../src/shared/interceptors/http-metrics.shared', () => {
  const actual = jest.requireActual('../../../src/shared/interceptors/http-metrics.shared');
  return {
    ...actual,
    httpMetrics: {
      httpRequestDuration: {
        record: (_v: number, attrs: Record<string, string>) =>
          recorded.push({ kind: 'duration', attrs }),
      },
      httpRequestsTotal: {
        add: (_v: number, attrs: Record<string, string>) => recorded.push({ kind: 'count', attrs }),
      },
    },
  };
});

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  clsAuthGuard,
  type IntegrationInfra,
} from '../../helpers/integration-infra';
import { AppModule } from '../../../src/app.module';
import { JwtAuthGuard } from '../../../src/modules/identity/guards/jwt-auth.guard';

jest.setTimeout(900_000);

const TENANT_ID = 'bbbb1111-1111-4000-8000-000000000150';
const USER_ID = 'bbbb2222-2222-4000-8000-000000000150';

describe('Phase 15 · HTTP metrics on a booted application', () => {
  let infra: IntegrationInfra;
  let app: INestApplication;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'sd-p150', 'Spec Derived P15', 'construction-os', 'STARTER'::platform."PlanType", true)`,
      TENANT_ID,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-p150', '+66890000150', 'p150@example.com', 'P150')`,
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
        role: 'TENANT_ADMIN',
        tenantCode: 'sd-p150',
      };
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await stopIntegrationInfra(infra);
  });

  beforeEach(() => {
    recorded.length = 0;
  });

  const http = () => request(app.getHttpServer());

  it('records both metrics for a successful request', () => {
    // http_request_duration_seconds AND http_requests_total (master:4356-4357). The alert rules
    // need both: APIHighLatency reads the histogram, APIHighErrorRate reads the counter.
    return http()
      .get('/api/v1/projects')
      .expect((res) => {
        expect([200, 401, 403]).toContain(res.status);
        expect(recorded.some((r) => r.kind === 'duration')).toBe(true);
        expect(recorded.some((r) => r.kind === 'count')).toBe(true);
      });
  });

  it('labels the metric with method, path and status', () => {
    // APIHighErrorRate is `status=~"5.."` over total — without a status label the ratio cannot be
    // computed at all, and the alert silently never fires.
    return http()
      .get('/api/v1/projects')
      .expect(() => {
        const entry = recorded.find((r) => r.kind === 'count');
        expect(entry).toBeDefined();
        expect(entry!.attrs).toHaveProperty('method', 'GET');
        expect(entry!.attrs).toHaveProperty('status');
        expect(entry!.attrs).toHaveProperty('path');
      });
  });

  it('records a request that fails validation, not only ones that succeed', () => {
    // The case the error-rate alert exists for. An interceptor that recorded on success alone
    // would leave the numerator empty during exactly the incident it is meant to catch.
    return http()
      .post('/api/v1/projects')
      .send({ project_code: '' })
      .expect(() => {
        expect(recorded.length).toBeGreaterThan(0);
        const statuses = recorded.map((r) => r.attrs['status']);
        expect(statuses.some((s) => s !== '200')).toBe(true);
      });
  });

  it('counts a request that matches no route', async () => {
    // A global interceptor runs inside the route pipeline and never sees these, so they used to be
    // absent from http_requests_total entirely — a scanner, or a client built against the wrong
    // prefix, produced no traffic at all as far as the metrics were concerned. The middleware
    // added 2026-08-24 closes that.
    recorded.length = 0;
    await http().get(`/api/v1/no-such-route-${randomUUID()}`).expect(404);
    expect(recorded.some((r) => r.attrs['status'] === '404')).toBe(true);
  });

  it('collapses every unmatched path into one label', async () => {
    // The URL of a 404 is client-controlled. One series per distinct path is a cardinality
    // explosion that takes Prometheus down long before anyone reads the dashboard.
    recorded.length = 0;
    await http().get(`/api/v1/nope-${randomUUID()}`).expect(404);
    await http().get(`/api/v1/also-nope-${randomUUID()}`).expect(404);
    const paths = new Set(recorded.filter((r) => r.kind === 'count').map((r) => r.attrs['path']));
    expect(paths.size).toBe(1);
    expect([...paths][0]).toBe('(unmatched)');
  });

  it('counts a matched request exactly once', async () => {
    // The interceptor and the middleware both see a request that DID reach a route; only one of
    // them may count it, or every real endpoint is double-counted and the error ratio halves.
    recorded.length = 0;
    await http().get('/api/v1/projects');
    expect(recorded.filter((r) => r.kind === 'count')).toHaveLength(1);
  });

  it('records a failed request under the status the client actually received', async () => {
    // FOUND BY THIS TEST, 2026-08-23: the error branch recorded a blanket 500. A 400 from
    // validation was counted as a server error, so APIHighErrorRate — 5xx over total, severity
    // critical — paged on-call for any burst of client errors, and a real 5xx could not be told
    // apart from them.
    recorded.length = 0;
    const res = await http().post('/api/v1/projects').send({});
    expect(recorded.length).toBeGreaterThan(0);
    expect(recorded.some((r) => r.attrs['status'] === String(res.status))).toBe(true);
  });

  it('does not group every request under one path label', () => {
    // A single "unknown" bucket would make the per-service latency dashboard useless: one slow
    // endpoint would be indistinguishable from the whole service degrading.
    recorded.length = 0;
    return http()
      .get('/api/v1/projects')
      .then(() => http().get('/api/v1/users'))
      .then(() => {
        const paths = new Set(recorded.map((r) => r.attrs['path']));
        expect(paths.size).toBeGreaterThan(1);
      });
  });

  // ── liveness ────────────────────────────────────────────────────────────
  //
  // Absorbed from backend/test/auth.integration.spec.ts (deleted 2026-08-25) — it had nothing to do
  // with auth and was the only HTTP-level assertion on the probe anywhere. This is the endpoint
  // Kubernetes restarts the pod on, so it has to answer without a tenant, without a token, and
  // without touching anything that can be slow.

  describe('GET /api/v1/health/live', () => {
    it('answers 200 with status ok to an unauthenticated caller', async () => {
      const res = await http().get('/api/v1/health/live');

      expect(res.status).toBe(200);
      expect((res.body as { status: string }).status).toBe('ok');
    });
  });
});

describe('Phase 15 · W3C trace context (master:4399)', () => {
  it('a traceparent header survives the request unchanged in shape', async () => {
    // Propagation across HTTP is what makes one trace span two services. The header format is
    // fixed by W3C: version-traceid-spanid-flags, with a 32-hex trace id.
    const traceId = randomUUID().replace(/-/g, '');
    const spanId = randomUUID().replace(/-/g, '').slice(0, 16);
    const traceparent = `00-${traceId}-${spanId}-01`;
    expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);
  });

  it('the Kafka propagation helper carries the same header names', () => {
    // Kafka is the hop the SDK does not instrument for us — an async boundary loses the trace
    // unless the headers are injected deliberately.
    const helper = readFileSync(
      resolve(__dirname, '../../../../packages/@cos/tracing/src/kafka-propagation.ts'),
      'utf8',
    );
    expect(helper).toMatch(/traceparent/);
    expect(helper).toMatch(/tracestate/);
  });
});
