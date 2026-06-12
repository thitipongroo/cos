#!/usr/bin/env node
// Tenant isolation synthetic probe — spec §30.6
// Runs 5 checks using tenant_fixture_a credentials against tenant_fixture_b resources
// Pushes results to Prometheus Pushgateway as:
//   tenant_isolation_check_result{check_name="..."} 1 (pass) | 0 (fail)
// A zero value triggers TenantIsolationBreach alert (§31.7)

'use strict';

import https from 'https';
import http from 'http';

const API_BASE_URL = process.env.API_BASE_URL;
const TENANT_A_JWT = process.env.TENANT_A_JWT; // fixture_a credentials
const TENANT_B_ID = process.env.TENANT_B_ID; // fixture_b tenant ID to probe
const PUSHGATEWAY_URL =
  process.env.PUSHGATEWAY_URL || 'http://prometheus-pushgateway.monitoring.svc.cluster.local:9091';

if (!API_BASE_URL || !TENANT_A_JWT || !TENANT_B_ID) {
  console.error('Missing required env vars: API_BASE_URL, TENANT_A_JWT, TENANT_B_ID');
  process.exit(1);
}

// Minimal HTTP helper — returns { status, body }
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, { timeout: 8000, ...options }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    if (options.body) req.write(options.body);
    req.end();
  });
}

// Each check returns { name, pass, reason }
const checks = [
  {
    name: 'postgresql',
    description: 'Tenant A JWT cannot read Tenant B DB records via API',
    async run() {
      const url = `${API_BASE_URL}/api/v1/projects?tenantId=${TENANT_B_ID}`;
      const { status } = await request(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${TENANT_A_JWT}`, 'Content-Type': 'application/json' },
      });
      const pass = status === 403 || status === 404;
      return { pass, reason: `expected 403/404, got ${status}` };
    },
  },
  {
    name: 'neo4j',
    description: 'Tenant A cannot traverse into Tenant B knowledge graph',
    async run() {
      const url = `${API_BASE_URL}/api/v1/knowledge-graph/nodes?tenantId=${TENANT_B_ID}`;
      const { status } = await request(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${TENANT_A_JWT}` },
      });
      const pass = status === 403 || status === 404;
      return { pass, reason: `expected 403/404, got ${status}` };
    },
  },
  {
    name: 'kafka',
    description: 'Tenant A cannot consume events published to Tenant B topics',
    async run() {
      // Probe via the backend event replay/audit endpoint; cross-tenant access must return 403
      const url = `${API_BASE_URL}/api/v1/events?tenantId=${TENANT_B_ID}&limit=1`;
      const { status } = await request(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${TENANT_A_JWT}` },
      });
      const pass = status === 403 || status === 404;
      return { pass, reason: `expected 403/404, got ${status}` };
    },
  },
  {
    name: 's3',
    description: 'Tenant A pre-signed URL cannot access Tenant B files',
    async run() {
      // Request a pre-signed URL for a known Tenant B file path; must be rejected
      const url = `${API_BASE_URL}/api/v1/files/presign?tenantId=${TENANT_B_ID}&key=probe-sentinel.txt`;
      const { status } = await request(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${TENANT_A_JWT}` },
      });
      const pass = status === 403 || status === 404;
      return { pass, reason: `expected 403/404, got ${status}` };
    },
  },
  {
    name: 'api',
    description: 'Tenant A JWT cannot access Tenant B API resources',
    async run() {
      const url = `${API_BASE_URL}/api/v1/settings?tenantId=${TENANT_B_ID}`;
      const { status } = await request(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${TENANT_A_JWT}` },
      });
      const pass = status === 403 || status === 404;
      return { pass, reason: `expected 403/404, got ${status}` };
    },
  },
];

async function pushMetrics(results) {
  const lines = results.map(
    ({ name, pass }) => `tenant_isolation_check_result{check_name="${name}"} ${pass ? 1 : 0}`,
  );
  const body = lines.join('\n') + '\n';
  const pushUrl = `${PUSHGATEWAY_URL}/metrics/job/tenant-isolation-probe`;
  await request(pushUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(body) },
    body,
  });
}

async function main() {
  const results = [];
  let anyFail = false;

  for (const check of checks) {
    let result;
    try {
      const { pass, reason } = await check.run();
      result = { name: check.name, pass, reason: pass ? 'ok' : reason };
    } catch (err) {
      result = { name: check.name, pass: false, reason: String(err.message) };
    }
    console.log(`[${result.pass ? 'PASS' : 'FAIL'}] ${check.name}: ${result.reason}`);
    results.push(result);
    if (!result.pass) anyFail = true;
  }

  try {
    await pushMetrics(results);
    console.log(`Metrics pushed to Pushgateway`);
  } catch (err) {
    console.error(`Failed to push metrics: ${err.message}`);
    // Do not exit 1 on pushgateway failure alone — the checks ran; alerting infra issue
  }

  if (anyFail) {
    console.error('One or more isolation checks FAILED — TenantIsolationBreach should alert');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Probe error:', err);
  process.exit(1);
});
