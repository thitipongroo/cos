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
 * SCOPE, stated honestly: this file checks clause (c) — no DB-polling loop in the package. It does
 * NOT certify the package as mobile-safe. Clause (d) is separately unmet today: `dependencies`
 * carries kafkajs, ioredis and prom-client, each of which reaches for Node built-ins (net/tls/dns/
 * fs), so importing @cos/shared from React Native would fail regardless of this file. Nothing has
 * hit it because apps/mobile does not import the package yet. That is a live gap, deliberately left
 * out of scope here rather than papered over — see the last case, which pins the dependency list so
 * the debt cannot quietly grow while it waits for a decision.
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

describe('Rule 34(d) — the dependency list is pinned while it is still unmet', () => {
  const deps = (): string[] =>
    Object.keys(
      (
        JSON.parse(fs.readFileSync(abs(`${PKG}/package.json`), 'utf8')) as {
          dependencies?: Record<string, string>;
        }
      ).dependencies ?? {},
    ).sort();

  // Rule 34(d): "Before adding any dependency to @cos/shared, verify it works in React Native/Metro
  // bundler." Three of these do not, and saying so in a comment is the point — the list is frozen so
  // that a fourth cannot be added without someone reading this and deciding.
  const KNOWN = [
    '@cos/logger',
    '@cos/types',
    '@kafkajs/confluent-schema-registry', // Node-only (kafkajs)
    'ioredis', // Node-only — net/tls
    'kafkajs', // Node-only — net/tls/dns
    'prom-client', // Node-only — fs, perf hooks
  ];

  it('has not grown a new dependency without that check', () => {
    expect(deps()).toEqual(KNOWN);
  });
});
