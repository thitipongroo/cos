// k6 Load Test — Scenario 1: Dashboard SLA Validation
// Source: spec §Phase 18 — "GET /api/v1/analytics/executive — 100 VUs, 5 min"
// Pass criteria: P95 < 3s, error rate < 0.1%
// Run: k6 run tests/load/dashboard-sla.js -e BASE_URL=https://api-staging.construction-os.io

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '1m', target: 30 },
    { duration: '3m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    errors: ['rate<0.001'],
    http_req_failed: ['rate<0.001'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const res = http.get(`${BASE_URL}/api/v1/analytics/executive`, {
    headers: {
      Authorization: `Bearer ${__ENV.API_TOKEN || ''}`,
      'x-tenant-id': __ENV.TENANT_ID || 'test-tenant',
    },
  });

  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 3s': (r) => r.timings.duration < 3000,
    'has data key': (r) => {
      try {
        const body = JSON.parse(r.body);
        return 'data' in body;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!ok);
  sleep(0.5);
}
