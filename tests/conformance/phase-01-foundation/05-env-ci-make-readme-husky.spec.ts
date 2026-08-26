/**
 * Phase 1 Generate items 10-14 — master:1705-1711
 *
 *   item 10 ".env.example with all required variables documented"
 *   item 11 "GitHub Actions: CI pipeline (lint -> build -> test -> docker build);
 *            lint adds yamllint/sqlfluff/markdownlint — §30.12"
 *   item 12 "Makefile with: setup, dev, test, build, migrate, seed targets"
 *   item 13 "root README with architecture overview and getting started"
 *   item 14 "Git hooks: initialize Husky (husky init); create .husky/pre-commit
 *            running lint-staged; lint-staged config: eslint --fix + prettier --write
 *            on staged .ts/.tsx/.js/.jsx files; prettier --write on staged
 *            .json/.yaml/.yml files"
 */
import { exists, read, readJson } from '../helpers';

describe('Phase 1 · .env.example documents every compose variable (master:1705)', () => {
  it('.env.example exists', () => {
    expect(exists('.env.example')).toBe(true);
  });

  const composeVars = Array.from(
    new Set(
      Array.from(read('docker-compose.yml').matchAll(/\$\{([A-Z0-9_]+)(?::?[-?][^}]*)?\}/g)).map(
        (m) => m[1],
      ),
    ),
  ).sort();

  it('compose interpolates at least one variable', () => {
    expect(composeVars.length).toBeGreaterThan(0);
  });

  it.each(composeVars)('documents %s', (name) => {
    expect(read('.env.example')).toMatch(new RegExp(`^\\s*#?\\s*${name}\\s*=`, 'm'));
  });
});

describe('Phase 1 · CI pipeline (master:1706)', () => {
  const ci = read('.github/workflows/ci.yml');

  it.each(['lint', 'build', 'test'])('runs a %s stage', (stage) => {
    expect(ci).toMatch(new RegExp(stage, 'i'));
  });

  it('builds Docker images', () => {
    expect(ci).toMatch(/docker/i);
  });

  it.each(['yamllint', 'sqlfluff', 'markdownlint'])('lint stage runs %s (§30.12)', (tool) => {
    expect(ci).toMatch(new RegExp(tool, 'i'));
  });
});

describe('Phase 1 · Makefile targets (master:1707)', () => {
  const makefile = read('Makefile');

  it.each(['setup', 'dev', 'test', 'build', 'migrate', 'seed'])('defines the %s target', (t) => {
    expect(makefile).toMatch(new RegExp(`^${t}:`, 'm'));
  });
});

describe('Phase 1 · root README (master:1708)', () => {
  const readme = read('README.md');

  it('contains an architecture overview', () => {
    expect(readme).toMatch(/architecture/i);
  });

  it('contains getting started instructions', () => {
    expect(readme).toMatch(/getting\s+started/i);
  });
});

describe('Phase 1 · Husky + lint-staged (master:1709-1711)', () => {
  interface PackageJson {
    'lint-staged'?: Record<string, string[] | string>;
    devDependencies?: Record<string, string>;
  }
  const pkg = readJson<PackageJson>('package.json');

  it('.husky/pre-commit exists', () => {
    expect(exists('.husky/pre-commit')).toBe(true);
  });

  it('.husky/pre-commit runs lint-staged', () => {
    expect(read('.husky/pre-commit')).toMatch(/lint-staged/);
  });

  it('husky is a devDependency', () => {
    expect(pkg.devDependencies?.husky).toBeDefined();
  });

  const lintStaged = pkg['lint-staged'] ?? {};
  const globFor = (ext: string): string | undefined =>
    Object.keys(lintStaged).find((glob) => glob.includes(ext));

  it.each(['ts', 'tsx', 'js', 'jsx'])('runs eslint --fix on staged .%s files', (ext) => {
    const glob = globFor(ext);
    expect(glob).toBeDefined();
    const cmds = ([] as string[]).concat(lintStaged[glob as string] as string[] | string);
    expect(cmds.some((c) => /eslint --fix/.test(c))).toBe(true);
  });

  it.each(['ts', 'tsx', 'js', 'jsx'])('runs prettier --write on staged .%s files', (ext) => {
    const glob = globFor(ext);
    expect(glob).toBeDefined();
    const cmds = ([] as string[]).concat(lintStaged[glob as string] as string[] | string);
    expect(cmds.some((c) => /prettier --write/.test(c))).toBe(true);
  });

  it.each(['json', 'yaml', 'yml'])('runs prettier --write on staged .%s files', (ext) => {
    const glob = globFor(ext);
    expect(glob).toBeDefined();
    const cmds = ([] as string[]).concat(lintStaged[glob as string] as string[] | string);
    expect(cmds.some((c) => /prettier --write/.test(c))).toBe(true);
  });
});
