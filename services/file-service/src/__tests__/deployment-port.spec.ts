// Regression guard for the deployed-port contract.
//
// The bug this replaces: the Helm chart probed httpGet /health/live and /health/ready on port 3001
// (which is apps/web's port, not this service's) while nothing set FILE_SERVICE_PORT, so the
// service listened on its 3002 default and both probes hit a closed port — the pod could only
// CrashLoopBackOff. ADR-039 recorded exactly this class ("only a real deploy catches this, lint and
// dry-run do not") and listed cos-file-service's probes as UNVERIFIED.
//
// These tests read the real deployment artifacts, so the code default and the deployed port cannot
// drift apart again without CI going red.

import { readFileSync } from 'fs';
import { join } from 'path';

import { loadConfig } from '../config';

const repoRoot = join(__dirname, '..', '..', '..', '..');
const chartValues = join(repoRoot, 'infrastructure', 'helm', 'cos-file-service', 'values.yaml');
const dockerfile = join(__dirname, '..', '..', 'Dockerfile');
const compose = join(repoRoot, 'docker-compose.yml');

/** The port loadConfig falls back to when FILE_SERVICE_PORT is unset. */
function defaultPort(): number {
  const saved = process.env['FILE_SERVICE_PORT'];
  delete process.env['FILE_SERVICE_PORT'];
  process.env['DATABASE_URL'] = 'postgresql://cos:pass@localhost:6432/db';
  process.env['MINIO_ROOT_USER'] = 'test-key';
  process.env['MINIO_ROOT_PASSWORD'] = 'test-secret';
  try {
    return loadConfig().port;
  } finally {
    if (saved !== undefined) process.env['FILE_SERVICE_PORT'] = saved;
  }
}

describe('deployed port contract', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    Object.keys(process.env).forEach((k) => {
      if (!(k in ORIGINAL_ENV)) delete process.env[k];
    });
    Object.assign(process.env, ORIGINAL_ENV);
  });

  it('Dockerfile EXPOSEs the port the service defaults to', () => {
    expect(readFileSync(dockerfile, 'utf8')).toContain(`EXPOSE ${defaultPort()}`);
  });

  it('Helm chart probes the port the service listens on', () => {
    const values = readFileSync(chartValues, 'utf8');
    const port = defaultPort();

    // Every probe port must be the port the service actually listens on.
    const probePorts = [...values.matchAll(/^\s+port:\s*(\d+)/gm)].map((m) => Number(m[1]));
    expect(probePorts.length).toBeGreaterThan(0);
    probePorts.forEach((p) => expect(p).toBe(port));

    // ...and the chart must pin it explicitly. NOTE the variable is FILE_SERVICE_PORT, not PORT.
    expect(values).toContain(`FILE_SERVICE_PORT: '${port}'`);
  });

  it('Helm chart probes paths that main.ts actually serves', () => {
    const values = readFileSync(chartValues, 'utf8');
    const main = readFileSync(join(__dirname, '..', 'main.ts'), 'utf8');

    for (const path of [...values.matchAll(/path:\s*(\/\S+)/g)].map((m) => m[1])) {
      expect(main).toContain(`'${path}'`);
    }
  });

  it('docker-compose healthcheck uses the same port', () => {
    const svc = readFileSync(compose, 'utf8')
      .split(/^ {2}file-service:/m)[1]
      ?.split(/^ {2}\S/m)[0];
    expect(svc).toBeDefined();
    expect(svc).toContain(`FILE_SERVICE_PORT: '${defaultPort()}'`);
    expect(svc).toContain(`:${defaultPort()}/health/live`);
  });
});
