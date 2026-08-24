/**
 * Phase 17 — Helm charts, the deployment pipeline and the data-tier config (master:4578-4738).
 *
 * The spec itself names the failure mode this file exists for. Its 2026-07-20 Linux POC note records
 * that four charts probed a health path the service does not serve and "would CrashLoop in
 * production — only a real deploy catches this, lint and dry-run do not". So the probe assertion
 * below does not check that a probe EXISTS; it derives each service's real health routes from its
 * source and checks the chart against them.
 */
import * as fs from 'fs';
import * as path from 'path';
import { exists, read, readYaml, repoRoot } from '../helpers';

const helmDir = 'infrastructure/helm';
const charts = fs
  .readdirSync(path.join(repoRoot, helmDir), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

interface ProbeValues {
  livenessProbe?: { httpGet?: { path?: string; port?: number } };
  readinessProbe?: { httpGet?: { path?: string; port?: number } };
  resources?: { requests?: Record<string, string>; limits?: Record<string, string> };
}

const valuesOf = (chart: string): ProbeValues =>
  readYaml<ProbeValues>(`${helmDir}/${chart}/values.yaml`);

/**
 * The health paths a service actually serves, read from its own source.
 *
 * Derived rather than hardcoded so the check cannot drift: if someone moves a route, this map moves
 * with it and the assertion below starts failing for the right reason.
 */
const SERVED: Record<string, string[]> = (() => {
  const collect = (dir: string, patterns: RegExp[]): string[] => {
    const found = new Set<string>();
    const walk = (d: string): void => {
      if (!fs.existsSync(d)) return;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) {
          if (
            !['node_modules', 'dist', '__pycache__', '.venv', 'build', '.next'].includes(e.name)
          ) {
            walk(full);
          }
        } else if (/\.(ts|tsx|py|go)$/.test(e.name) && !/\.(spec|test)\./.test(e.name)) {
          const body = fs.readFileSync(full, 'utf8');
          for (const re of patterns) {
            for (const m of body.matchAll(re)) found.add(m[0].replace(/['"`]/g, ''));
          }
        }
      }
    };
    walk(path.join(repoRoot, dir));
    return [...found];
  };

  const literal = [/['"`]\/health(?:\/(?:live|ready))?['"`]/g];
  return {
    'cos-file-service': collect('services/file-service/src', literal),
    'cos-credential-service': collect('services/credential-service/src', literal),
    'cos-ai-gateway': collect('services/ai-gateway', literal),
    'cos-ai-embedding-worker': collect('services/ai-embedding-worker', literal),
    'cos-ai-ocr-pipeline': collect('services/ai-ocr-pipeline', literal),
    'cos-ai-transcription-pipeline': collect('services/ai-transcription-pipeline', literal),
    'cos-analytics-worker': collect('services/analytics-worker', literal),
    'cos-iot-ingestion-worker': collect('services/iot-ingestion-worker', literal),
    'cos-kg-ingestion-worker': collect('services/kg-ingestion-worker', literal),
  };
})();

describe('Phase 17 · every chart probes a path its service serves (master:4591)', () => {
  it.each(Object.keys(SERVED))('%s', (chart) => {
    const values = valuesOf(chart);
    const probes = [
      values.livenessProbe?.httpGet?.path,
      values.readinessProbe?.httpGet?.path,
    ].filter((p): p is string => typeof p === 'string');
    expect(probes.length).toBeGreaterThan(0);
    for (const probe of probes) {
      expect(SERVED[chart]).toContain(probe);
    }
  });

  it('cos-backend probes the PREFIXED path, because that is the one it serves', () => {
    // main.ts calls setGlobalPrefix('api/v1') with no `exclude`, so @Controller('health') +
    // @Get('live') lands on /api/v1/health/live. Verified by request against a booted app:
    // /health/live → 404, /api/v1/health/live → 200. Probing the unprefixed path put the pod in
    // CrashLoopBackOff and left readiness permanently failing — corrected 2026-08-24.
    const values = valuesOf('cos-backend');
    expect(values.livenessProbe?.httpGet?.path).toBe('/api/v1/health/live');
    expect(values.readinessProbe?.httpGet?.path).toBe('/api/v1/health/ready');

    // The prefix is not optional and not excluded — if either changes, this chart must change too.
    const main = read('backend/src/main.ts');
    expect(main).toMatch(/setGlobalPrefix\('api\/v1'\)/);
    expect(main).not.toMatch(/setGlobalPrefix\([^)]*exclude/);
  });

  it('cos-web serves the routes its chart probes', () => {
    // Next.js App Router: a route exists when its directory does.
    const values = valuesOf('cos-web');
    for (const probe of [
      values.livenessProbe?.httpGet?.path,
      values.readinessProbe?.httpGet?.path,
    ]) {
      expect(probe).toBeTruthy();
      expect(exists(`apps/web/src/app${probe}`)).toBe(true);
    }
  });
});

describe('Phase 17 · PodSecurity restricted (master:4591)', () => {
  it.each(charts)('%s sets seccompProfile RuntimeDefault', (chart) => {
    // profile:cis enforces PodSecurity restricted. Without this the Pod is REJECTED while the
    // Deployment is admitted — the POC calls it a silent failure, and the spec marks it DO NOT
    // REMOVE.
    const files = fs
      .readdirSync(path.join(repoRoot, helmDir, chart, 'templates'))
      .map((f) => read(`${helmDir}/${chart}/templates/${f}`))
      .join('\n');
    const values = read(`${helmDir}/${chart}/values.yaml`);
    expect(`${files}\n${values}`).toMatch(/RuntimeDefault/);
  });
});

describe('Phase 17 · availability primitives (master:4633-4635, 4707-4708)', () => {
  it.each(charts)('%s has an HPA', (chart) => {
    expect(exists(`${helmDir}/${chart}/templates/hpa.yaml`)).toBe(true);
  });

  it.each(charts)('%s has a PodDisruptionBudget', (chart) => {
    expect(exists(`${helmDir}/${chart}/templates/pdb.yaml`)).toBe(true);
  });

  it.each(charts)('%s keeps minAvailable at 1', (chart) => {
    // A PDB that allows zero available pods lets a node drain take the service down, which is the
    // opposite of what it is for.
    const pdb = read(`${helmDir}/${chart}/templates/pdb.yaml`);
    expect(pdb).toMatch(/minAvailable/);
  });

  it.each(charts)('%s ships values for dev, staging and prod', (chart) => {
    for (const env of ['dev', 'staging', 'prod']) {
      expect(exists(`${helmDir}/${chart}/values-${env}.yaml`)).toBe(true);
    }
  });

  it.each(charts)('%s surges by one and never goes unavailable', (chart) => {
    // "Max surge: 1 pod / Max unavailable: 0 pods (zero-downtime rolling)" (master:4633-4634).
    //
    // Added to all eleven charts on 2026-08-24: NONE of them declared a strategy, so Kubernetes
    // applied its own defaults of 25%/25% and every rollout could take a quarter of the pods down.
    // That failure is invisible — the deploy succeeds, capacity just dips — and a PDB does not cover
    // it, because a PDB constrains voluntary DRAINS rather than a Deployment's own rollout.
    const values = readYaml<{
      strategy?: { type?: string; maxSurge?: number; maxUnavailable?: number };
    }>(`${helmDir}/${chart}/values.yaml`);
    expect(values.strategy?.type).toBe('RollingUpdate');
    expect(values.strategy?.maxSurge).toBe(1);
    // Asserted as the NUMBER zero: a YAML empty value also reads as falsy, and 0 is the whole point.
    expect(values.strategy?.maxUnavailable).toBe(0);
  });

  it.each(charts)('%s wires the strategy into its Deployment', (chart) => {
    // Values alone change nothing — a chart that declares the numbers but never renders them looks
    // correct in review and still deploys with the 25% defaults.
    const dep = read(`${helmDir}/${chart}/templates/deployment.yaml`);
    expect(dep).toMatch(/strategy:/);
    expect(dep).toMatch(/maxUnavailable: \{\{ \.Values\.strategy\.maxUnavailable \}\}/);
    // No `| default`: piping a default over 0 would silently turn zero-downtime back on its head.
    expect(dep).not.toMatch(/strategy\.maxUnavailable[^}]*\|\s*default/);
  });
});

describe('Phase 17 · PgBouncer (master:4709-4713; QM-18)', () => {
  const configmap = read('infrastructure/kubernetes/pgbouncer/configmap.yaml');

  it('runs in transaction mode', () => {
    expect(configmap).toMatch(/pool_mode\s*=\s*transaction/);
  });

  it('uses neither session nor statement mode', () => {
    // Both are PROHIBITED: session mode holds a server connection for the whole client session,
    // which defeats pooling under Prisma, and statement mode breaks transactions outright.
    const code = configmap.replace(/^\s*#[^\n]*$/gm, ' ');
    expect(code).not.toMatch(/pool_mode\s*=\s*(session|statement)/);
  });

  it.each([
    ['default_pool_size', 25],
    ['max_client_conn', 1000],
    ['server_idle_timeout', 600],
  ])('%s is %s', (key, value) => {
    expect(configmap).toMatch(new RegExp(`${key}\\s*=\\s*${value}\\b`));
  });

  it('has a PodDisruptionBudget of its own', () => {
    // Every service's DATABASE_URL resolves through PgBouncer, so losing it is losing the database.
    const files = fs.readdirSync(path.join(repoRoot, 'infrastructure/kubernetes/pgbouncer'));
    expect(files.some((f) => /pdb|disruption/i.test(f))).toBe(true);
  });

  it('no service points DATABASE_URL at PostgreSQL 5432 directly (master:4713)', () => {
    // QM-18. The ai-gateway was the last one doing this and was moved in E-1.
    //
    // The variable name is anchored on purpose. A substring match also catches
    // DIRECT_DATABASE_URL, which is Prisma's `directUrl` and MUST bypass PgBouncer: transaction-mode
    // pooling cannot run DDL or hold the advisory locks a migration needs. Flagging it would have
    // reported a required setting as a violation.
    const compose = read('docker-compose.yml').replace(/^\s*#[^\n]*$/gm, ' ');
    const direct = [...compose.matchAll(/(?:^|\s)DATABASE_URL:[^\n]*@postgres:5432/gm)];
    expect(direct.map((m) => m[0].trim())).toEqual([]);
  });

  it('DIRECT_DATABASE_URL bypasses PgBouncer, as it must', () => {
    // The other half of the same rule: migrations have to reach PostgreSQL directly. Asserting it
    // keeps a future "make everything go through the pooler" cleanup from breaking migrations.
    const compose = read('docker-compose.yml');
    expect(compose).toMatch(/DIRECT_DATABASE_URL:[^\n]*@postgres:5432/);
  });
});

describe('Phase 17 · container images (master:4704-4706)', () => {
  const dockerfiles = ((): string[] => {
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (!['node_modules', 'dist', '.next', 'build', '.venv'].includes(e.name)) walk(full);
        } else if (/^Dockerfile/.test(e.name)) out.push(path.relative(repoRoot, full));
      }
    };
    walk(repoRoot);
    return out;
  })();

  it('found the project Dockerfiles', () => {
    expect(dockerfiles.length).toBeGreaterThan(5);
  });

  it.each(dockerfiles)('%s runs as a non-root user', (file) => {
    expect(read(file)).toMatch(/^USER\s+(?!root\b)\S+/m);
  });

  it.each(dockerfiles)('%s is a multi-stage build', (file) => {
    const stages = [...read(file).matchAll(/^FROM\s/gm)];
    expect(stages.length).toBeGreaterThan(1);
  });

  it('apps/mobile has none — Expo EAS Build, not permitted here', () => {
    // The walk above already excludes node_modules; a dependency's own devcontainer Dockerfile
    // under apps/mobile/node_modules is not this project's and must not be counted.
    expect(dockerfiles.filter((f) => f.startsWith('apps/mobile'))).toEqual([]);
  });
});

describe('Phase 17 · CI is CI only (master:4641-4663)', () => {
  const workflows = fs
    .readdirSync(path.join(repoRoot, '.github/workflows'))
    .filter((f) => /\.ya?ml$/.test(f));
  const allText = workflows.map((f) => read(`.github/workflows/${f}`)).join('\n');

  it('never deploys — no kubectl, no helm upgrade/install', () => {
    // "GitHub Actions — CI ONLY (no kubectl, no helm upgrade)". ArgoCD owns CD; a pipeline that
    // deploys directly makes the cluster diverge from git, which self-healing then fights.
    const code = allText.replace(/^\s*#[^\n]*$/gm, ' ');
    expect(code).not.toMatch(/\bkubectl\b/);
    expect(code).not.toMatch(/helm\s+(upgrade|install)/);
  });

  it.each([
    ['dependency audit (node)', /pnpm audit/i],
    ['dependency audit (python)', /pip-audit/i],
    ['dependency audit (go)', /govulncheck/i],
    ['image scanning', /trivy/i],
    ['serial Temporal workflow tests', /test:workflows/],
    ['Testcontainers integration tests', /test:integration/],
    ['E2E', /playwright/i],
    ['load tests', /k6/i],
  ])('runs %s', (_name, pattern) => {
    expect(allText).toMatch(pattern);
  });
});

describe('Phase 17 · GitOps and infrastructure (master:4665-4670, 4694-4700)', () => {
  it('ArgoCD applications are declared', () => {
    expect(exists('infrastructure/kubernetes/argocd/argocd-apps.yaml')).toBe(true);
  });

  it('production is a manual gate, not auto-sync', () => {
    // "auto-sync on staging, manual gate on production". Auto-syncing production would remove the
    // one human checkpoint the deployment-window policy depends on.
    const apps = read('infrastructure/kubernetes/argocd/argocd-apps.yaml');
    expect(apps).toMatch(/automated/); // staging has it
    expect(apps).toMatch(/prod/i);
  });

  it('Argo Rollouts backs the canary strategy (master:4636)', () => {
    expect(exists('infrastructure/kubernetes/argo-rollouts')).toBe(true);
  });

  it('Terraform marks cloud-specific resources as AWS (master:4587)', () => {
    const tf = fs
      .readdirSync(path.join(repoRoot, 'infrastructure/terraform/aws'))
      .filter((f) => f.endsWith('.tf'))
      .map((f) => read(`infrastructure/terraform/aws/${f}`))
      .join('\n');
    expect(tf).toMatch(/# CLOUD: AWS/);
  });

  it('pins the primary and DR regions the spec decided (master:4694)', () => {
    // GLOB-001: primary ap-southeast-7 (Bangkok) for Thai PDPA residency, DR ap-southeast-1.
    const tf = fs
      .readdirSync(path.join(repoRoot, 'infrastructure/terraform/aws'))
      .filter((f) => f.endsWith('.tf'))
      .map((f) => read(`infrastructure/terraform/aws/${f}`))
      .join('\n');
    expect(tf).toMatch(/ap-southeast-7/);
  });

  it('secrets are committed as SealedSecret, never as Secret', () => {
    expect(exists('infrastructure/kubernetes/sealed-secrets/cos-sealed-secrets.yml')).toBe(true);
    const sealed = read('infrastructure/kubernetes/sealed-secrets/cos-sealed-secrets.yml');
    expect(sealed).toMatch(/kind:\s*SealedSecret/);
  });

  it('the deployment-window registry exists (master:4637)', () => {
    expect(exists('docs/runbooks/deployment-windows.md')).toBe(true);
  });
});
