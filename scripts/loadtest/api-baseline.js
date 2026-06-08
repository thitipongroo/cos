// Production readiness load test — API gateway throughput baseline
// Source: spec §Phase 19 — production readiness gate
// This is the staging smoke load test run after each deploy.
// For full load tests see tests/load/
// Run: k6 run scripts/loadtest/api-baseline.js -e BASE_URL=https://api-staging.construction-os.io

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '2m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    errors: ['rate<0.001'],
    http_req_failed: ['rate<0.001'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const res = http.get(`${BASE_URL}/health/live`, {
    headers: { 'x-tenant-id': __ENV.TENANT_ID || 'test-tenant' },
  });

  const ok = check(res, {
    'health check 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
  });

  errorRate.add(!ok);
  sleep(0.1);
}
