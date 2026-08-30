/**
 * Phase 1 Generate item 1 — master 00_master_construction_os.md:1664-1673
 *
 *   "complete directory structure with placeholder README per service AND per package"
 *   "Each README must contain: purpose, public API, dependencies, configuration,
 *    usage example (QM-11)"
 *
 * Rule 31(a): the obligation is EVERY directory listed in the Directory Structure
 * section, not a representative sample.
 */
import { exists, read } from '../helpers';

const PHASE1_SERVICES = [
  'file-service',
  'ai-gateway',
  'ai-embedding-worker',
  'ai-ocr-pipeline',
  'analytics-worker',
  'kg-ingestion-worker',
];

const PHASE1_APPS = ['web', 'mobile'];

const PHASE1_MODULES = [
  'identity',
  'tenant',
  'project',
  'boq',
  'procurement',
  'site-ops',
  'finance',
  'notification',
  'equipment',
  'workforce',
];

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

/** QM-11 required README sections (master:1673). */
const QM11_SECTIONS: ReadonlyArray<[string, RegExp]> = [
  ['purpose', /\bpurpose\b/i],
  ['public API', /public\s*api/i],
  ['dependencies', /\bdependencies\b/i],
  ['configuration', /\bconfiguration\b/i],
  // QM-11 asks for a usage EXAMPLE, not for the literal words. The repo answers it
  // with a `## Usage` heading followed by a fenced code block — checked below.
  ['usage example', /^#{1,3}\s+.*usage/im],
];

describe('Phase 1 · directory structure (master:1664-1672)', () => {
  it.each(PHASE1_SERVICES)('services/%s exists', (name) => {
    expect(exists(`services/${name}`)).toBe(true);
  });

  it.each(PHASE1_APPS)('apps/%s exists', (name) => {
    expect(exists(`apps/${name}`)).toBe(true);
  });

  it('backend/ exists', () => {
    expect(exists('backend')).toBe(true);
  });

  it.each(PHASE1_MODULES)('backend/src/modules/%s exists', (name) => {
    expect(exists(`backend/src/modules/${name}`)).toBe(true);
  });

  it.each(PHASE1_PACKAGES)('packages/@cos/%s exists', (name) => {
    expect(exists(`packages/@cos/${name}`)).toBe(true);
  });
});

describe('Phase 1 · README per service AND per package (master:1664, 1673)', () => {
  const readmeTargets: Array<[string, string]> = [
    ...PHASE1_SERVICES.map((n) => [`services/${n}`, `services/${n}/README.md`] as [string, string]),
    ...PHASE1_APPS.map((n) => [`apps/${n}`, `apps/${n}/README.md`] as [string, string]),
    ['backend', 'backend/README.md'],
    ...PHASE1_PACKAGES.map(
      (n) => [`packages/@cos/${n}`, `packages/@cos/${n}/README.md`] as [string, string],
    ),
  ];

  it.each(readmeTargets)('%s has a README.md', (_target, readme) => {
    expect(exists(readme)).toBe(true);
  });

  describe.each(readmeTargets)('%s README satisfies QM-11', (_target, readme) => {
    it.each(QM11_SECTIONS)('documents "%s"', (_label, pattern) => {
      expect(exists(readme)).toBe(true);
      expect(read(readme)).toMatch(pattern);
    });

    it('backs the usage section with a runnable example', () => {
      // An "example" that is prose only does not satisfy QM-11.
      expect(read(readme)).toMatch(/```/);
    });
  });
});
