// QM-6 / Phase 19 production-readiness load gate — mixed read + write baseline.
//
// Source of truth for this profile:
//   - context.md QM-6  : k6 sustained load 100 VU x 5 min, 0 errors, p95 within budget
//   - context.md QM-6  : API p95 read (GET) < 300ms, API p95 write (POST/PUT) < 500ms
//   - context.md Phase 19 automated check #7 : k6 run --vus 100 --duration 300s
//   - spec 31-monitoring-observability 31.6 : the same SLO targets
//
// Rewritten 2026-08-22 (see docs/specifications/35-test-design.md 35.13 ESC-12): the previous
// version ran 20->50 VUs against /health/live only, with a single p95<1000ms threshold. That did
// not exercise any read or write endpoint and did not match the profile context.md documents for
// this file, so the Phase 19 gate was not actually measuring the QM-6 budget.
//
// Run:
//   k6 run scripts/loadtest/api-baseline.js \
//     -e BASE_URL=https://api-staging.construction-os.io \
//     -e TENANT_ID=<uuid> -e PROJECT_ID=<uuid> -e AUTH_TOKEN=<jwt>
//
// The dedicated per-deploy smoke check remains the health probe in the deploy pipeline; this
// script is the readiness/weekly gate, not a smoke test.

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const readLatency = new Trend('read_latency_ms', true);
const writeLatency = new Trend('write_latency_ms', true);

export const options = {
  scenarios: {
    baseline: {
      executor: 'constant-vus',
      vus: 100,
      duration: '5m',
      tags: { scenario: 'qm6_baseline' },
    },
  },
  thresholds: {
    // QM-6 read budget (GET)
    'http_req_duration{op:read}': ['p(95)<300'],
    read_latency_ms: ['p(95)<300'],
    // QM-6 write budget (POST/PUT)
    'http_req_duration{op:write}': ['p(95)<500'],
    write_latency_ms: ['p(95)<500'],
    // QM-6 / SLO error budget
    errors: ['rate<0.001'],
    http_req_failed: ['rate<0.001'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TENANT_ID = __ENV.TENANT_ID || 'test-tenant-id';
const PROJECT_ID = __ENV.PROJECT_ID || 'test-project-id';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token';

function commonHeaders() {
  return {
    Authorization: `Bearer ${AUTH_TOKEN}`,
    'X-Tenant-ID': TENANT_ID,
    'X-Request-ID': `lt-baseline-${__VU}-${__ITER}-${Date.now()}`,
    Accept: 'application/json',
  };
}

function doGet(path) {
  const start = Date.now();
  const res = http.get(`${BASE_URL}${path}`, {
    headers: commonHeaders(),
    timeout: '5s',
    tags: { op: 'read' },
  });
  readLatency.add(Date.now() - start);
  return res;
}

function doPost(path, body) {
  const start = Date.now();
  const res = http.post(`${BASE_URL}${path}`, JSON.stringify(body), {
    headers: { ...commonHeaders(), 'Content-Type': 'application/json' },
    timeout: '5s',
    tags: { op: 'write' },
  });
  writeLatency.add(Date.now() - start);
  return res;
}

export default function () {
  // 5 reads : 1 write per cycle - read-heavy, matching real dashboard/list traffic.
  const step = __ITER % 6;
  let ok = true;
  let res;

  switch (step) {
    case 0:
      group('GET /api/v1/projects', () => {
        res = doGet('/api/v1/projects?page=1&limit=20');
        ok = check(res, {
          'projects list 200': (r) => r.status === 200,
          'projects read < 300ms': (r) => r.timings.duration < 300,
        });
      });
      break;

    case 1:
      group('GET /api/v1/projects/:id', () => {
        res = doGet(`/api/v1/projects/${PROJECT_ID}`);
        ok = check(res, {
          'project detail 200 or 404': (r) => r.status === 200 || r.status === 404,
          'project detail read < 300ms': (r) => r.timings.duration < 300,
        });
      });
      break;

    case 2:
      group('GET /api/v1/procurement/purchase-orders', () => {
        res = doGet(`/api/v1/procurement/purchase-orders?project_id=${PROJECT_ID}&page=1&limit=20`);
        ok = check(res, {
          'PO list 200': (r) => r.status === 200,
          'PO list read < 300ms': (r) => r.timings.duration < 300,
        });
      });
      break;

    case 3:
      group('GET /api/v1/finance/cost-transactions', () => {
        res = doGet(`/api/v1/finance/cost-transactions?project_id=${PROJECT_ID}&page=1&limit=20`);
        ok = check(res, {
          'cost transactions 200': (r) => r.status === 200,
          'cost transactions read < 300ms': (r) => r.timings.duration < 300,
        });
      });
      break;

    case 4:
      group('GET /api/v1/site/reports', () => {
        res = doGet(`/api/v1/site/reports?project_id=${PROJECT_ID}&page=1&limit=20`);
        ok = check(res, {
          'site reports 200': (r) => r.status === 200,
          'site reports read < 300ms': (r) => r.timings.duration < 300,
        });
      });
      break;

    case 5:
      // Write path: creating an issue is the cheapest non-financial write that exercises
      // validation + RLS + persistence. Financial writes are intentionally NOT load-tested
      // against staging seed data.
      group('POST /api/v1/site/issues', () => {
        res = doPost('/api/v1/site/issues', {
          project_id: PROJECT_ID,
          title: `loadtest-${__VU}-${__ITER}`,
          issue_type: 'GENERAL',
          severity: 'LOW',
        });
        ok = check(res, {
          'issue create 201 or 200': (r) => r.status === 201 || r.status === 200,
          'issue create write < 500ms': (r) => r.timings.duration < 500,
        });
      });
      break;
  }

  errorRate.add(!ok);
  sleep(0.5);
}
