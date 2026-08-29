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

/**
 * Cluster capacity settings the spec fixes but nothing read (master:4649, 4655).
 *
 * Both values are correct on disk and were never asserted, which is the same shape as the OTel
 * sampling overlays: a number in a manifest that no test opens drifts the moment someone tunes it
 * for a single incident and never puts it back.
 */
describe('Phase 17 · cluster capacity settings (master:4649, 4655)', () => {
  const autoscaler = read('infrastructure/kubernetes/autoscaler/cluster-autoscaler.yaml');
  const tfVars = read('infrastructure/terraform/aws/variables.tf');

  it('the Cluster Autoscaler waits 10 minutes before scaling down (master:4655)', () => {
    // Two separate flags, and BOTH are needed. `scale-down-unneeded-time` is how long a node must
    // look idle; `scale-down-delay-after-add` stops the autoscaler removing a node it has just
    // added. With only the first, a scale-up during a burst can be undone minutes later and the
    // cluster oscillates — the behaviour the cooldown exists to prevent.
    expect(autoscaler).toContain('--scale-down-unneeded-time=10m');
    expect(autoscaler).toContain('--scale-down-delay-after-add=10m');
  });

  it('pins Kubernetes at or below 1.34 while CIS compliance is required (master:4649)', () => {
    // master:4649 — "Pin K8s <= 1.34 while CIS is required (kube-bench cis-1.12 covers 1.32-1.34
    // only)". Above 1.34 there is no benchmark to run, so a CIS self-assessment stops being
    // producible — and a version bump is the most ordinary change imaginable.
    const version = /variable "cluster_version"[\s\S]*?default\s*=\s*"([\d.]+)"/.exec(tfVars)?.[1];
    expect(version).toBeDefined();
    const [major, minor] = version!.split('.').map(Number);
    expect(major).toBe(1);
    expect(minor).toBeLessThanOrEqual(34);
  });
});

/**
 * Node pools (master:4650-4654).
 *
 * The spec names four; three are built and analytics-pool is deliberately not — master carries the
 * reason beside the pool list. Before 2026-08-29 there was one undifferentiated group on t3.large,
 * an instance type in none of the four, and no test looked at it. That is the whole reason a spec
 * written in four parts survived so long implemented as one.
 */
describe('Phase 17 · EKS node pools (master:4650-4654)', () => {
  const eks = read('infrastructure/terraform/aws/modules/eks/main.tf');

  const POOLS: ReadonlyArray<[string, string, number, number]> = [
    ['system', 't3.medium', 2, 2],
    ['app', 't3.xlarge', 3, 10],
    ['ai', 't3.2xlarge', 1, 4],
  ];

  const poolBlock = (name: string): string => {
    const at = eks.indexOf(`${name} = {`);
    expect(at).toBeGreaterThan(-1);
    return eks.slice(at, eks.indexOf('}', eks.indexOf('taints', at)) + 1);
  };

  it.each(POOLS)('%s runs %s sized min %i max %i', (name, instance, min, max) => {
    const block = poolBlock(name as string);
    expect(block).toContain(instance as string);
    expect(block).toMatch(new RegExp(`min_size\\s*=\\s*${min}\\b`));
    expect(block).toMatch(new RegExp(`max_size\\s*=\\s*${max}\\b`));
  });

  it('the pools are separate node groups, not one shared min/max', () => {
    // The regression this replaces: a single aws_eks_node_group with node_min_size/node_max_size
    // variables shared by everything. Those variables no longer exist anywhere.
    expect(eks).toContain('for_each = local.node_groups');
    const tf = ['modules/eks/main.tf', 'modules/eks/variables.tf', 'main.tf', 'variables.tf']
      .map((f) => read(`infrastructure/terraform/aws/${f}`))
      .join('\n');
    expect(tf).not.toMatch(/node_min_size|node_max_size|node_instance_types/);
  });

  it('only the ai pool is tainted', () => {
    // Tainting app would strand every chart that has not opted in; leaving ai untainted lets
    // ordinary web pods pack onto the instances the AI services are sized for, which is the cost
    // problem the pool exists to solve.
    expect(poolBlock('ai')).toContain('NO_SCHEDULE');
    expect(poolBlock('app')).toMatch(/taints\s*=\s*\[\]/);
    expect(poolBlock('system')).toMatch(/taints\s*=\s*\[\]/);
  });

  it('every pool is labelled so the charts can select it', () => {
    expect(eks).toMatch(/workload\s*=\s*each\.key/);
  });

  it('analytics-pool is absent, and master records why', () => {
    // An ABSENCE with a reason. If ClickHouse ever gets a chart this fails, and the pool has to be
    // added in that same change rather than remembered later.
    // Comments are stripped first: the block above explains the deferral and NAMES r5.xlarge, so a
    // raw search matches the prose that documents the absence and reports it as presence.
    const code = eks.replace(/#[^\n]*/g, ' ');
    expect(code).not.toContain('r5.xlarge');
    expect(code).not.toContain('analytics');
    expect(exists('infrastructure/helm/cos-clickhouse')).toBe(false);
  });
});

describe('Phase 17 · charts are pinned to the pool they are sized for (master:4650-4654)', () => {
  const AI_CHARTS = [
    'cos-ai-gateway',
    'cos-ai-embedding-worker',
    'cos-ai-ocr-pipeline',
    'cos-ai-transcription-pipeline',
  ];

  const values = (chart: string): string => read(`${helmDir}/${chart}/values.yaml`);

  it.each(charts)('%s requires a node pool rather than preferring one', (chart) => {
    // requiredDuringScheduling, never preferred: a preferred rule falls back to any node the moment
    // the pool is full, and the pod then runs — slowly, on the wrong hardware, reporting nothing.
    const v = values(chart);
    expect(`${chart}:${v}`).toContain('nodeAffinity');
    expect(`${chart}:${v}`).toContain('requiredDuringSchedulingIgnoredDuringExecution');
  });

  it.each(charts)('%s selects the pool that matches what it is', (chart) => {
    const expected = AI_CHARTS.includes(chart) ? 'ai' : 'app';
    const v = values(chart);
    const at = v.indexOf('nodeAffinity');
    expect(`${chart}:${v.slice(at, at + 400)}`).toContain(`values: ['${expected}']`);
  });

  it.each(AI_CHARTS)('%s tolerates the ai taint', (chart) => {
    // Without the toleration the taint keeps this pod OFF the very pool its nodeAffinity requires,
    // and it stays Pending forever — the two halves only work as a pair.
    const v = values(chart);
    expect(`${chart}:${v}`).toContain('value: ai');
    expect(`${chart}:${v}`).toContain('effect: NoSchedule');
  });

  it.each(charts.filter((c) => !AI_CHARTS.includes(c)))(
    '%s does NOT tolerate the ai taint',
    (chart) => {
      // The control. A blanket toleration everywhere would re-open the packing problem while every
      // case above still passed.
      expect(`${chart}:${values(chart)}`).not.toContain('value: ai');
    },
  );
});

/**
 * CI checks the infrastructure code, not only the application code.
 *
 * Two separate gaps, found on 2026-08-29 while auditing Phase 17 and closed together:
 *
 *   1. NOTHING ran terraform. 26 .tf files across three root modules had never been through `fmt`
 *      or `validate` in CI — and the node-pool rewrite in that same audit landed unvalidated,
 *      which is how the gap made itself obvious.
 *   2. Trivy ran `scan-type: fs` without naming `scanners:`, so it used the fs default of
 *      vuln,secret. Misconfiguration detection is off by default in that subcommand, so the IaC in
 *      a repository that is mostly IaC was never scanned by anything.
 *
 * The second is the more instructive: the job was NAMED "Security Scan (Trivy)", it ran on every
 * PR, and it was green — which reads as coverage. Nothing about the configuration announced which
 * scanners it had left off.
 */
describe('Phase 17 · CI validates the infrastructure code (master:4699-4721)', () => {
  const ci = read('.github/workflows/ci.yml');

  it('runs terraform fmt across the whole tree', () => {
    expect(ci).toMatch(/terraform fmt -check -recursive infrastructure\/terraform/);
  });

  it('validates every root module, not just the AWS one', () => {
    // A module is only type-checked as part of a root; validating one root leaves the other's
    // providers and references unchecked.
    expect(ci).toContain('infrastructure/terraform/aws infrastructure/terraform/cloudflare');
    expect(ci).toMatch(/terraform -chdir="\$dir" validate/);
  });

  it('initialises without a backend, so CI needs no cloud credentials', () => {
    // infrastructure/terraform/cloudflare declares a `backend "s3"`. Without -backend=false, init
    // reaches for a real bucket and the job needs credentials it must not have.
    expect(ci).toMatch(/init -backend=false/);
  });

  it('pins the terraform version rather than floating on latest', () => {
    // A validate that silently moves to a new major is a gate whose meaning changes without a diff.
    expect(ci).toMatch(/terraform_version: '\d+\.\d+\.\d+'/);
  });

  it('Trivy names all three scanners, because misconfig is not a default', () => {
    // The whole finding. `scan-type: fs` defaults to vuln,secret; leaving `scanners` unset is how
    // IaC went unscanned while a job called "Security Scan" reported green on every PR.
    expect(ci).toMatch(/scanners: 'vuln,secret,misconfig'/);
  });

  it('the misconfig gate blocks rather than reports', () => {
    const step = ci.slice(ci.indexOf('Run Trivy — filesystem scan'));
    expect(step.slice(0, step.indexOf('- name: Run Trivy — container'))).toMatch(/exit-code: '1'/);
  });
});

describe('Phase 17 · the Trivy misconfiguration baseline only shrinks', () => {
  const ignore = read('.trivyignore.yaml');
  const parsed = readYaml<{
    misconfigurations?: Array<{ id: string; paths?: string[]; statement?: string }>;
  }>('.trivyignore.yaml');

  // Enabling misconfig surfaced 28 CRITICAL/HIGH findings. 27 were FIXED; ONE remains. The count is
  // what makes this a ratchet — a second entry cannot appear without editing this line, which is
  // the moment someone has to justify it in review.
  //
  // Gone by repair, not by suppression: KSV-0118 (securityContext on ten raw manifests), KSV-0014
  // (readOnlyRootFilesystem plus an emptyDir at /tmp), KSV-0056 (the autoscaler's write access to
  // Endpoints, vestigial since v1.29 leader-elects on Leases), and four of the five AWS-0104s.
  const KNOWN_RULES = ['AVD-AWS-0104'];

  it('suppresses exactly the rules the baseline recorded', () => {
    expect((parsed.misconfigurations ?? []).map((m) => m.id).sort()).toEqual(
      [...KNOWN_RULES].sort(),
    );
  });

  it('is not growing', () => {
    // 1 finding, down from 28 on the day the scanner was turned on. This number may go down; a
    // change that raises it is a change that added a weakness and hid it in the same commit.
    expect((parsed.misconfigurations ?? []).length).toBeLessThanOrEqual(KNOWN_RULES.length);
  });

  it('scopes every suppression to the file it applies to', () => {
    // The whole reason this is YAML. Plain .trivyignore takes bare IDs, so one entry switches the
    // rule off everywhere — and it did: with the plain file in place, restoring the blanket egress
    // on the RDS security group as a test produced no failure, because the entry meant for the EKS
    // nodes swallowed it. An unscoped entry is a disabled check wearing the costume of a baseline.
    for (const m of parsed.misconfigurations ?? []) {
      expect(`${m.id}: paths`).toBe(
        m.paths && m.paths.length > 0 ? `${m.id}: paths` : `${m.id}: NO paths`,
      );
    }
  });

  it('explains every suppression', () => {
    // An ignore file without reasons becomes permanent by default: nobody can tell which entries
    // were a considered trade-off and which were added to make a build go green.
    for (const m of parsed.misconfigurations ?? []) {
      expect(`${m.id}: statement`).toBe(
        m.statement ? `${m.id}: statement` : `${m.id}: MISSING statement`,
      );
    }
  });

  it('says outright that it is not a place to silence a failing build', () => {
    expect(ignore).toMatch(/DO NOT add an entry here to make a build pass/);
  });

  it('records that the plain-text format is not sufficient', () => {
    // So the next person does not "simplify" it back to .trivyignore and silently widen every entry.
    expect(ignore).toMatch(/plain-text format takes bare rule IDs/);
  });
});

/**
 * The VPC endpoints that let the node egress close (master:4641-4645; Trivy AWS-0104).
 *
 * Worker nodes had `protocol = "-1"` to 0.0.0.0/0 — every protocol, anywhere — because ECR, STS,
 * EKS and CloudWatch Logs all left the VPC. These endpoints are what made the narrowing possible;
 * without them the rules in modules/eks/main.tf cannot hold and someone widens them back.
 */
describe('Phase 17 · AWS API traffic stays inside the VPC (Trivy AWS-0104)', () => {
  const endpoints = read('infrastructure/terraform/aws/vpc-endpoints.tf');
  const eks = read('infrastructure/terraform/aws/modules/eks/main.tf');

  it.each(['ecr.api', 'ecr.dkr', 'sts', 'eks', 'logs'])(
    'an interface endpoint exists for %s',
    (svc) => {
      expect(endpoints).toContain(`"${svc}"`);
    },
  );

  it('ecr.api and ecr.dkr are both present', () => {
    // dkr alone cannot authenticate: a pull gets as far as the registry and fails on the token.
    // The pair is the requirement, and half of it is the mistake that looks like it works.
    expect(endpoints).toContain('ecr.api');
    expect(endpoints).toContain('ecr.dkr');
  });

  it('private DNS is enabled, or the endpoints are inert', () => {
    // Without it the endpoint exists and nothing resolves to it: callers keep the public hostname
    // and keep leaving through the NAT gateway, while the egress rules assume otherwise.
    expect(endpoints).toMatch(/private_dns_enabled\s*=\s*true/);
  });

  it('S3 is a gateway endpoint attached to the private route tables', () => {
    // ECR stores image layers in S3. An ECR endpoint without this one still sends every layer
    // through the NAT gateway, which is most of the bytes.
    expect(endpoints).toMatch(/vpc_endpoint_type\s*=\s*"Gateway"/);
    expect(endpoints).toMatch(/route_table_ids\s*=\s*aws_route_table\.private/);
  });

  it('the S3 prefix list is looked up, not hard-coded', () => {
    // AWS adds and removes ranges. A copied CIDR list stops matching silently, and the symptom is
    // image pulls failing for one region at a time.
    expect(endpoints).toMatch(/data "aws_prefix_list" "s3"/);
  });

  it('the endpoint security group accepts 443 from the nodes and nothing else', () => {
    const sg = endpoints.slice(endpoints.indexOf('resource "aws_security_group" "vpc_endpoints"'));
    const block = sg.slice(0, sg.indexOf('resource "aws_vpc_endpoint"'));
    expect(block).toMatch(/security_groups\s*=\s*\[module\.eks\.node_security_group_id\]/);
    // No egress block: an endpoint ENI answers requests and originates nothing.
    expect(block).not.toMatch(/egress\s*\{/);
  });

  it('node DNS egress is scoped to the VPC, not the internet', () => {
    // AmazonProvidedDNS answers inside the VPC and no DHCP options set overrides it, so a DNS rule
    // reaching 0.0.0.0/0 was pure surface.
    const dns = eks.slice(eks.indexOf('DNS over UDP to the VPC resolver'));
    expect(dns.slice(0, 400)).toMatch(/cidr_blocks\s*=\s*\[var\.vpc_cidr\]/);
  });

  it('exactly one node egress rule still reaches 0.0.0.0/0', () => {
    // The public-third-party rule, and only it. A second one appearing is the regression this
    // whole exercise exists to prevent — and it is the shape a "quick fix" takes.
    const code = eks.replace(/#[^\n]*/g, ' ');
    const wide = code.match(/cidr_blocks\s*=\s*\["0\.0\.0\.0\/0"\]/g) ?? [];
    expect(wide).toHaveLength(1);
  });
});

/**
 * Egress domain filtering (Trivy AWS-0104, the last one).
 *
 * The node security group must keep one TCP/443 rule to 0.0.0.0/0: eleven third-party hosts sit
 * behind CDNs, and a security group filters by address. The control that CAN express a hostname
 * lives one hop out — a Network Firewall endpoint the private subnets route through.
 *
 * These cases exist because the arrangement has two halves that fail differently. If the routing is
 * wrong the traffic never reaches the firewall and nothing announces it — egress simply keeps
 * working, unfiltered. If the default action is ALERT rather than DROP the allowlist becomes a log
 * of violations that are permitted anyway, which reads as enforcement on a dashboard.
 */
describe('Phase 17 · egress is filtered by domain, not left open (Trivy AWS-0104)', () => {
  const fw = read('infrastructure/terraform/aws/network-firewall.tf');
  const main = read('infrastructure/terraform/aws/main.tf');

  const HOSTS = [
    'api.openai.com',
    'api.openweathermap.org',
    'oauth2.googleapis.com',
    'www.googleapis.com',
    'playintegrity.googleapis.com',
    'www.apple.com',
    'openexchangerates.org',
    'api.sendgrid.com',
    'api.line.me',
    'api-data.line.me',
    'exp.host',
  ];

  it.each(HOSTS)('%s is on the allowlist', (host) => {
    expect(fw).toContain(`"${host}"`);
  });

  it('allows both LINE hosts, not just the API one', () => {
    // @line/bot-sdk uses api-data.line.me for content. Allowing only api.line.me passes every
    // text message and breaks every image — the kind of partial failure that gets blamed on LINE.
    expect(fw).toContain('"api.line.me"');
    expect(fw).toContain('"api-data.line.me"');
  });

  it('lists nothing beyond what the code actually calls', () => {
    // An allowlist that grows by habit stops being one. Package mirrors in particular do NOT belong:
    // nothing installs at runtime, that happens in the image build.
    const targets = fw.slice(
      fw.indexOf('egress_allowed_domains'),
      fw.indexOf(']', fw.indexOf('egress_allowed_domains')),
    );
    const listed = [...targets.matchAll(/"([a-z0-9.-]+\.[a-z]{2,})"/g)].map((m) => m[1]!);
    expect(listed.sort()).toEqual([...HOSTS].sort());
  });

  it('drops by default rather than alerting', () => {
    // aws:alert_established without aws:drop_established is an allowlist that permits everything and
    // writes a log about it.
    expect(fw).toMatch(
      /stateful_default_actions\s*=\s*\["aws:drop_established", "aws:alert_established"\]/,
    );
  });

  it('matches on TLS SNI, which is what carries the hostname', () => {
    expect(fw).toMatch(/target_types\s*=\s*\["TLS_SNI"\]/);
    expect(fw).toMatch(/generated_rules_type\s*=\s*"ALLOWLIST"/);
  });

  it('routes private subnets through the firewall, not straight to NAT', () => {
    // The half that fails silently. With a 0.0.0.0/0 -> NAT route still in the private table, egress
    // works exactly as before and the firewall inspects nothing.
    expect(fw).toMatch(/resource "aws_route" "private_to_firewall"/);
    const rt = main.slice(main.indexOf('resource "aws_route_table" "private"'));
    expect(rt.slice(0, rt.indexOf('resource "aws_route_table_association"'))).not.toMatch(
      /nat_gateway_id/,
    );
  });

  it('gives the internet gateway a return path through the same endpoint', () => {
    // Network Firewall is stateful. Reply traffic that comes back through a different path is an
    // unsolicited packet to the engine, and the connection dies mid-flow.
    expect(fw).toMatch(/resource "aws_route_table" "igw_ingress"/);
    expect(fw).toMatch(/gateway_id\s*=\s*aws_internet_gateway\.main\.id/);
  });

  it('has a firewall subnet per AZ', () => {
    // Same-AZ routing is a requirement of stateful inspection, not a preference.
    expect(fw).toMatch(/resource "aws_subnet" "firewall"/);
    expect(fw).toMatch(/count\s*=\s*length\(var\.firewall_subnet_cidrs\)/);
  });

  it('protects the firewall from being destroyed out from under the allowlist', () => {
    expect(fw).toMatch(/delete_protection\s*=\s*true/);
  });
});
