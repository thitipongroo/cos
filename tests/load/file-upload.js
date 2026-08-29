// k6 Load Test — Scenario 2: Concurrent File Uploads
// Source: spec §Phase 18 — "POST /api/v1/files/upload — 20 VUs, 5 MB file, 5 min"
// Pass criteria: P95 < 10s, error rate < 0.5%
// Run: k6 run tests/load/file-upload.js -e BASE_URL=https://api-staging.construction-os.io
//
// MERGED 2026-08-29 from scripts/loadtest/file-upload.js — see tests/load/dashboard-sla.js for why
// two divergent sets of these scripts existed.
//
// Taken from here:  the ramped profile and the `errors` Rate that counts a failed CHECK, so a 200
//                   carrying no file id is a failure rather than a success.
// Taken from there: building the 5 MB payload ONCE in setup() instead of per iteration, and a
//                   dedicated upload_duration_ms Trend.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
// Separate from http_req_duration: that includes connect and TLS, which for a 5 MB body is a
// meaningful share. This is the time the SERVICE took.
const uploadDuration = new Trend('upload_duration_ms', true);

export const options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '3m', target: 20 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<10000'],
    upload_duration_ms: ['p(95)<10000'],
    errors: ['rate<0.005'],
    http_req_failed: ['rate<0.005'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

function generatePdfPayload(sizeBytes = 5 * 1024 * 1024) {
  const header = '%PDF-1.4\n';
  const padding = 'x'.repeat(sizeBytes - header.length);
  return header + padding;
}

// Built once, before any VU starts, and handed to every iteration. Generating 5 MB inside the
// default function measured k6's own string building as though it were upload latency — at 20 VUs
// that is 100 MB of allocation per round, and it moves the P95 the threshold is judged on.
export function setup() {
  return { payload: generatePdfPayload() };
}

export default function (setupData) {
  const payload = setupData.payload;
  const data = {
    file: http.file(payload, `test-${__VU}-${__ITER}.pdf`, 'application/pdf'),
    project_id: __ENV.TEST_PROJECT_ID || '00000000-0000-0000-0000-000000000001',
  };

  const res = http.post(`${BASE_URL}/api/v1/files/upload`, data, {
    headers: {
      Authorization: `Bearer ${__ENV.API_TOKEN || ''}`,
      'x-tenant-id': __ENV.TENANT_ID || 'test-tenant',
    },
    timeout: '30s',
  });

  uploadDuration.add(res.timings.duration);

  const ok = check(res, {
    'status is 201': (r) => r.status === 201,
    'response time < 10s': (r) => r.timings.duration < 10000,
    'has file id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Boolean(body.id);
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!ok);
  sleep(1);
}
