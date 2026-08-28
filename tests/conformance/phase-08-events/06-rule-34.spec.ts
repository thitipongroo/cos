/**
 * Rule 34 (master:5841-5851) — @cos/shared must stay framework-agnostic.
 *
 * The rule exists because the package is meant to be imported by mobile (React Native/Metro), the
 * PWA service worker AND Node services. Clause (c) names the exact failure this file guards:
 *
 *     (c) Classes/functions that require a Node.js runtime (e.g., OutboxPoller which polls a DB)
 *         must be moved to backend/src/ — NOT placed in @cos/shared.
 *
 * That is not hypothetical wording. An `OutboxPoller` — the very class the rule names — was defined
 * in src/kafka/outbox.ts and exported from src/index.ts until 2026-08-27, duplicating
 * backend/src/shared/events/outbox-poller.service.ts, which is the one registered in EventsModule
 * and the only one that ever ran. The package README stated the rule correctly the whole time, a few
 * lines from the code breaking it. A prose rule that nothing executes is how that happens.
 *
 * SCOPE. When this file was written on 2026-08-26 it could only check clause (c), and said so: the
 * package could not have been mobile-safe anyway, since kafkajs, ioredis and prom-client all reach
 * for Node built-ins. Rule 34 was amended on 2026-08-27 once the reason came clear — apps/mobile and
 * apps/web never imported @cos/shared, and the client-safe code had long since gone into @cos/types,
 * @cos/schemas, @cos/ui-logic and @cos/financial. The rule had been guarding the wrong package.
 *
 * So this file now checks two different things:
 *   1. clause (c) against @cos/shared — no DB-polling loop, for the reason that survives the
 *      amendment: a polling loop belongs with the process that owns its lifecycle.
 *   2. the amended obligation against the packages that DO ship to a client, plus the edge that
 *      would undo the whole arrangement — a Node-only package appearing in their dependencies, or
 *      in apps/mobile's or apps/web's.
 */
import * as fs from 'fs';
import * as path from 'path';

import { abs } from '../helpers';

const PKG = 'packages/@cos/shared';
const SRC = `${PKG}/src`;

const sourceFiles = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        walk(full);
      } else if (entry.name.endsWith('.ts')) {
        out.push(full);
      }
    }
  };
  walk(abs(SRC));
  return out;
};

describe('Rule 34(c) — no Node-runtime polling loop inside @cos/shared', () => {
  it('reads the package source, so a moved directory cannot silently empty this suite', () => {
    expect(sourceFiles().length).toBeGreaterThan(10);
  });

  it('declares no OutboxPoller — the class Rule 34(c) names by name', () => {
    const offenders = sourceFiles().filter((f) =>
      /\b(class|const|function)\s+OutboxPoller\b/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('exports no OutboxPoller from the package entry point', () => {
    expect(fs.readFileSync(abs(`${SRC}/index.ts`), 'utf8')).not.toMatch(/\bOutboxPoller\b/);
  });

  it('keeps OutboxPublisher, which is the half that belongs here', () => {
    // The write side runs inside someone else's transaction and needs no runtime of its own, so
    // deleting it too would over-correct. Rule 34(c) is about the polling loop, not the pattern.
    expect(fs.readFileSync(abs(`${SRC}/index.ts`), 'utf8')).toMatch(/\bOutboxPublisher\b/);
  });

  it('starts no recurring timer anywhere in the package', () => {
    // The general shape of the violation, not just the one class that was caught. A setInterval, or
    // a setTimeout that reschedules itself, is a background loop — it needs a process that stays
    // alive, which a mobile bundle and a service worker do not promise.
    const offenders: string[] = [];
    for (const f of sourceFiles()) {
      if (/\bsetInterval\s*\(/.test(fs.readFileSync(f, 'utf8'))) {
        offenders.push(path.relative(abs(PKG), f));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('holds no raw SQL — a DB query in this package means the wrong half landed here', () => {
    const offenders: string[] = [];
    for (const f of sourceFiles()) {
      const src = fs.readFileSync(f, 'utf8');
      // OutboxPublisher builds the one INSERT the pattern requires; it runs on a caller-supplied
      // transaction handle and is the documented exception.
      if (f.endsWith('kafka/outbox.ts')) continue;
      if (/\$queryRaw|\$executeRaw|SELECT\s+.*\s+FROM\s+\w+\.\w+/i.test(src)) {
        offenders.push(path.relative(abs(PKG), f));
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('Rule 34 — the client-safe packages stay importable from a mobile bundle', () => {
  // The set apps/mobile and apps/web actually depend on. If an app grows a dependency on a package
  // outside this list, the last case in this file is what notices.
  const CLIENT_SAFE = ['types', 'schemas', 'ui-logic', 'financial'];

  // Everything else under packages/@cos. These may use net/tls/fs freely — they run on a server —
  // and must never be reachable from a bundle.
  const NODE_ONLY = [
    'shared',
    'database',
    'logger',
    'tracing',
    'config',
    'rbac',
    'validation',
    'test-utils',
  ];

  const depsOf = (pkgJsonRel: string): string[] =>
    Object.keys(
      (
        JSON.parse(fs.readFileSync(abs(pkgJsonRel), 'utf8')) as {
          dependencies?: Record<string, string>;
        }
      ).dependencies ?? {},
    );

  it('accounts for every @cos package, so a new one cannot arrive unclassified', () => {
    const onDisk = fs
      .readdirSync(abs('packages/@cos'), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    expect(onDisk).toEqual([...CLIENT_SAFE, ...NODE_ONLY].sort());
  });

  it.each(CLIENT_SAFE)('@cos/%s depends on no Node-only package', (name) => {
    const forbidden = NODE_ONLY.map((n) => `@cos/${n}`);
    expect(
      depsOf(`packages/@cos/${name}/package.json`).filter((d) => forbidden.includes(d)),
    ).toEqual([]);
  });

  it.each(CLIENT_SAFE)('@cos/%s pulls in nothing that needs a Node runtime', (name) => {
    // Third-party deps too, not just sibling packages. The four are deliberately tiny — zod,
    // decimal.js, or nothing at all — and that is the property worth keeping: every addition here is
    // shipped to a phone.
    const KNOWN_MOBILE_SAFE = ['zod', 'decimal.js'];
    const third = depsOf(`packages/@cos/${name}/package.json`).filter(
      (d) => !d.startsWith('@cos/'),
    );
    expect(third.filter((d) => !KNOWN_MOBILE_SAFE.includes(d))).toEqual([]);
  });

  it.each(['mobile', 'web'])('apps/%s depends on no Node-only package', (app) => {
    // The edge that matters most, and the one nothing checked before: @cos/shared carries kafkajs,
    // ioredis and prom-client, so a single line here is a broken Metro build — the exact failure
    // Rule 34 was written to prevent, finally asserted where it can actually occur.
    const forbidden = NODE_ONLY.map((n) => `@cos/${n}`);
    const pkg = JSON.parse(fs.readFileSync(abs(`apps/${app}/package.json`), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const all = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    expect(all.filter((d) => forbidden.includes(d))).toEqual([]);
  });

  it('@cos/shared stays where it belongs — Node consumers only', () => {
    // Stated as an allowlist rather than inferred, so adding a consumer is a decision someone makes
    // here on purpose.
    const consumers = ['backend', 'services/file-service'];
    for (const c of consumers) {
      expect(depsOf(`${c}/package.json`)).toContain('@cos/shared');
    }
  });
});
