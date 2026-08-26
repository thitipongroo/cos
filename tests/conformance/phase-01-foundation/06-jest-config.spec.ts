/**
 * Phase 1 Generate item 16 — master:1717-1734, plus Rule 32 (master:5697-5704)
 *
 *   "jest.config.js per TypeScript package/service with coverage thresholds:
 *      coverage thresholds: { lines: 100, branches: 100 } per QM-1 (spec §30.3)
 *      collectCoverageFrom: exclude *.module.ts, *.dto.ts, *.payload.ts, index.ts,
 *        main.ts, event interface files
 *      moduleNameMapper: map all @cos/* workspace paths to source (not dist)"
 *   "packages EXEMPT (no executable logic — types/interfaces only): packages/@cos/types/"
 *   Rule 32: never both jest.config.js AND a "jest" key in package.json
 */
import { abs, exists, readJson } from '../helpers';

/** Rule 35 list — master:1722-1731. */
const JEST_REQUIRED = [
  'backend',
  'packages/@cos/shared',
  'packages/@cos/database',
  'packages/@cos/financial',
  'packages/@cos/rbac',
  'packages/@cos/validation',
  'packages/@cos/logger',
  'packages/@cos/tracing',
  'packages/@cos/config',
];

const JEST_EXEMPT = ['packages/@cos/types'];

interface JestConfig {
  coverageThreshold?: { global?: Record<string, number> };
  collectCoverageFrom?: string[];
  moduleNameMapper?: Record<string, string>;
}

const load = (dir: string): JestConfig =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS jest config file
  require(abs(`${dir}/jest.config.js`)) as JestConfig;

describe('Phase 1 · jest.config.js presence (master:1717, 1722-1731)', () => {
  it.each(JEST_REQUIRED)('%s has a jest.config.js', (dir) => {
    expect(exists(`${dir}/jest.config.js`)).toBe(true);
  });

  it.each(JEST_EXEMPT)('%s is exempt — types only, no executable logic', (dir) => {
    expect(exists(`${dir}/jest.config.js`)).toBe(false);
  });
});

describe('Phase 1 · QM-1 coverage thresholds 100/100 (master:1718)', () => {
  it.each(JEST_REQUIRED)('%s enforces 100% lines', (dir) => {
    expect(load(dir).coverageThreshold?.global?.lines).toBe(100);
  });

  it.each(JEST_REQUIRED)('%s enforces 100% branches', (dir) => {
    expect(load(dir).coverageThreshold?.global?.branches).toBe(100);
  });
});

describe('Phase 1 · collectCoverageFrom exclusions (master:1719-1720)', () => {
  const REQUIRED_EXCLUSIONS: ReadonlyArray<[string, RegExp]> = [
    ['*.module.ts', /\*\.module\.ts/],
    ['*.dto.ts', /\*\.dto\.ts/],
    ['*.payload.ts', /\*\.payload\.ts/],
    ['index.ts', /index\.ts/],
    ['main.ts', /main\.ts/],
  ];

  // The spec attaches this exclusion list to the app that owns those file kinds.
  it.each(REQUIRED_EXCLUSIONS)('backend excludes %s from coverage', (_label, pattern) => {
    const globs = (load('backend').collectCoverageFrom ?? []).filter((g) => g.startsWith('!'));
    expect(globs.some((g) => pattern.test(g))).toBe(true);
  });
});

describe('Phase 1 · moduleNameMapper points @cos/* at source, not dist (master:1721)', () => {
  it.each(JEST_REQUIRED)('%s maps @cos/* to source', (dir) => {
    const mapper = load(dir).moduleNameMapper ?? {};
    const cosEntries = Object.entries(mapper).filter(([k]) => k.includes('@cos'));
    expect(cosEntries.length).toBeGreaterThan(0);
    for (const [, target] of cosEntries) {
      expect(target).not.toMatch(/\/dist\//);
    }
  });
});

describe('Rule 32 · single source of truth for jest config (master:5697-5704)', () => {
  interface PackageJson {
    jest?: unknown;
  }

  it.each([...JEST_REQUIRED, ...JEST_EXEMPT])(
    '%s does not carry both jest.config.js and a package.json "jest" key',
    (dir) => {
      const hasConfigFile = exists(`${dir}/jest.config.js`);
      const pkg = readJson<PackageJson>(`${dir}/package.json`);
      const hasJestKey = pkg.jest !== undefined;
      expect(hasConfigFile && hasJestKey).toBe(false);
    },
  );
});
