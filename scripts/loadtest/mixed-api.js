// k6 Load Test — Scenario 3: Mixed API Read
// Source: spec §Phase 18 k6 scenario 3
//   Target: mixed read endpoints — 200 VUs, 10 min
//   Pass criteria: P95 < 1s, error rate < 0.1%
//
// Run: k6 run scripts/loadtest/mixed-api.js \
//        -e BASE_URL=https://api-staging.construction-os.io \
//        -e AUTH_TOKEN=<bearer-token> \
//        -e TENANT_ID=<uuid> \
//        -e PROJECT_ID=<uuid>

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('mixed_errors');
const readLatency = new Trend('read_latency_ms', true);

export const options = {
  scenarios: {
    mixed_read: {
      executor: 'constant-vus',
      vus: 200,
      duration: '10m',
    },
  },
  thresholds: {
    // Pass criteria: P95 < 1s, error rate < 0.1%
    'http_req_duration{scenario:mixed_read}': ['p(95)<1000'],
    mixed_errors: ['rate<0.001'],
    http_req_failed: ['rate<0.001'],
    read_latency_ms: ['p(95)<1000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token';
const TENANT_ID = __ENV.TENANT_ID || 'test-tenant-id';
const PROJECT_ID = __ENV.PROJECT_ID || 'test-project-id';

function commonHeaders() {
  return {
    Authorization: `Bearer ${AUTH_TOKEN}`,
    'X-Tenant-ID': TENANT_ID,
    'X-Request-ID': `lt-mixed-${__VU}-${__ITER}-${Date.now()}`,
    Accept: 'application/json',
  };
}

function doGet(path) {
  const start = Date.now();
  const res = http.get(`${BASE_URL}${path}`, { headers: commonHeaders(), timeout: '5s' });
  readLatency.add(Date.now() - start);
  return res;
}

export default function () {
  const scenario = __ITER % 6;

  let ok = true;
  let res;

  switch (scenario) {
    case 0:
      group('GET /api/v1/projects', () => {
        res = doGet('/api/v1/projects?page=1&limit=20');
        ok = check(res, {
          'projects list 200': (r) => r.status === 200,
          'projects p95 < 1s': (r) => r.timings.duration < 1000,
        });
      });
      break;

    case 1:
      group('GET /api/v1/projects/:id', () => {
        res = doGet(`/api/v1/projects/${PROJECT_ID}`);
        ok = check(res, {
          'project detail 200 or 404': (r) => r.status === 200 || r.status === 404,
          'project detail p95 < 1s': (r) => r.timings.duration < 1000,
        });
      });
      break;

    case 2:
      group('GET /api/v1/procurement/purchase-requests', () => {
        res = doGet(
          `/api/v1/procurement/purchase-requests?project_id=${PROJECT_ID}&page=1&limit=20`,
        );
        ok = check(res, {
          'PR list 200': (r) => r.status === 200,
          'PR list p95 < 1s': (r) => r.timings.duration < 1000,
        });
      });
      break;

    case 3:
      group('GET /api/v1/boq', () => {
        res = doGet(`/api/v1/boq?project_id=${PROJECT_ID}`);
        ok = check(res, {
          'BOQ 200 or 404': (r) => r.status === 200 || r.status === 404,
          'BOQ p95 < 1s': (r) => r.timings.duration < 1000,
        });
      });
      break;

    case 4:
      group('GET /api/v1/site-ops/reports', () => {
        res = doGet(`/api/v1/site-ops/reports?project_id=${PROJECT_ID}&page=1&limit=20`);
        ok = check(res, {
          'reports 200': (r) => r.status === 200,
          'reports p95 < 1s': (r) => r.timings.duration < 1000,
        });
      });
      break;

    case 5:
      group('GET /health/live', () => {
        res = doGet('/health/live');
        ok = check(res, {
          'health live 200': (r) => r.status === 200,
          'health p95 < 100ms': (r) => r.timings.duration < 100,
        });
      });
      break;
  }

  errorRate.add(!ok);

  // 100 req/min general limit → 0.6s minimum per request at 200 VU concurrency
  // Sleep 0.5s to stay within rate limits (QM-7)
  sleep(0.5);
}
