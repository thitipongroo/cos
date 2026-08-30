// k6 Load Test — Scenario 1: Dashboard SLA Validation
// Source: spec §Phase 18 — "GET /api/v1/analytics/executive — 100 VUs, 5 min"
// Pass criteria: P95 < 3s, error rate < 0.1%
// Run: k6 run tests/load/dashboard-sla.js -e BASE_URL=https://api-staging.construction-os.io
//
// MERGED 2026-08-29 from scripts/loadtest/analytics-sla.js, which had been a second, divergent copy
// of this scenario. The repository carried two sets of k6 scripts: this directory, which the
// conformance suite asserted against and CI never ran, and scripts/loadtest/, which CI ran one file
// from and no test ever read. Each set had something the other lacked, and neither was wrong on its
// own — which is exactly why nothing surfaced the split.
//
// Taken from here:   the load profile the spec fixes (ramp to 100 VUs over five minutes), the
//                    0.1% error budget, and the `errors` Rate that counts a failed CHECK, not only
//                    a failed HTTP status — a 200 carrying an error body is still a failure.
// Taken from there:  all five analytics endpoints rather than the executive one alone, per-endpoint
//                    tags, and the two-budget thresholds master:4288-4289 sets (executive 3s, PM 2s).

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  // Five minutes in total, as the spec states, ramped rather than flat: a cold ClickHouse answering
  // its first query at 100 VUs measures the cache miss, not the SLA.
  stages: [
    { duration: '1m', target: 30 },
    { duration: '3m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    // master:4288-4289 states TWO budgets. The global one stays at the LOOSER of them because it
    // spans every endpoint here; tightening it to 2s would fail a run for an executive dashboard
    // that is inside spec.
    http_req_duration: ['p(95)<3000'],
    'http_req_duration{endpoint:executive}': ['p(95)<3000'],
    // PM at 2s, and the three trend endpoints with it: they back the PM dashboard's charts
    // (master:4352-4356), so a 2.9s trend query makes a 2s PM dashboard impossible however fast the
    // page's own query is.
    'http_req_duration{endpoint:pm}': ['p(95)<2000'],
    'http_req_duration{endpoint:cost-trend}': ['p(95)<2000'],
    'http_req_duration{endpoint:procurement-trend}': ['p(95)<2000'],
    'http_req_duration{endpoint:site-trend}': ['p(95)<2000'],
    // 0.1% per the spec's pass criteria. `errors` is the stricter of the two: http_req_failed counts
    // transport failures, this counts a response that arrived and was wrong.
    errors: ['rate<0.001'],
    http_req_failed: ['rate<0.001'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TENANT_ID = __ENV.TENANT_ID || 'test-tenant';
const PROJECT_ID = __ENV.PROJECT_ID || '00000000-0000-0000-0000-000000000001';
const DATE_RANGE = __ENV.DATE_RANGE || '30d';

const headers = {
  Authorization: `Bearer ${__ENV.API_TOKEN || ''}`,
  'x-tenant-id': TENANT_ID,
};

const qs = `tenantId=${TENANT_ID}&dateRange=${DATE_RANGE}`;

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

export default function () {
  // One endpoint per iteration, chosen at random, so load spreads across all five rather than
  // measuring five sequential requests as one slow user.
  const ep = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
  const res = http.get(ep.url, { headers, tags: ep.tags });

  const ok = check(res, {
    [`${ep.name}: status is 200`]: (r) => r.status === 200,
    [`${ep.name}: body parses`]: (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!ok);
  sleep(0.5);
}
