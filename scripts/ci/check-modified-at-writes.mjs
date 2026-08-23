#!/usr/bin/env node
// Every UPDATE of a table that has `modified_at` must set it.
//
// WHY THIS EXISTS. `GET /sync/delta` pages each entity with `WHERE {deltaColumn} > $cursor`, and for
// four of the six registered entity types that column is `modified_at`. A write that changes a row
// without moving `modified_at` therefore does not merely lose an audit field — it makes the change
// INVISIBLE to every device, permanently, and looks like a successful write from every angle: the
// API returns 200, the row is correct in the database, and the handset simply never hears about it.
//
// That failure has already happened twice in this repository, in the same shape:
//
//   projects.tasks and site_ops.incidents had NO modified_at at all, so the registry paged them on
//   created_at. Edited tasks and acknowledged safety incidents could not reach a device (fixed
//   2026-08-23, migration 20260823000002).
//
//   cost_transactions.budget_line_id existed from the first finance migration and nothing ever
//   wrote it, so every per-category budget figure read zero for months — including a task-completion
//   gate that blocks at ratio >= 1.0 and had therefore never once fired (TDD OQ-50).
//
// Both were columns whose correctness depended on every writer remembering them, with nothing
// checking. This is that check for the first class. The product-owner decision on 2026-08-23 was to
// keep `modified_at` maintained in application code, as every existing table does, rather than add
// the first database trigger in the schema — on the condition that CI enforces it.
//
// WHAT IT DOES. Reads the migration history for tables that have (or gain) a `modified_at` column,
// then scans application source for `UPDATE <that table> SET ... WHERE`. Any such statement whose
// SET clause does not assign `modified_at` fails the build.
//
// WHAT IT DOES NOT DO. It does not parse SQL. It matches statement text, so a query assembled from
// fragments across several lines of TypeScript would slip past — which is why the failure message
// names the file and line rather than claiming the codebase is clean. It also cannot see writes made
// outside this repository (psql, an ops runbook, a migration): those are exactly what a trigger
// would have covered and this does not, and that trade was the decision.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const MIGRATIONS = join(ROOT, 'backend/prisma/migrations');
const SOURCE_ROOTS = ['backend/src', 'services'];

/**
 * Schema-qualified tables that carry a `modified_at` column, read from the migration history.
 *
 * The history is not uniform, and the un-uniform part is the part that matters. Phase 6 created
 * `site_reports` and `issues` UNQUALIFIED — they landed in `public` — and a later migration moved
 * them with `ALTER TABLE public.x SET SCHEMA site_ops`. A reader that only understood
 * `CREATE TABLE <schema>.<table>` silently found 3 tables instead of 5, and a gate that silently
 * covers less than it claims is worse than no gate: it reports a tick either way.
 */
function tablesWithModifiedAt() {
  const bare = new Set(); // table name -> has modified_at, schema not yet known
  const qualified = new Set(); // already schema-qualified
  const moved = new Map(); // bare name -> schema it was moved to

  for (const dir of readdirSync(MIGRATIONS).sort()) {
    const file = join(MIGRATIONS, dir, 'migration.sql');
    let sql;
    try {
      sql = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    // CREATE TABLE [IF NOT EXISTS] [<schema>.]<table> ( ... modified_at ... )
    const created =
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+(?:\.[a-z_]+)?)\s*\(([\s\S]*?)\n\s*\)\s*;/gi;
    for (const m of sql.matchAll(created)) {
      if (!/\bmodified_at\b/i.test(m[2])) continue;
      const name = m[1].toLowerCase();
      if (name.includes('.')) qualified.add(name);
      else bare.add(name);
    }

    // ALTER TABLE [<schema>.]<table> ADD COLUMN [IF NOT EXISTS] modified_at
    const altered =
      /ALTER\s+TABLE\s+([a-z_]+(?:\.[a-z_]+)?)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?modified_at\b/gi;
    for (const m of sql.matchAll(altered)) {
      const name = m[1].toLowerCase();
      if (name.includes('.')) qualified.add(name);
      else bare.add(name);
    }

    // ALTER TABLE public.<table> SET SCHEMA <schema>
    const relocated = /ALTER\s+TABLE\s+public\.([a-z_]+)\s+SET\s+SCHEMA\s+([a-z_]+)/gi;
    for (const m of sql.matchAll(relocated)) {
      moved.set(m[1].toLowerCase(), m[2].toLowerCase());
    }
  }

  const tables = new Set(qualified);
  for (const name of bare) {
    const schema = moved.get(name);
    if (!schema) {
      // Still in public, or moved by something this reader cannot see. Say so rather than drop it.
      console.error(
        `  ! ${name} has modified_at and no SET SCHEMA — treating it as public.${name}`,
      );
      tables.add(`public.${name}`);
      continue;
    }
    tables.add(`${schema}.${name}`);
  }
  return tables;
}

function sourceFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist' || name === '__tests__') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|mts|js|mjs)$/.test(name) && !/\.(spec|test)\./.test(name)) out.push(full);
  }
  return out;
}

const tables = tablesWithModifiedAt();
if (tables.size === 0) {
  console.error('✘ no table with a modified_at column found — the migration reader is broken');
  process.exit(1);
}

const violations = [];

for (const rootRel of SOURCE_ROOTS) {
  for (const file of sourceFiles(join(ROOT, rootRel))) {
    const text = readFileSync(file, 'utf8');

    for (const table of tables) {
      // The SET clause runs from the table name to the statement's WHERE. Anything without a WHERE
      // is not a targeted row update and is left to review.
      const stmt = new RegExp(
        `UPDATE\\s+${table.replace('.', '\\.')}\\s+SET\\b([\\s\\S]*?)\\bWHERE\\b`,
        'gi',
      );
      for (const m of text.matchAll(stmt)) {
        if (/\bmodified_at\s*=/i.test(m[1])) continue;
        const line = text.slice(0, m.index).split('\n').length;
        violations.push({ file: relative(ROOT, file).replace(/\\/g, '/'), line, table });
      }
    }
  }
}

if (violations.length > 0) {
  console.error('✘ UPDATE statements that do not set modified_at:\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} — UPDATE ${v.table} ... SET without modified_at`);
  }
  console.error(`
  ${v_plural(violations.length)} the row changes and /sync/delta never reports it, because the delta
  query pages on modified_at. Add \`modified_at = now()\` to the SET clause.`);
  process.exit(1);
}

function v_plural(n) {
  return n === 1 ? 'For this write,' : 'For each of these writes,';
}

console.log(
  `✔ every UPDATE of the ${tables.size} tables carrying modified_at sets it (sync delta correctness)`,
);
