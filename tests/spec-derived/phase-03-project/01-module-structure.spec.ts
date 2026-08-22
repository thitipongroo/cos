/**
 * Phase 3 Generate items 02 and 08 — master:2184, 2190
 *
 *   item 02 "NestJS module, service, repository, controller"
 *   item 08 "Unit tests: state machine, business rules"
 *
 * The project module owns the spatial hierarchy too (master:2171-2179), so the four layers are
 * checked for the module as a whole rather than for one file each.
 */
import * as fs from 'fs';
import * as path from 'path';
import { exists, repoRoot } from '../helpers';

const MODULE = 'backend/src/modules/project';

const filesUnder = (rel: string): string[] => {
  const dir = path.join(repoRoot, rel);
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') walk(full);
      } else out.push(path.relative(path.join(repoRoot, rel), full));
    }
  };
  walk(dir);
  return out;
};

const all = filesUnder(MODULE);
const src = all.filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));

describe('Phase 3 · project module exists (master:2184)', () => {
  it('backend/src/modules/project is present', () => {
    expect(exists(MODULE)).toBe(true);
  });

  it.each([
    ['module', /\.module\.ts$/],
    ['service', /\.service\.ts$/],
    ['repository', /\.repository\.ts$/],
    ['controller', /\.controller\.ts$/],
  ])('ships a %s layer', (_label, pattern) => {
    expect(src.some((f) => pattern.test(f))).toBe(true);
  });
});

describe('Phase 3 · spatial hierarchy is implemented in the module (master:2171-2179)', () => {
  // buildings / floors / rooms / structures / units / assets each need their own service+controller.
  it.each(['building', 'floor', 'room', 'structure', 'unit', 'asset'])(
    '%s has a service',
    (entity) => {
      expect(src.some((f) => new RegExp(`${entity}s?\\.service\\.ts$`).test(f))).toBe(true);
    },
  );

  it.each(['building', 'floor', 'room', 'structure', 'unit', 'asset'])(
    '%s has a controller',
    (entity) => {
      expect(src.some((f) => new RegExp(`${entity}s?\\.controller\\.ts$`).test(f))).toBe(true);
    },
  );
});

describe('Phase 3 · unit tests accompany the module (master:2190)', () => {
  const specs = all.filter((f) => f.endsWith('.spec.ts'));

  it('the module ships spec files', () => {
    expect(specs.length).toBeGreaterThan(0);
  });

  it('every service has a unit spec of its own', () => {
    const services = src.filter((f) => f.endsWith('.service.ts')).map((f) => path.basename(f));
    const specNames = new Set(specs.map((f) => path.basename(f)));
    const missing = services.filter((s) => !specNames.has(s.replace('.ts', '.spec.ts')));
    expect(missing).toEqual([]);
  });
});
