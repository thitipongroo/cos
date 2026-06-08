// k6 load test — Phase 14 Analytics SLA
// Spec §14 / §30: P95 response time < 3 000 ms under 100 concurrent virtual users.
//
// Run:
//   BASE_URL=http://localhost:3000 TENANT_ID=<uuid> PROJECT_ID=<uuid> AUTH_TOKEN=<jwt> \
//     k6 run scripts/loadtest/analytics-sla.js
//
// Success criteria (hardcoded as k6 thresholds):
//   - http_req_duration{p(95)} < 3000 ms  (SLA)
//   - http_req_failed rate < 1%

import http from 'k6/http';
import { check, sleep } from 'k6';

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TENANT_ID = __ENV.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001';
const PROJECT_ID = __ENV.PROJECT_ID || 'bbbbbbbb-0000-0000-0000-000000000002';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token';
const DATE_RANGE = __ENV.DATE_RANGE || '2026-01-01,2026-06-30';

export const options = {
  // 100 concurrent VUs; ramp up in 30 s, hold for 90 s, ramp down in 30 s
  stages: [
    { duration: '30s', target: 100 },
    { duration: '90s', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    // SLA: P95 < 3 000 ms across ALL analytics endpoints
    http_req_duration: ['p(95)<3000'],
    // Per-endpoint P95 thresholds
    'http_req_duration{endpoint:executive}': ['p(95)<3000'],
    'http_req_duration{endpoint:pm}': ['p(95)<3000'],
    'http_req_duration{endpoint:cost-trend}': ['p(95)<3000'],
    'http_req_duration{endpoint:procurement-trend}': ['p(95)<3000'],
    'http_req_duration{endpoint:site-trend}': ['p(95)<3000'],
    // Error rate < 1%
    http_req_failed: ['rate<0.01'],
  },
};

const headers = {
  Authorization: `Bearer ${AUTH_TOKEN}`,
  'Content-Type': 'application/json',
};

const qs = `tenantId=${TENANT_ID}&dateRange=${DATE_RANGE}`;

// ── Endpoints ─────────────────────────────────────────────────────────────────

const ENDPOINTS = [
  {
    name: 'executive',
    url: `${BASE_URL}/api/v1/analytics/executive?${qs}&projectIds[]=${PROJECT_ID}`,
    tags: { endpoint: 'executive' },
  },
  {
    name: 'pm',
    url: `${BASE_URL}/api/v1/analytics/pm/${PROJECT_ID}?${qs}`,
    tags: { endpoint: 'pm' },
  },
  {
    name: 'cost-trend',
    url: `${BASE_URL}/api/v1/analytics/projects/${PROJECT_ID}/cost-trend?${qs}`,
    tags: { endpoint: 'cost-trend' },
  },
  {
    name: 'procurement-trend',
    url: `${BASE_URL}/api/v1/analytics/projects/${PROJECT_ID}/procurement-trend?${qs}`,
    tags: { endpoint: 'procurement-trend' },
  },
  {
    name: 'site-trend',
    url: `${BASE_URL}/api/v1/analytics/projects/${PROJECT_ID}/site-trend?${qs}`,
    tags: { endpoint: 'site-trend' },
  },
];

// ── Default function ──────────────────────────────────────────────────────────

export default function () {
  // Pick one endpoint at random each iteration to spread load across all 5
  const ep = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];

  const res = http.get(ep.url, { headers, tags: ep.tags });

  check(res, {
    [`${ep.name}: status 200`]: (r) => r.status === 200,
    [`${ep.name}: body is array`]: (r) => {
      try {
        return Array.isArray(JSON.parse(r.body));
      } catch {
        return false;
      }
    },
  });

  sleep(0.1); // 100 ms think time between requests per VU
}
