#!/usr/bin/env node
// Every committed Avro event schema must have a producer — TDD OQ-50.
//
// WHY THIS EXISTS. Adding an event to Construction OS touches five places: the `.avsc`, the
// `EVENT_AVSC_MAP` in `topic-catalog.ts`, a generated TypeScript type exported from `@cos/shared`, a
// row in `infrastructure/kafka/topics.yaml`, and the subject list in
// `scripts/readiness/check-schema-registry.sh`. Nothing checks the sixth: that something actually
// EMITS it.
//
// Two events had all five and no producer. `finance.budget.exceeded.v1` and
// `finance.cashflow_risk.detected.v1` were specified in §32.4, given schemas, given topics, and
// listed in a READINESS GATE that refuses to pass until they are registered in the Schema Registry —
// for events that nothing has ever published. Measured 2026-08-23: 2 of 61.
//
// BOTH were built later the same day and came off the list — each time, the bidirectional half of
// this check is what noticed, failing with "listed in DECLARED_ONLY but now HAS a producer" rather
// than leaving a note that quietly stopped being true.
//
// The failure mode is not a crash. It is a topic that exists, a schema that validates, a consumer
// that could be written against it, and a dashboard row that stays at zero forever with nothing to
// say whether that means "quiet" or "never built". A reader has no way to tell a live event from a
// design sketch, because they look identical everywhere except the one place nobody looks.
//
// WHAT THIS CHECKS. For every `.avsc` in `packages/@cos/shared/src/avro`, the canonical event type
// must appear somewhere in application source — or be listed in DECLARED_ONLY below with a reason.
//
// WHAT THIS DOES NOT DO. It does not prove the reference is a PUBLISH rather than a consumer
// subscription, and it does not run anything. An event only ever consumed would pass here. The check
// is deliberately cheap: it catches "nobody has heard of this event", which is the case that got
// through, and it makes the declared-only ones say so out loud.
//
// Run: node scripts/ci/check-event-producers.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AVRO_DIR = join(REPO_ROOT, 'packages', '@cos', 'shared', 'src', 'avro');

/**
 * Trees that count as application source. Build output and tests deliberately excluded.
 *
 * `packages/@cos/shared` is NOT here, and that is the point of the check. It holds the registries —
 * `topic-catalog.ts` maps every event to its schema, `index.ts` re-exports every generated type —
 * so counting it as a reference makes every declared event look produced, which is the exact
 * illusion this script exists to break. Producers live in the application trees below.
 */
const SOURCE_ROOTS = ['backend/src', 'services', 'apps', 'libs'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.go', '.py', '.js', '.mjs']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '__tests__', 'coverage', '.next']);

/**
 * Schemas that are DELIBERATELY declared without a producer, each with the reason and what would
 * have to be true to build one. A name may sit here only because someone decided it should — never
 * to silence the check.
 */
const DECLARED_ONLY = new Map([
  // Empty since 2026-08-23: both original entries grew producers the same day, and this check
  // caught each transition before a human did — "listed in DECLARED_ONLY but now HAS a producer".
  //
  // Keep the mechanism. A schema with no producer still gets a topic, a generated type and a slot in
  // the Schema Registry readiness gate, so it is indistinguishable from a live event everywhere
  // except here; the next one added without a producer must say why, in this list, or fail.
]);

/** `base-event-envelope` is the shared envelope, not an event — it has no producer by definition. */
const NOT_AN_EVENT = new Set(['base-event-envelope']);

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(join(dir, entry.name));
    } else if (SOURCE_EXTENSIONS.has(extname(entry.name)) && !entry.name.includes('.spec.')) {
      yield join(dir, entry.name);
    }
  }
}

function main() {
  const events = readdirSync(AVRO_DIR)
    .filter((f) => f.endsWith('.avsc'))
    .map((f) => f.slice(0, -'.avsc'.length))
    .filter((e) => !NOT_AN_EVENT.has(e));

  if (events.length === 0) {
    console.error(
      `✖ no .avsc schemas found in ${AVRO_DIR} — this check is not looking where it thinks`,
    );
    process.exit(1);
  }

  // One pass over the source tree, then substring lookups: the alternative is one grep per event.
  let corpus = '';
  for (const root of SOURCE_ROOTS) {
    for (const file of walk(join(REPO_ROOT, root))) {
      corpus += readFileSync(file, 'utf8');
    }
  }

  const unreferenced = events.filter((e) => !corpus.includes(e));
  const failures = [];

  for (const e of unreferenced) {
    if (!DECLARED_ONLY.has(e)) {
      failures.push(
        `${e}: has a committed .avsc but appears nowhere in application source. Either write the ` +
          `producer, or add it to DECLARED_ONLY in this script with the reason it is declared and ` +
          `what would have to be true to build it.`,
      );
    }
  }

  // A DECLARED_ONLY entry that HAS grown a producer is also a finding: the list is documentation,
  // and a stale entry tells the next reader an event is unbuilt when it is live.
  for (const [e, reason] of DECLARED_ONLY) {
    if (!events.includes(e)) {
      failures.push(`${e}: listed in DECLARED_ONLY but has no .avsc — remove the stale entry.`);
    } else if (!unreferenced.includes(e)) {
      failures.push(
        `${e}: listed in DECLARED_ONLY but now HAS a producer. Remove it from the list — the note ` +
          `("${reason.slice(0, 60)}…") is no longer true.`,
      );
    }
  }

  if (failures.length === 0) {
    const built = events.length - DECLARED_ONLY.size;
    console.log(
      `✔ ${built} of ${events.length} event schemas have a producer; ` +
        `${DECLARED_ONLY.size} declared-only, each with a recorded reason`,
    );
    for (const [e] of DECLARED_ONLY) console.log(`    declared-only: ${e}`);
    return;
  }

  console.error(`\n✖ Avro schema ↔ producer — ${failures.length} finding(s):\n`);
  for (const detail of failures) console.error(`  ${detail}`);
  console.error(
    '\n  A schema with no producer still gets a topic, a type, and a slot in the Schema Registry\n' +
      '  readiness gate — so it is indistinguishable from a live event everywhere except here\n' +
      '  (TDD OQ-50).\n',
  );
  process.exit(1);
}

main();
