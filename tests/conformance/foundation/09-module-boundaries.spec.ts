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
/**
 * A module's public API has TWO halves, and it needs both.
 *
 * 1. `@Module({ exports: [...] })` — the DI channel master:551 sanctions. It can only ever hold
 *    PROVIDERS. A DTO class, an interface, a free function and a `const` are structurally ineligible,
 *    no matter how deliberately a module means to publish them.
 * 2. `<module>/public/` — a named folder, which is the half that was missing. Introduced 2026-08-27
 *    after the surviving breaches turned out to be three different problems, none of them "someone
 *    reached into internals":
 *      · safety needed SubmitInspectionDto as a VALUE, because `@Body() dto: X` needs the runtime
 *        class for class-validator's metadata — a type alias silently disables ValidationPipe.
 *      · identity and tenant needed createStandaloneNotifier, because a Temporal activity runs in
 *        the worker process, outside the Nest container, and cannot inject anything.
 *      · site-ops needed projectExistsInTenant, which project/ had already half-published by
 *        inventing a folder called `shared/` — the convention, unnamed and unenforced.
 *    This is the same device Shopify's Packwerk spells `public/` and Spring Modulith spells a named
 *    interface: the exported surface is declared by LOCATION, so it survives a language that cannot
 *    express it in the framework's own export list.
 *
 * Everything else in a module stays private. `public/` earns its name only while it is small and
 * deliberate: a module that publishes most of itself has not drawn a boundary.
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

  const publicDir = path.join(dir, 'public');
  if (fs.existsSync(publicDir)) {
    for (const file of fs.readdirSync(publicDir)) {
      if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) continue;
      const src = fs.readFileSync(path.join(publicDir, file), 'utf8');
      for (const m of src.matchAll(
        /export\s+(?:declare\s+)?(?:async\s+)?(?:abstract\s+)?(?:class|const|function|type|interface|enum)\s+(\w+)/g,
      )) {
        api.add(m[1]!);
      }
    }
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
 * Empty since 2026-08-27, and meant to stay that way.
 *
 * It held 26 edges when enforcement began the day before. Most were closed by moving code that had
 * never belonged to a module — request-context shapes, DB-routing utils, Temporal activity helpers —
 * into shared/. The last seven were not that, and treating them as "reaches into internals" was a
 * misreading: each was a module publishing something the framework gave it no way to publish. Two
 * changes closed them.
 *
 *   · shared/sync/conflict-handler.ts — the offline-conflict strategies were filed under site-ops
 *     while serving files/ too, and the file imports nothing at all. It was mis-homed, not breached.
 *   · <module>/public/ — see publicApiOf above for why a second half was needed.
 *
 * Nothing here is grandfathered any more. An edge that needs to exist is declared, in `public/` or
 * in `exports:`; an edge that should not exist fails. If a future change genuinely needs an entry in
 * this list, that is a design decision to make deliberately — not a line to append while going past.
 */
const KNOWN_BREACHES: ReadonlyArray<string> = [];

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
 * The last two were closed on 2026-08-27, and the note that stood here — "that guard cannot simply
 * move, JwtAuthGuard depends on modules/identity/last-seen.service, so relocating it would move the
 * inversion rather than remove it" — was wrong about the chain. LastSeenService imports only
 * shared/prisma/create-prisma-client and @cos/logger, so it moved to shared/last-seen/ with nothing
 * following it; JwtAuthGuard's one other reach into modules/ was `AuthenticatedUser`, taken via
 * keycloak-jwt.strategy, which merely re-exports it from shared/context/jwt-payload. Both guards now
 * sit in shared/guards/ beside roles/policy/permissions — where the other three already were, and
 * where spec §6.9 puts guards that depend on JwtPayload.
 *
 * The list is empty and must stay empty. There is no longer a "known" inversion to grandfather: the
 * next one is a new decision, and it should be made before the import is written, not after.
 */
describe('shared/ does not depend on any module', () => {
  const SHARED = 'backend/src/shared';

  const KNOWN_INVERSIONS: ReadonlyArray<string> = [];

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
    // 8 when first measured on 2026-08-26; 2 after the request-context shapes moved; 0 on
    // 2026-08-27 once LastSeenService and both JWT guards moved into shared/. Zero is the floor:
    // this assertion can only ever be relaxed by someone editing this number on purpose.
    expect(KNOWN_INVERSIONS.length).toBe(0);
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
    // the same day, then 7 once the Temporal activity helpers moved to shared/workflows, and 0 on
    // 2026-08-27 once `public/` gave a module somewhere to publish a DTO, a factory and a const.
    expect(KNOWN_BREACHES.length).toBe(0);
    expect(breaches.length).toBe(0);
  });

  it('the sanctioned channel is actually used — most cross-module edges go through exports', () => {
    // CONTROL. If the public-API lookup were broken, everything would read as a breach and the
    // allowlist would look like the whole graph. The vast majority of edges are compliant, which is
    // what makes the 26 worth naming.
    expect(breaches.length).toBeLessThan(40);
  });
});
