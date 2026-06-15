// k6 Load Test — Scenario 2: File Upload
// Source: spec §Phase 18 k6 scenario 2
//   Target: POST /api/v1/files/upload — 20 VUs, 5 MB file, 5 min
//   Pass criteria: P95 < 10s, error rate < 0.5%
//   Rate limit: 20 req/min/user (QM-7; spec §05 §5.5) — sleep enforces this
//
// Run: k6 run scripts/loadtest/file-upload.js \
//        -e BASE_URL=https://api-staging.construction-os.io \
//        -e AUTH_TOKEN=<bearer-token> \
//        -e TENANT_ID=<uuid>

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const uploadErrorRate = new Rate('upload_errors');
const uploadDuration = new Trend('upload_duration_ms', true);

export const options = {
  scenarios: {
    file_upload: {
      executor: 'constant-vus',
      vus: 20,
      duration: '5m',
    },
  },
  thresholds: {
    // Pass criteria: P95 < 10s, error rate < 0.5%
    'http_req_duration{scenario:file_upload}': ['p(95)<10000'],
    upload_errors: ['rate<0.005'],
    http_req_failed: ['rate<0.005'],
    upload_duration_ms: ['p(95)<10000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token';
const TENANT_ID = __ENV.TENANT_ID || 'test-tenant-id';
const FILE_SIZE_BYTES = 5 * 1024 * 1024;

function generateFiveKbMultipartChunk() {
  const chunkSize = 1024;
  return new Array(chunkSize).fill('A').join('');
}

function buildMultipartBody() {
  const chunks = [];
  const totalChunks = FILE_SIZE_BYTES / 1024;
  for (let i = 0; i < totalChunks; i++) {
    chunks.push(generateFiveKbMultipartChunk());
  }
  return chunks.join('');
}

export function setup() {
  return { fileContent: buildMultipartBody() };
}

export default function (data) {
  const fileName = `load-test-${__VU}-${__ITER}.jpg`;

  const payload = {
    file: http.file(data.fileContent, fileName, 'image/jpeg'),
    entity_type: 'site_report',
    entity_id: `load-test-entity-${__VU}`,
  };

  const headers = {
    Authorization: `Bearer ${AUTH_TOKEN}`,
    'X-Tenant-ID': TENANT_ID,
    'X-Request-ID': `lt-upload-${__VU}-${__ITER}-${Date.now()}`,
  };

  const startTime = Date.now();
  const res = http.post(`${BASE_URL}/api/v1/files/upload`, payload, {
    headers,
    timeout: '30s',
  });
  const elapsed = Date.now() - startTime;

  uploadDuration.add(elapsed);

  const ok = check(res, {
    'upload status 201 or 200': (r) => r.status === 201 || r.status === 200,
    'response has file_id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Boolean(body.data?.id || body.id || body.file_id);
      } catch {
        return false;
      }
    },
    'response time < 10s': (r) => r.timings.duration < 10_000,
    'no rate limit hit': (r) => r.status !== 429,
  });

  uploadErrorRate.add(!ok);

  // 20 req/min rate limit → 3 seconds per request minimum (QM-7)
  // Sleep 3s to stay within the 20 req/min/user limit
  sleep(3);
}
