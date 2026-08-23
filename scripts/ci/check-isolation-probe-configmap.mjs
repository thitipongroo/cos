#!/usr/bin/env node
// The tenant-isolation probe's ConfigMap must carry the real script — TDD sweep 2026-08-23.
//
// WHY THIS EXISTS. `configmap.yaml` embeds `isolation-probe.js`, and the CronJob mounts it and runs
// `node /scripts/isolation-probe.js`. What it embedded was a PLACEHOLDER — eight lines that print
// "ConfigMap placeholder — regenerate from isolation-probe.js" and `process.exit(1)` — against 5,587
// bytes of real script on disk. Its own comment said "rebuild this ConfigMap from isolation-probe.js
// via kustomize or helm", and nothing did.
//
// The consequence is the worst shape a monitoring failure takes. The probe is the synthetic
// cross-tenant check (§30.6): it reads across tenants on five surfaces and publishes
// `tenant_isolation_check_result` per surface. `TenantIsolationBreach` — a P0 — alerts on a value of
// **0**. A placeholder that exits 1 publishes NOTHING, and an absent series never trips a `== 0`
// rule. So the control that is supposed to notice a cross-tenant leak would have been silently
// dead, and silence is indistinguishable from "no breach".
//
// WHAT THIS CHECKS. The script embedded under `data['isolation-probe.js']` is byte-identical to
// `isolation-probe.js`, ignoring only the indentation the YAML block scalar adds. Drift in either
// direction fails: editing the .js without regenerating the ConfigMap deploys the old probe, and
// editing the ConfigMap by hand puts logic in a place nothing tests.
//
// Run: node scripts/ci/check-isolation-probe-configmap.mjs

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(REPO_ROOT, 'infrastructure', 'monitoring', 'isolation-probe');
const SCRIPT = join(DIR, 'isolation-probe.js');
const CONFIGMAP = join(DIR, 'configmap.yaml');

/**
 * The block-scalar value of `isolation-probe.js:` from the ConfigMap.
 *
 * Hand-parsed rather than via a YAML library: the CI lint job runs plain node scripts with no yaml
 * dependency available, and the shape is one known key holding one literal block.
 */
function embeddedScript(yamlText) {
  const lines = yamlText.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\s*isolation-probe\.js:\s*\|/.test(l));
  if (start === -1) return null;

  const body = [];
  let indent = null;
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') {
      body.push('');
      continue;
    }
    const lead = line.length - line.trimStart().length;
    if (indent === null) indent = lead;
    // The block ends at the first non-blank line indented less than the block's own indentation.
    if (lead < indent) break;
    body.push(line.slice(indent));
  }
  // A literal block keeps one trailing newline; trim for comparison rather than encode that here.
  return body.join('\n').replace(/\s+$/, '');
}

function main() {
  const script = readFileSync(SCRIPT, 'utf8').replace(/\s+$/, '');
  const embedded = embeddedScript(readFileSync(CONFIGMAP, 'utf8'));

  if (embedded === null) {
    console.error(
      `✖ ${CONFIGMAP} has no 'isolation-probe.js: |' block — the CronJob mounts that key and runs it`,
    );
    process.exit(1);
  }

  if (embedded === script) {
    const lines = script.split('\n').length;
    console.log(`✔ isolation-probe ConfigMap matches isolation-probe.js (${lines} lines)`);
    return;
  }

  console.error('\n✖ the isolation probe ConfigMap does not match isolation-probe.js\n');
  console.error(`  embedded: ${embedded.split('\n').length} lines, ${embedded.length} bytes`);
  console.error(`  on disk : ${script.split('\n').length} lines, ${script.length} bytes`);
  if (/placeholder/i.test(embedded)) {
    console.error(
      '\n  The embedded copy is the PLACEHOLDER. It exits 1, so the probe publishes no\n' +
        '  tenant_isolation_check_result at all — and TenantIsolationBreach alerts on a value of 0,\n' +
        '  which an absent series never produces. The P0 control would be silently dead.',
    );
  }
  console.error(
    '\n  Regenerate the block from the script, preserving its indentation:\n' +
      "    node -e \"const fs=require('fs');const s=fs.readFileSync('infrastructure/monitoring/isolation-probe/isolation-probe.js','utf8');console.log(s.replace(/^/gm,'    '))\"\n",
  );
  process.exit(1);
}

main();
