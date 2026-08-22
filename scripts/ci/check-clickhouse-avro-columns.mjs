#!/usr/bin/env node
// The ClickHouse Kafka engine tables must declare EVERY field of the event they read — TDD OQ-47.
//
// WHY THIS EXISTS. `02-kafka-tables.sql` used to declare only "the fields needed for aggregation",
// two or three out of six or eight. That is not how the AvroConfluent reader works: a Tuple that
// omits fields does not project them away, it mis-reads the record. And because every table sets
// `kafka_skip_broken_messages = 100`, the mis-read is discarded with no exception, no DLQ entry and
// no metric that moves. Measured on ClickHouse 26.3: five messages consumed, zero exceptions, zero
// rows written. The three tables the executive and PM dashboards read had been empty since they were
// created and nothing anywhere said so.
//
// So the pairing this script enforces is not tidiness. It is the only thing standing between a
// schema change and another silent outage of the same shape: add a field to an event's `.avsc`,
// forget the DDL, and that event stops reaching the warehouse — quietly.
//
// WHAT THIS CHECKS. For every `CREATE TABLE … ENGINE = Kafka` in the DDL: the topic pattern names an
// event that has a committed `.avsc`, and the declared `payload Tuple(...)` lists exactly that
// schema's payload fields, in order. Order matters as well as membership — the reader maps a Tuple
// positionally once names diverge.
//
// WHAT THIS DOES NOT DO. It does not check TYPES, and it does not connect to a broker. A Tuple that
// names every field but types one wrongly still passes here and fails at runtime. The end-to-end
// proof is a real event through a real ClickHouse; this is the cheap gate that catches the common
// case in CI.
//
// Run: node scripts/ci/check-clickhouse-avro-columns.mjs

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DDL = join(REPO_ROOT, 'infrastructure', 'clickhouse', 'initdb.d', '02-kafka-tables.sql');
const AVRO_DIR = join(REPO_ROOT, 'packages', '@cos', 'shared', 'src', 'avro');

/** Split a Tuple body on top-level commas — nested `Tuple(...)` and `Array(...)` must survive. */
function topLevelFields(body) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out.filter(Boolean).map((f) => f.split(/\s+/)[0]);
}

/**
 * The event type a topic pattern subscribes to.
 *
 * Patterns look like `^[^.]+\.site\.issue\.created\.v1$` — the `^[^.]+\.` is the per-tenant prefix
 * (§7.3), and what follows is the canonical event type with its dots escaped.
 */
function eventTypeFromPattern(pattern) {
  const m = /^\^\[\^\.\]\+\\\.(.+)\$$/.exec(pattern);
  if (!m) return null;
  return m[1].replaceAll('\\.', '.');
}

function main() {
  // Strip `--` line comments before parsing. The DDL carries explanatory comments INSIDE the Tuple
  // bodies (why `location` is an inner-nullable tuple, for instance), and leaving them in makes the
  // top-level-comma split treat prose as field names. Found by this script failing on its own file.
  // `.` does not match a newline in JS by default, so this strips each comment to end of line.
  const ddl = readFileSync(DDL, 'utf8').replace(/--.*/g, '');
  const tables = [
    ...ddl.matchAll(
      /CREATE TABLE IF NOT EXISTS (analytics\.\w+)\s*\(([\s\S]*?)\)\s*ENGINE = Kafka[\s\S]*?kafka_topic_list\s*=\s*'([^']+)'/g,
    ),
  ];

  const failures = [];

  if (tables.length === 0) {
    failures.push({
      check: 'parse',
      detail: `no Kafka engine tables found in ${DDL} — the regex above no longer matches the file`,
    });
  }

  for (const [, table, cols, pattern] of tables) {
    const eventType = eventTypeFromPattern(pattern);
    if (!eventType) {
      failures.push({
        check: 'topic-pattern',
        detail:
          `${table}: kafka_topic_list is '${pattern}', which is not a per-tenant pattern. ` +
          `Expected '^[^.]+\\.{event_type}$' — a literal name matches no real topic, because ` +
          `topics are '{tenant_id}.{event_type}' (§7.3).`,
      });
      continue;
    }

    const avsc = join(AVRO_DIR, `${eventType}.avsc`);
    if (!existsSync(avsc)) {
      failures.push({
        check: 'schema-missing',
        detail: `${table}: subscribes to ${eventType} but there is no ${eventType}.avsc`,
      });
      continue;
    }

    const payloadField = JSON.parse(readFileSync(avsc, 'utf8')).fields.find(
      (f) => f.name === 'payload',
    );
    if (!payloadField) {
      failures.push({ check: 'schema-shape', detail: `${eventType}.avsc has no payload field` });
      continue;
    }
    const expected = payloadField.type.fields.map((f) => f.name);

    const tupleBody = /payload\s+Tuple\(([\s\S]*)\)\s*$/.exec(cols.trim());
    if (!tupleBody) {
      failures.push({ check: 'ddl-shape', detail: `${table}: no 'payload Tuple(...)' column` });
      continue;
    }
    const declared = topLevelFields(tupleBody[1]);

    const missing = expected.filter((f) => !declared.includes(f));
    const extra = declared.filter((f) => !expected.includes(f));
    const misordered =
      missing.length === 0 && extra.length === 0 && declared.join(',') !== expected.join(',');

    if (missing.length) {
      failures.push({
        check: 'payload-incomplete',
        detail:
          `${table}: payload Tuple omits ${missing.join(', ')} (declared ${declared.length} of ` +
          `${expected.length}). The reader mis-reads the record and skip_broken_messages hides it.`,
      });
    }
    if (extra.length) {
      failures.push({
        check: 'payload-unknown',
        detail: `${table}: payload Tuple declares ${extra.join(', ')}, absent from ${eventType}.avsc`,
      });
    }
    if (misordered) {
      failures.push({
        check: 'payload-order',
        detail:
          `${table}: payload Tuple has the right fields in the wrong order. ` +
          `Expected ${expected.join(', ')}.`,
      });
    }
  }

  if (failures.length === 0) {
    console.log(
      `✔ ${tables.length} ClickHouse Kafka tables match their Avro schemas (topic pattern + full payload)`,
    );
    return;
  }

  console.error(`\n✖ ClickHouse ↔ Avro contract — ${failures.length} finding(s):\n`);
  for (const { check, detail } of failures) console.error(`  [${check}] ${detail}`);
  console.error(
    '\n  Regenerate the payload Tuple from the .avsc. Declare every field, in schema order —\n' +
      '  a partial Tuple does not project, it mis-reads, and kafka_skip_broken_messages makes\n' +
      '  that silent (TDD OQ-47).\n',
  );
  process.exit(1);
}

main();
