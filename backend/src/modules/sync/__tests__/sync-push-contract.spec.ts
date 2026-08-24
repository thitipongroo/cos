// The offline-push contract, asserted rather than trusted.
//
// WHY THIS FILE EXISTS. `SyncService.push()` is a switch; the mobile client keeps its own idea of
// which entity types that switch accepts, and gates its outbox on it. For months the two disagreed:
// the client queued `purchase-request`, `delivery`, `conflict` and `tenant-settings`, none of which
// the switch had a case for, so those writes were bound for a 400 and a silent discard while the
// screen said "saved, will sync". Nothing failed. Nothing could fail — the only thing connecting the
// two lists was that somebody had once written them to match.
//
// SYNC_PUSHABLE_ENTITY_TYPES in @cos/types is now the single declaration, imported by both sides.
// This test is the other half: it asserts the switch in this service handles exactly those types and
// nothing else, so adding a case without declaring it (or declaring one without a case) fails CI.
//
// It reads the SOURCE of sync.service.ts rather than exercising the service, deliberately. Every
// alternative needs the entity type's whole dependency graph — a real Prisma transaction, a Temporal
// client, a Kafka producer — to answer a question that is purely about which cases exist, and a test
// that expensive is one that gets deleted the first time it is inconvenient. The same technique is
// used by i18n/__tests__/pluralPolyfill.spec.ts, and for the same reason.

import { readFileSync } from 'fs';
import { join } from 'path';
import { SYNC_PUSHABLE_ENTITY_TYPES } from '@cos/types';
import { PUSH_ROLES } from '../sync-authz';

/** The `case '<type>':` labels inside `SyncService.push()`. */
function pushCaseLabels(): string[] {
  const source = readFileSync(join(__dirname, '..', 'sync.service.ts'), 'utf8');

  const start = source.indexOf('async push(');
  expect(start).toBeGreaterThan(-1);
  // `push()` ends where the next method begins; `pushTask` is the private helper directly below it.
  const end = source.indexOf('private async pushTask(', start);
  expect(end).toBeGreaterThan(start);

  const body = source.slice(start, end);
  return [...body.matchAll(/case '([a-z_-]+)':/g)].map((m) => m[1]!);
}

describe('/sync/push entity-type contract', () => {
  const cases = pushCaseLabels();

  it('handles every declared pushable type', () => {
    // A type the client is allowed to queue but the server has no case for is a queued mutation
    // guaranteed to be rejected — the exact failure this contract exists to make impossible.
    expect([...cases].sort()).toEqual([...SYNC_PUSHABLE_ENTITY_TYPES].sort());
  });

  it('declares every type it handles', () => {
    // The other direction. A case with no declaration is a capability the client will never use,
    // because `mutate()` refuses to queue what is not declared.
    for (const label of cases) {
      expect(SYNC_PUSHABLE_ENTITY_TYPES as readonly string[]).toContain(label);
    }
  });

  it('has no duplicate cases', () => {
    expect(new Set(cases).size).toBe(cases.length);
  });

  // Every pushable type is a second entry point into a domain service whose REST controller carries
  // the role gate. sync-authz.ts exists because those services hold no check of their own, so a type
  // that reaches the switch without an entry there is an authorization bypass, not an oversight.
  it('gates every pushable type with the roles its REST route enforces', () => {
    for (const type of SYNC_PUSHABLE_ENTITY_TYPES) {
      expect(Object.hasOwn(PUSH_ROLES, type)).toBe(true);
      expect(PUSH_ROLES[type]!.length).toBeGreaterThan(0);
    }
  });
});
