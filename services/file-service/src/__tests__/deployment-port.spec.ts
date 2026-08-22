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

  it('Helm chart probes the port the API listens on', () => {
    const values = readFileSync(chartValues, 'utf8');
    const port = defaultPort();

    // This chart deploys TWO workloads: the API, and the Temporal workers added for OQ-32, which
    // serve only a liveness endpoint on their own `workers.healthPort`. The assertion used to be
    // "every `port:` in values.yaml is the API port", which stopped being true the moment the second
    // Deployment landed — and the test has been red since, because the whole suite was never run.
    // Scope it to the API's own block instead of loosening it.
    const apiBlock = values.slice(0, values.indexOf('\nworkers:'));
    expect(apiBlock).not.toContain('healthPort');

    const probePorts = [...apiBlock.matchAll(/^\s+port:\s*(\d+)/gm)].map((m) => Number(m[1]));
    expect(probePorts.length).toBeGreaterThan(0);
    probePorts.forEach((p) => expect(p).toBe(port));

    // ...and the chart must pin it explicitly. NOTE the variable is FILE_SERVICE_PORT, not PORT.
    expect(values).toContain(`FILE_SERVICE_PORT: '${port}'`);
  });

  it('the worker Deployment probes the port its own entrypoint listens on', () => {
    const values = readFileSync(chartValues, 'utf8');
    const workerMain = readFileSync(join(__dirname, '..', 'workers', 'main.ts'), 'utf8');

    const workersBlock = values.slice(values.indexOf('\nworkers:'));
    const declared = /healthPort:\s*(\d+)/.exec(workersBlock);
    expect(declared).not.toBeNull();

    // Every probe in the workers block hits that port, and nothing else.
    const probePorts = [...workersBlock.matchAll(/^\s+port:\s*(\d+)/gm)].map((m) => Number(m[1]));
    expect(probePorts.length).toBeGreaterThan(0);
    probePorts.forEach((p) => expect(String(p)).toBe(declared![1]));

    // And the entrypoint defaults to it, so a chart that sets no WORKER_HEALTH_PORT still matches.
    expect(workerMain).toContain(`?? ${declared![1]}`);
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
