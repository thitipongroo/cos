/**
 * Phase 1 Generate items 3, 4, 5, 15 — master:1684-1686, 1712-1716
 *
 *   item 3  "turbo.json with build, test, lint, dev pipelines"
 *   item 4  "root tsconfig.base.json (strict, paths for @cos/* packages)"
 *   item 5  "per-service tsconfig.json extending base"
 *   item 15 "Mobile tsconfig exception: apps/mobile extends expo/tsconfig.base
 *            (NOT root tsconfig.base.json ...); add only mobile-compatible @cos/*
 *            paths: types, financial, validation, rbac, shared — do NOT add
 *            logger, tracing, config, database (Node.js-only packages)"
 */
import { exists, readJson, readJsonc } from '../helpers';

interface TurboJson {
  tasks?: Record<string, unknown>;
}

interface TsConfig {
  extends?: string;
  compilerOptions?: {
    strict?: boolean;
    paths?: Record<string, string[]>;
  };
}

const PHASE1_PACKAGES = [
  'shared',
  'database',
  'rbac',
  'validation',
  'logger',
  'tracing',
  'financial',
  'types',
  'config',
];

const PHASE1_SERVICES_TS = ['file-service'];

describe('Phase 1 · turbo.json pipelines (master:1684)', () => {
  const turbo = readJson<TurboJson>('turbo.json');

  it.each(['build', 'test', 'lint', 'dev'])('defines the %s pipeline', (task) => {
    expect(Object.keys(turbo.tasks ?? {})).toContain(task);
  });
});

describe('Phase 1 · root tsconfig.base.json (master:1685)', () => {
  const base = readJsonc<TsConfig>('tsconfig.base.json');

  it('enables strict mode', () => {
    expect(base.compilerOptions?.strict).toBe(true);
  });

  it('forbids implicit any', () => {
    // "TypeScript: 6.x (strict mode, no implicit any)" — master:1657
    const opts = base.compilerOptions as Record<string, unknown> | undefined;
    expect(opts?.noImplicitAny).toBe(true);
  });

  it.each(PHASE1_PACKAGES)('maps a path for @cos/%s', (name) => {
    const paths = base.compilerOptions?.paths ?? {};
    expect(Object.keys(paths)).toContain(`@cos/${name}`);
  });

  it.each(PHASE1_PACKAGES)('maps a wildcard path for @cos/%s/*', (name) => {
    const paths = base.compilerOptions?.paths ?? {};
    expect(Object.keys(paths)).toContain(`@cos/${name}/*`);
  });
});

describe('Phase 1 · per-service tsconfig extends base (master:1686)', () => {
  const targets = [
    'backend',
    ...PHASE1_PACKAGES.map((n) => `packages/@cos/${n}`),
    ...PHASE1_SERVICES_TS.map((n) => `services/${n}`),
  ];

  it.each(targets)('%s/tsconfig.json exists', (dir) => {
    expect(exists(`${dir}/tsconfig.json`)).toBe(true);
  });

  it.each(targets)('%s/tsconfig.json extends the root base', (dir) => {
    const cfg = readJsonc<TsConfig>(`${dir}/tsconfig.json`);
    expect(cfg.extends).toBeDefined();
    expect(cfg.extends).toMatch(/tsconfig\.base\.json$/);
  });
});

describe('Phase 1 · mobile tsconfig exception (master:1712-1716)', () => {
  const mobile = readJsonc<TsConfig>('apps/mobile/tsconfig.json');

  it('extends expo/tsconfig.base, not the root base', () => {
    expect(mobile.extends).toBe('expo/tsconfig.base');
  });

  const MOBILE_SAFE = ['types', 'financial', 'validation', 'rbac', 'shared'];
  const NODE_ONLY = ['logger', 'tracing', 'config', 'database'];

  it.each(MOBILE_SAFE)('includes the mobile-compatible path @cos/%s', (name) => {
    const paths = mobile.compilerOptions?.paths ?? {};
    expect(Object.keys(paths)).toContain(`@cos/${name}`);
  });

  it.each(MOBILE_SAFE)('includes the mobile-compatible path @cos/%s/*', (name) => {
    const paths = mobile.compilerOptions?.paths ?? {};
    expect(Object.keys(paths)).toContain(`@cos/${name}/*`);
  });

  it.each(NODE_ONLY)('does NOT expose the Node.js-only package @cos/%s', (name) => {
    const paths = Object.keys(mobile.compilerOptions?.paths ?? {});
    expect(paths).not.toContain(`@cos/${name}`);
    expect(paths).not.toContain(`@cos/${name}/*`);
  });
});
