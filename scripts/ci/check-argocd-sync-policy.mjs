#!/usr/bin/env node
// Production promotion stays a manual gate — QM-16, Phase 19 readiness MANUAL-11.
//
// WHY THIS EXISTS. The property "production does not auto-sync" was a line in a checklist and a
// warning in a runbook, and both drifted. `docs/runbooks/deployment.md` carried a ⚠️ section saying
// "every Application has syncPolicy.automated … there is no separate staging Application" long after
// the staging split had been done — and the readiness check that was supposed to catch the opposite
// drift told an operator to inspect an Application named `cos-production`, which has never existed.
// Prose watched by nobody goes stale in both directions.
//
// This is the assertion, executable. A production Application that grows `syncPolicy.automated`
// fails CI, which is the regression that matters: it would turn every merge to `main` into a
// production deploy with no human in the loop.
//
// WHAT COUNTS AS PRODUCTION. Any Application whose name does not end in `-staging`. That is the
// convention the manifests use, and it is checked both ways — a `-staging` Application that has LOST
// its automation fails too, because staging that no longer follows `main` stops being the thing
// production is promoted from.
//
// Run: node scripts/ci/check-argocd-sync-policy.mjs

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARGOCD_DIR = join(REPO_ROOT, 'infrastructure', 'kubernetes', 'argocd');

/**
 * Minimal YAML multi-document reader for the two fields this needs.
 *
 * Deliberately not a YAML parser: this repository's CI lint job has no yaml dependency available to
 * plain node scripts, and the shape being read is fixed and simple — `kind`, `metadata.name`, and
 * whether a `syncPolicy.automated` key appears. Anything subtler belongs in a real parser.
 */
function readApplications(text) {
  const apps = [];
  for (const doc of text.split(/^---\s*$/m)) {
    if (!/^\s*kind:\s*Application\s*$/m.test(doc)) continue;
    const name = /^\s*name:\s*(\S+)/m.exec(doc)?.[1];
    if (!name) continue;
    // `automated:` appears only under syncPolicy in these manifests. Comments are stripped so a
    // commented-out block does not read as live configuration.
    const body = doc.replace(/^\s*#.*$/gm, '');
    apps.push({ name, automated: /^\s*automated:\s*$/m.test(body) });
  }
  return apps;
}

function main() {
  const apps = readdirSync(ARGOCD_DIR)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .flatMap((f) => readApplications(readFileSync(join(ARGOCD_DIR, f), 'utf8')));

  if (apps.length === 0) {
    console.error(
      `✖ no ArgoCD Applications found in ${ARGOCD_DIR} — this check is looking in the wrong place`,
    );
    process.exit(1);
  }

  const production = apps.filter((a) => !a.name.endsWith('-staging'));
  const staging = apps.filter((a) => a.name.endsWith('-staging'));
  const failures = [];

  for (const a of production) {
    if (a.automated) {
      failures.push(
        `${a.name} is a PRODUCTION Application with syncPolicy.automated. Every merge to main would ` +
          `deploy it with no human in the loop — QM-16 requires promotion to be a manual sync gate.`,
      );
    }
  }
  for (const a of staging) {
    if (!a.automated) {
      failures.push(
        `${a.name} has LOST syncPolicy.automated. Staging is meant to follow main continuously; if ` +
          `it does not, production is being promoted from something nobody deployed.`,
      );
    }
  }
  if (staging.length === 0) {
    failures.push(
      'there are no -staging Applications. Production would then be the only place a change lands, ' +
        'which is the gap docs/runbooks/deployment.md used to warn about.',
    );
  }

  if (failures.length === 0) {
    console.log(
      `✔ ${production.length} production Applications are manual-sync, ${staging.length} staging Applications auto-sync`,
    );
    return;
  }

  console.error(`\n✖ ArgoCD sync policy — ${failures.length} finding(s):\n`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

main();
