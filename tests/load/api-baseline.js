// k6 Load Test — Scenario 3: API Gateway Throughput
// Source: spec §Phase 18 — "mixed read endpoints — 200 VUs, 10 min"
// Pass criteria: P95 < 1s, error rate < 0.1%
// Run: k6 run tests/load/api-baseline.js -e BASE_URL=https://api-staging.construction-os.io

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const projectListDuration = new Trend('project_list_duration', true);

export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '6m', target: 200 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    errors: ['rate<0.001'],
    http_req_failed: ['rate<0.001'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TOKEN = __ENV.API_TOKEN || '';

const endpoints = [
  '/api/v1/projects',
  '/api/v1/projects?status=ACTIVE',
  '/api/v1/analytics/dashboard',
  '/health/live',
  '/health/ready',
];

export default function () {
  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  const res = http.get(`${BASE_URL}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'x-tenant-id': __ENV.TENANT_ID || 'test-tenant',
    },
  });

  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 1s': (r) => r.timings.duration < 1000,
  });

  errorRate.add(!ok);

  if (endpoint.includes('/projects') && !endpoint.includes('status')) {
    projectListDuration.add(res.timings.duration);
  }

  sleep(0.1);
}
