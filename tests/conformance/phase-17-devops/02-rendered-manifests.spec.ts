/**
 * Phase 17 — what Helm actually RENDERS, for every chart in every environment (master:4589-4713).
 *
 * WHY THIS FILE IS SEPARATE FROM 01. That one reads values.yaml; this one runs `helm template` over
 * all three environment overlays and asserts on the Kubernetes objects that come out. The spec's own
 * 2026-07-20 POC note is the reason: "only a real deploy catches this, lint and dry-run do not". A
 * values file can be right while an overlay silently changes it, and `helm lint` never renders an
 * overlay at all.
 *
 * It shells out to `helm`, so it lives in the offline suite rather than the container harness — it
 * needs a binary, not a database. If helm is missing the suite says so instead of passing quietly.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'fs';
import * as path from 'path';
import { read, repoRoot } from '../helpers';

const helmDir = 'infrastructure/helm';
const charts = fs
  .readdirSync(path.join(repoRoot, helmDir), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();
const environments = ['dev', 'staging', 'prod'] as const;

const helmAvailable = ((): boolean => {
  try {
    execFileSync('helm', ['version', '--short'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
})();

/** Render one chart with one environment overlay, exactly as a deploy would. */
const render = (chart: string, env: string): string =>
  execFileSync(
    'helm',
    [
      'template',
      chart,
      path.join(repoRoot, helmDir, chart),
      '-f',
      path.join(repoRoot, helmDir, chart, `values-${env}.yaml`),
    ],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );

/** Every rendered (chart, environment) pair, computed once. */
const rendered: Array<[string, string, string]> = helmAvailable
  ? charts.flatMap((chart) =>
      environments.map((env) => [chart, env, render(chart, env)] as [string, string, string]),
    )
  : [];

/** The container block of a rendered Deployment, as raw YAML text. */
const deploymentOf = (manifest: string): string => {
  const start = manifest.indexOf('kind: Deployment');
  if (start === -1) return '';
  const next = manifest.indexOf('\n---', start);
  return manifest.slice(start, next === -1 ? undefined : next);
};

describe('Phase 17 · helm is available to render with', () => {
  it('the binary is installed', () => {
    // Stated rather than skipped: a suite that passes because it could not run is worse than one
    // that fails.
    expect(helmAvailable).toBe(true);
  });

  it('rendered every chart in every environment', () => {
    expect(rendered.length).toBe(charts.length * environments.length);
  });
});

describe('Phase 17 · rendered pod security (master:4591)', () => {
  it.each(rendered.map(([c, e]) => [c, e]))(
    '%s/%s keeps seccompProfile RuntimeDefault',
    (chart, env) => {
      // profile:cis enforces PodSecurity restricted. Without this the DEPLOYMENT is admitted and the
      // POD is rejected — the POC calls it a silent failure, and an overlay dropping it would look
      // exactly like the original bug.
      const [, , manifest] = rendered.find(([c, e]) => c === chart && e === env)!;
      const deployment = deploymentOf(manifest);
      expect(deployment).toMatch(/seccompProfile:\s*\n\s*type:\s*RuntimeDefault/);
    },
  );

  it.each(rendered.map(([c, e]) => [c, e]))('%s/%s runs as non-root', (chart, env) => {
    const [, , manifest] = rendered.find(([c, e]) => c === chart && e === env)!;
    expect(deploymentOf(manifest)).toMatch(/runAsNonRoot:\s*true/);
  });
});

describe('Phase 17 · rendered rollout strategy (master:4633-4634)', () => {
  it.each(rendered.map(([c, e]) => [c, e]))(
    '%s/%s surges 1 and stays fully available',
    (chart, env) => {
      // Rendered, not read from values: an overlay is free to override `strategy`, and a rollout that
      // drops pods is invisible — the deploy succeeds and capacity simply dips.
      const [, , manifest] = rendered.find(([c, e]) => c === chart && e === env)!;
      const deployment = deploymentOf(manifest);
      expect(deployment).toMatch(/type:\s*RollingUpdate/);
      expect(deployment).toMatch(/maxSurge:\s*1\b/);
      expect(deployment).toMatch(/maxUnavailable:\s*0\b/);
    },
  );
});

describe('Phase 17 · rendered resources (master:4598-4606)', () => {
  it.each(rendered.map(([c, e]) => [c, e]))('%s/%s declares requests AND limits', (chart, env) => {
    // A container with no limit can consume a whole node; one with no request cannot be scheduled
    // predictably. The spec gives per-runtime defaults, and several services are deliberately sized
    // ABOVE them (the monolith, the LLM gateway, the embedding worker) — so what is asserted is that
    // both halves are always present, not a specific number.
    const [, , manifest] = rendered.find(([c, e]) => c === chart && e === env)!;
    const deployment = deploymentOf(manifest);
    expect(deployment).toMatch(/resources:/);
    expect(deployment).toMatch(/requests:[\s\S]{0,120}?cpu:/);
    expect(deployment).toMatch(/requests:[\s\S]{0,120}?memory:/);
    expect(deployment).toMatch(/limits:[\s\S]{0,120}?cpu:/);
    expect(deployment).toMatch(/limits:[\s\S]{0,120}?memory:/);
  });

  it('the spec baseline is used by at least one chart per runtime', () => {
    // master:4598-4606 calls these numbers the DEFAULT. If no chart anywhere still carries them the
    // baseline has quietly drifted, even though every individual override may be justified.
    const values = charts.map((c) => read(`${helmDir}/${c}/values.yaml`)).join('\n');
    // NestJS/Node default: 100m/256Mi → 500m/512Mi.
    expect(values).toMatch(/cpu:\s*'?100m/);
    // FastAPI default: 500m/1Gi → 2000m/2Gi.
    expect(values).toMatch(/cpu:\s*'?2000m/);
    // Go default: 200m/128Mi → 1000m/256Mi.
    expect(values).toMatch(/memory:\s*'?128Mi/);
  });
});

describe('Phase 17 · rendered probes still point at a served path', () => {
  /** Health paths each service serves, read from its own source. */
  const served = (dir: string): string[] => {
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
        } else if (/\.(ts|py|go)$/.test(e.name) && !/\.(spec|test)\./.test(e.name)) {
          for (const m of fs
            .readFileSync(full, 'utf8')
            .matchAll(/['"`]\/health(?:\/(?:live|ready))?['"`]/g)) {
            found.add(m[0].replace(/['"`]/g, ''));
          }
        }
      }
    };
    walk(path.join(repoRoot, dir));
    return [...found];
  };

  const SOURCES: Record<string, string> = {
    'cos-file-service': 'services/file-service/src',
    'cos-credential-service': 'services/credential-service/src',
    'cos-ai-gateway': 'services/ai-gateway',
    'cos-ai-embedding-worker': 'services/ai-embedding-worker',
    'cos-ai-ocr-pipeline': 'services/ai-ocr-pipeline',
    'cos-ai-transcription-pipeline': 'services/ai-transcription-pipeline',
    'cos-analytics-worker': 'services/analytics-worker',
    'cos-iot-ingestion-worker': 'services/iot-ingestion-worker',
    'cos-kg-ingestion-worker': 'services/kg-ingestion-worker',
  };

  const cases = rendered
    .filter(([chart]) => chart in SOURCES)
    .map(([chart, env]) => [chart, env] as [string, string]);

  it.each(cases)('%s/%s probes a path the service serves', (chart, env) => {
    const [, , manifest] = rendered.find(([c, e]) => c === chart && e === env)!;
    const paths = [...deploymentOf(manifest).matchAll(/path:\s*(\S+)/g)].map((m) => m[1]!);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(served(SOURCES[chart])).toContain(p);
  });

  it.each(environments)('cos-backend/%s probes the prefixed path', (env) => {
    // setGlobalPrefix('api/v1') with no exclude — verified by request: /health/live → 404,
    // /api/v1/health/live → 200. Checked per environment because an overlay could override it back.
    const [, , manifest] = rendered.find(([c, e]) => c === 'cos-backend' && e === env)!;
    const paths = [...deploymentOf(manifest).matchAll(/path:\s*(\S+)/g)].map((m) => m[1]!);
    expect(paths).toContain('/api/v1/health/live');
    expect(paths).toContain('/api/v1/health/ready');
    expect(paths).not.toContain('/health/live');
  });
});
