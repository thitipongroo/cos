// k6 Load Test — Scenario 4: AI Report Generation
// Source: spec §Phase 18 — "POST /api/v1/ai/reports/site-summary — 10 VUs, 5 min"
// Pass criteria: P95 < 15s (AI calls are slow), error rate < 1%
// Run: k6 run tests/load/ai-report.js -e BASE_URL=https://api-staging.construction-os.io

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const aiLatency = new Trend('ai_report_latency', true);

export const options = {
  stages: [
    { duration: '1m', target: 5 },
    { duration: '3m', target: 10 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<15000'],
    errors: ['rate<0.01'],
    http_req_failed: ['rate<0.01'],
    ai_report_latency: ['p(95)<15000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const payload = JSON.stringify({
    project_id: __ENV.TEST_PROJECT_ID || '00000000-0000-0000-0000-000000000001',
    report_type: 'site-summary',
    date_range: {
      from: new Date(Date.now() - 7 * 86400 * 1000).toISOString(),
      to: new Date().toISOString(),
    },
  });

  const res = http.post(`${BASE_URL}/api/v1/ai/reports/site-summary`, payload, {
    headers: {
      Authorization: `Bearer ${__ENV.API_TOKEN || ''}`,
      'Content-Type': 'application/json',
      'x-tenant-id': __ENV.TENANT_ID || 'test-tenant',
    },
    timeout: '30s',
  });

  aiLatency.add(res.timings.duration);

  const ok = check(res, {
    'status is 200 or 202': (r) => r.status === 200 || r.status === 202,
    'response time < 15s': (r) => r.timings.duration < 15000,
  });

  errorRate.add(!ok);
  sleep(2);
}
