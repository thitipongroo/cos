// k6 Load Test — Scenario 3: API Gateway Throughput
// Source: spec §Phase 18 — "mixed read endpoints — 200 VUs, 10 min"
// Pass criteria: P95 < 1s, error rate < 0.1%
// Run: k6 run tests/load/api-baseline.js -e BASE_URL=https://api-staging.construction-os.io
//
// MERGED 2026-08-29 from scripts/loadtest/mixed-api.js — see tests/load/dashboard-sla.js for why two
// divergent sets of these scripts existed.
//
// Taken from here:  the spec's load profile (ramp to 200 VUs over ten minutes), the 0.1% budget, and
//                   the `errors` Rate counting failed checks rather than transport failures alone.
// Taken from there: the endpoints. "Mixed read endpoints" was three routes and two health probes,
//                   and a health probe is not a read of the estate — it answers from memory and
//                   drags the P95 DOWN, so a third of the sample was flattering the number.
//                   Procurement, BOQ and site reports are the reads a working day is made of.

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

// Reads only, and reads that touch the database. The health probes that used to be in this list
// were removed: /health/live answers from memory in single-digit milliseconds, so including it in a
// P95 over "mixed read endpoints" measures how many probes are in the mix as much as how fast the
// API is. They belong in a smoke test, and they are still in the ArgoCD PostSync one.
const endpoints = [
  '/api/v1/projects',
  '/api/v1/projects?status=ACTIVE',
  '/api/v1/analytics/dashboard',
  '/api/v1/procurement/purchase-requests',
  '/api/v1/boq',
  '/api/v1/site-ops/reports',
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
