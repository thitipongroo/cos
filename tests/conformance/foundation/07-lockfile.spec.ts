/**
 * Phase 1 Generate item 17 — master:1735-1738, and Rule 28 (master:5650-5654)
 *
 *   "pnpm lock file: run `pnpm install` after initial setup and commit pnpm-lock.yaml
 *    ... (4) change CI from `pnpm install` to `pnpm install --frozen-lockfile`"
 *   Rule 28: "apps/mobile is its own pnpm workspace ... its dependencies resolve
 *    into apps/mobile/pnpm-lock.yaml"
 */
import { exists, read } from '../helpers';

describe('Phase 1 · lockfiles (master:1735-1737)', () => {
  it('root pnpm-lock.yaml is committed', () => {
    expect(exists('pnpm-lock.yaml')).toBe(true);
  });

  it('apps/mobile has its own lockfile (Rule 28, master:5650-5654)', () => {
    expect(exists('apps/mobile/pnpm-lock.yaml')).toBe(true);
  });
});

describe('Phase 1 · CI installs with --frozen-lockfile (master:1738)', () => {
  it('ci.yml pins the lockfile on install', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toMatch(/pnpm install[^\n]*--frozen-lockfile/);
  });

  it('ci.yml never runs a bare `pnpm install`', () => {
    const ci = read('.github/workflows/ci.yml');
    const bare = Array.from(ci.matchAll(/run:\s*pnpm install\s*$/gm));
    expect(bare).toHaveLength(0);
  });
});
