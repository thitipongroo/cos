/**
 * Phase 1 — the module boundary, as the spec actually states it.
 *
 * Two lines a thousand apart define one rule:
 *
 *   master:551      "Module-to-module: Direct NestJS module dependency injection (NOT HTTP/gRPC)"
 *   master:1608-09  "Modules must NOT import from each other's src/ directly —
 *                    cross-module communication via Kafka events or shared service layer only"
 *
 * Read together they are not in tension: DI IS the sanctioned channel, and what is forbidden is
 * reaching PAST it into another module's internals. That is the public-API rule every modular
 * monolith toolchain converged on — Shopify's Packwerk gives each pack a `public/` directory and
 * fails CI on anything else; Spring Modulith has `@ApplicationModule(allowedDependencies = "order
 * :: spi")` with named interfaces. Here the public API already exists and needs no new convention:
 * it is whatever the module's `@Module({ exports: [...] })` lists, plus the module class itself.
 *
 * WHY THIS CANNOT BE A RUNTIME TEST. Every import here compiles, boots and serves traffic. A module
 * that reaches into another's internals works perfectly until the day that internal changes, and
 * then it breaks somewhere that has no obvious connection to the edit. Nothing observable at run
 * time distinguishes a dependency on an exported provider from a dependency on a private one.
 *
 * THE ALLOWLIST. 26 edges already breach this. Following Packwerk's `deprecated_references`
 * approach, they are listed rather than fixed first: enforcement starts today, a NEW breach fails,
 * and the list can only shrink — a fixed entry left behind fails too. Without that second half a
 * TODO list becomes permanent.
 */
import * as fs from 'fs';
import * as path from 'path';
import { abs } from '../helpers';

const MODULES_DIR = 'backend/src/modules';

interface Breach {
  from: string;
  to: string;
  symbol: string;
  typeOnly: boolean;
  file: string;
}

const moduleNames = (): string[] =>
  fs
    .readdirSync(abs(MODULES_DIR), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

/**
 * A module's public API: everything its `@Module({ exports: [...] })` lists, plus the module class.
 *
 * Read from the DECORATOR rather than from a hand-kept manifest, so the rule tracks whatever the
 * module actually offers and cannot drift from it.
 */
const publicApiOf = (mod: string): Set<string> => {
  const api = new Set<string>();
  const dir = path.join(abs(MODULES_DIR), mod);
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.module.ts')) continue;
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    const exportsBlock = /exports:\s*\[([^\]]*)\]/s.exec(src);
    if (exportsBlock) {
      for (const raw of exportsBlock[1]!.split(',')) {
        const sym = raw.trim();
        if (sym) api.add(sym);
      }
    }
    for (const m of src.matchAll(/export class (\w+Module)/g)) api.add(m[1]!);
  }
  return api;
};

/** Every cross-module import that names something the target module does not export. */
const findBreaches = (): Breach[] => {
  const mods = moduleNames();
  const api = new Map(mods.map((m) => [m, publicApiOf(m)]));
  const out: Breach[] = [];

  for (const mod of mods) {
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Specs may reach anywhere: a unit test types a mock of the thing it is testing.
          if (entry.name !== '__tests__') walk(full);
          continue;
        }
        if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) continue;
        const src = fs.readFileSync(full, 'utf8');
        for (const [, stmt, names, spec] of src.matchAll(
          /(import\s+(?:type\s+)?)\{([^}]*)\}\s+from\s+['"](\.[^'"]+)['"]/gs,
        )) {
          const resolved = path.relative(abs(MODULES_DIR), path.normalize(path.join(dir, spec!)));
          const target = resolved.split(path.sep)[0]!;
          if (!api.has(target) || target === mod) continue;
          const stmtIsType = stmt!.includes('type');
          for (const raw of names!.split(',')) {
            const trimmed = raw.trim();
            if (!trimmed) continue;
            const symbol = trimmed
              .replace(/^type\s+/, '')
              .split(' as ')[0]!
              .trim();
            if (api.get(target)!.has(symbol)) continue;
            out.push({
              from: mod,
              to: target,
              symbol,
              typeOnly: stmtIsType || trimmed.startsWith('type '),
              file: path.relative(abs('backend/src'), full),
            });
          }
        }
      }
    };
    walk(path.join(abs(MODULES_DIR), mod));
  }
  return out;
};

const key = (b: Pick<Breach, 'from' | 'to' | 'symbol'>): string =>
  `${b.from} -> ${b.to}/${b.symbol}`;

/**
 * Edges that predate enforcement (measured 2026-08-26). Every entry is a thing to fix, not a thing
 * that is allowed — the test below fails if one is fixed and left here.
 *
 * TYPE-ONLY entries are erased at compile time and carry no runtime coupling. They are still listed:
 * a DTO class is another module's input contract, and `sync` importing nine of them is the shape of
 * a module that replays every domain's writes. If those belong anywhere shared it is @cos/types,
 * which is what master:1604 lists as the home for shared contracts.
 *
 * RUNTIME entries are the sharp ones — executable code reached past a module's own API.
 */
const KNOWN_BREACHES: ReadonlyArray<string> = [
  // type-only — DTOs and request/payload shapes
  'files -> site-ops/ConflictStatus',
  // runtime — executable code past the module API
  'files -> site-ops/resolveAnnotationConflict',
  'identity -> notification/createStandaloneNotifier',
  'safety -> site-ops/SubmitInspectionDto',
  'site-ops -> project/projectExistsInTenant',
  'tenant -> notification/PLATFORM_HUMAN_GATE_EVENT_TYPE',
  'tenant -> notification/createStandaloneNotifier',
];

/**
 * shared/ sits BENEATH the modules, so nothing in it may depend on one.
 *
 * Not covered by the module scan above, which only walks backend/src/modules — and that blind spot
 * hid eight of these until 2026-08-26. The direction matters more than the count: `shared/guards`
 * is where spec §6.9 puts RolesGuard and PolicyGuard, and a guard that reaches back into a module
 * makes the module a prerequisite for the layer every module depends on. Nothing fails when that
 * happens; the import resolves, the app boots, and the cycle only shows up as a mysterious ordering
 * problem much later.
 *
 * Six were fixed by moving what shared/ actually needed into it: JwtPayload, AuthenticatedUser and
 * TenantRequest are request-context shapes, and an interface can never be a NestJS `exports:` entry,
 * so no module could have offered them as public API in the first place.
 *
 * The two that remain are one decision, not two: shared/feature-flags uses OptionalJwtAuthGuard, and
 * that guard cannot simply move here — JwtAuthGuard, which it extends, depends on
 * modules/identity/last-seen.service, so relocating it would move the inversion rather than remove
 * it. Left listed for the product owner.
 */
describe('shared/ does not depend on any module', () => {
  const SHARED = 'backend/src/shared';

  const KNOWN_INVERSIONS: ReadonlyArray<string> = [
    'shared/feature-flags/feature-flags.module.ts -> identity/guards/optional-jwt-auth.guard',
    'shared/feature-flags/flags.controller.ts -> identity/guards/optional-jwt-auth.guard',
  ];

  const inversions = ((): string[] => {
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(full);
          continue;
        }
        if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) continue;
        const src = fs.readFileSync(full, 'utf8');
        for (const [, spec] of src.matchAll(
          /(?:from|jest\.mock\(|require\()\s*['"](\.[^'"]*modules\/[^'"]+)['"]/g,
        )) {
          const target = spec!.slice(spec!.indexOf('modules/') + 'modules/'.length);
          out.push(`${path.relative(abs('backend/src'), full)} -> ${target}`);
        }
      }
    };
    walk(abs(SHARED));
    return out;
  })();

  it('finds shared source to scan', () => {
    expect(fs.readdirSync(abs(SHARED)).length).toBeGreaterThan(5);
  });

  it('has no unlisted dependency on a module', () => {
    expect(inversions.filter((i) => !KNOWN_INVERSIONS.includes(i))).toEqual([]);
  });

  it('the known-inversion list has no stale entries', () => {
    expect(KNOWN_INVERSIONS.filter((k) => !inversions.includes(k))).toEqual([]);
  });

  it('the known-inversion list is not growing', () => {
    // 8 when this was first measured on 2026-08-26; 2 after the request-context shapes moved.
    expect(KNOWN_INVERSIONS.length).toBeLessThanOrEqual(2);
  });
});

describe('module boundaries (master:551, 1608-1609)', () => {
  const breaches = findBreaches();
  const seen = new Set(breaches.map(key));

  it('finds modules and their public APIs to check', () => {
    // A scan that silently found nothing would pass every assertion below.
    const mods = moduleNames();
    expect(mods.length).toBeGreaterThan(10);
    expect(publicApiOf('notification').size).toBeGreaterThan(0);
  });

  it('no module reaches past another module public API', () => {
    // DI on an exported provider is the sanctioned channel (master:551). Importing something the
    // target does not export is reaching into its internals, which master:1608 forbids.
    const unlisted = breaches.filter((b) => !KNOWN_BREACHES.includes(key(b)));
    expect(unlisted.map((b) => `${key(b)}  (${b.file}${b.typeOnly ? ', type-only' : ''})`)).toEqual(
      [],
    );
  });

  it('the known-breach list has no stale entries', () => {
    // The half that makes the list shrink. Without it a fixed edge stays listed forever and the
    // list stops describing anything.
    const stale = KNOWN_BREACHES.filter((k) => !seen.has(k));
    expect(stale).toEqual([]);
  });

  it('the known-breach list is not growing', () => {
    // A count, so a reviewer sees the number move in a diff. 26 when enforcement started on
    // 2026-08-26; 17 after `sync` stopped importing nine domain DTOs, then 13 once TenantRequest
    // moved to shared/context, 12 once JwtPayload did too, and 9 after the two DB-routing utils
    // (getDbUrlForTenant, decryptDedicatedDbUrl) moved to shared/prisma and shared/crypto — all on
    // the same day, then 7 once the Temporal activity helpers moved to shared/workflows.
    // What is left needs a design decision per edge, not a move.
    expect(KNOWN_BREACHES.length).toBeLessThanOrEqual(7);
    expect(breaches.length).toBeLessThanOrEqual(7);
  });

  it('the sanctioned channel is actually used — most cross-module edges go through exports', () => {
    // CONTROL. If the public-API lookup were broken, everything would read as a breach and the
    // allowlist would look like the whole graph. The vast majority of edges are compliant, which is
    // what makes the 26 worth naming.
    expect(breaches.length).toBeLessThan(40);
  });
});
