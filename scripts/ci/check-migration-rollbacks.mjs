#!/usr/bin/env node
// Every Prisma migration must ship a rollback script — `09-data-architecture` §9.7.1.
//
// WHY THIS EXISTS. §9.7.1 says: "A PR that adds a migration without a committed rollback script
// **must not merge** — enforced by a CI gate." No such gate existed. `.github/workflows/` contained
// no migration↔rollback check, `scripts/ci/` had no script for it, and §30.12's CI-gate table — the
// authoritative list — did not name one. Measured on 2026-08-21: 89 migrations, 83 conforming
// rollbacks. Five had none at all, and a sixth had one under the wrong filename
// (`..._file_service_rollback.sql` instead of `..._file_service.rollback.sql`), which is the more
// interesting failure: the file was there, so nobody reading the directory would notice, and no
// count of "files in rollbacks/" would either. This script checks the pairing, not the population.
//
// WHAT A MISSING ROLLBACK COSTS. A migration you cannot reverse is a deployment you cannot undo.
// QM-16 requires automated rollback on a failed production rollout; QM-12 puts production RTO at 30
// minutes. Both assume the schema can go back.
//
// WHAT THIS DOES NOT DO. It does not run the rollback, or check that it actually reverses the
// migration — §9.7.1 requires that verification against a test database, by a human, before merge.
// A pairing check cannot know whether the SQL inside is correct.
//
// Run: node scripts/ci/check-migration-rollbacks.mjs

import { readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATIONS = join(REPO_ROOT, 'backend', 'prisma', 'migrations');
const ROLLBACKS = join(REPO_ROOT, 'backend', 'prisma', 'rollbacks');

const SUFFIX = '.rollback.sql';
/** §9.7.1: `<name>` is `<action>_<subject>`; a `phaseN_` prefix is prohibited — build-phase numbers
 *  are work-tracking metadata, not part of the schema's identity. */
const PHASE_PREFIX = /^\d+_phase\d+_/i;

const failures = [];
const fail = (check, detail) => failures.push({ check, detail });

const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

function main() {
  let migrationDirs;
  try {
    migrationDirs = readdirSync(MIGRATIONS)
      .filter((n) => isDir(join(MIGRATIONS, n)))
      .sort();
  } catch (error) {
    console.error(`✖ cannot read ${MIGRATIONS}: ${error.message}`);
    process.exit(1);
  }

  let rollbackFiles;
  try {
    rollbackFiles = readdirSync(ROLLBACKS)
      .filter((n) => !isDir(join(ROLLBACKS, n)))
      .sort();
  } catch (error) {
    console.error(`✖ cannot read ${ROLLBACKS}: ${error.message}`);
    process.exit(1);
  }

  const rollbackSet = new Set(rollbackFiles);
  const expected = new Set(migrationDirs.map((d) => `${d}${SUFFIX}`));

  // 1. Every migration has its rollback, under exactly the §9.7.1 name.
  for (const dir of migrationDirs) {
    const want = `${dir}${SUFFIX}`;
    if (rollbackSet.has(want)) continue;

    // Name the near-miss when there is one — that is the case that hides in a directory listing.
    const nearMiss = rollbackFiles.find(
      (f) => f.startsWith(dir) || f.replace(/[^a-z0-9]/gi, '') === want.replace(/[^a-z0-9]/gi, ''),
    );
    fail(
      'missing rollback',
      nearMiss
        ? `${dir} → expected rollbacks/${want}, found rollbacks/${nearMiss} (wrong name, so it does not pair)`
        : `${dir} → rollbacks/${want} does not exist`,
    );
  }

  // 2. Nothing orphaned in rollbacks/ — a rollback for a migration that is not there means either a
  //    deleted migration (history is immutable; that is its own problem) or a typo in the name.
  for (const file of rollbackFiles) {
    if (expected.has(file)) continue;
    fail(
      'orphan rollback',
      `rollbacks/${file} pairs with no migration directory` +
        (file.endsWith(SUFFIX) ? '' : ` (and does not end in "${SUFFIX}")`),
    );
  }

  // 3. §9.7.1 migration naming — no phaseN_ prefix.
  for (const dir of migrationDirs) {
    if (PHASE_PREFIX.test(dir)) {
      fail(
        'migration name',
        `${dir} is prefixed with a build-phase number; §9.7.1 prohibits it (the directory name is ` +
          `stored in _prisma_migrations.migration_name, so renaming it later needs an UPDATE on every environment)`,
      );
    }
  }

  console.log(`  ${migrationDirs.length} migrations · ${rollbackFiles.length} rollback files`);

  if (failures.length === 0) {
    console.log('✔ every migration has a rollback script (§9.7.1)');
    console.log('  NOTE: pairing only — that the SQL reverses the migration is verified against a');
    console.log('  test database before merge, per §9.7.1. No script can check that.');
    process.exit(0);
  }

  console.error(`\n✖ §9.7.1 rollback requirement — ${failures.length} finding(s):\n`);
  for (const { check, detail } of failures) console.error(`  [${check}] ${detail}`);
  console.error(
    '\n  Add backend/prisma/rollbacks/<migration-dir-name>.rollback.sql. It must restore the prior' +
      '\n  schema, be idempotent, and be executed against a test database before the PR merges.\n',
  );
  process.exit(1);
}

main();
