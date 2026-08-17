#!/usr/bin/env node
// Privacy Policy parity: the downloadable PDF must say exactly what the screen says (ADR-091).
//
// WHY THIS EXISTS. The policy prose lives in two places, and that is a deliberate trade with a known
// cost. `apps/mobile/src/i18n/{en,th}.json` is what the app renders; the backend needs its own copy
// because `apps/mobile` is a standalone pnpm workspace whose i18n bundles are app assets, not a
// package the backend can import at runtime. Two copies of a legal document is exactly the drift
// <PrivacyPolicyDocument /> was extracted to prevent — so it does not rest on anyone remembering.
// This runs in the CI lint job and fails the build the moment the two disagree.
//
// WHAT WOULD GO WRONG WITHOUT IT: someone corrects a sentence on the screen, the PDF keeps the old
// one, and the platform is serving two different privacy notices under one version number. That is
// not a style bug — under PDPA §23 the notice is the disclosure, and which one applies becomes an
// open question at exactly the moment it matters.
//
// Compared: the version, the effective date, and every string the PDF prints against the i18n key it
// was copied from. The Thai bundle is NOT compared — the PDF is English only (pdf-lib's standard
// fonts carry no Thai glyphs), which the metadata endpoint states outright.
//
// Run: node scripts/ci/check-policy-parity.mjs

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BACKEND_DOC = join(ROOT, 'backend/src/modules/identity/privacy-policy/policy-document.ts');
const MOBILE_COMPONENT = join(ROOT, 'apps/mobile/src/components/PrivacyPolicyDocument.tsx');
const MOBILE_EN = join(ROOT, 'apps/mobile/src/i18n/en.json');

const failures = [];
const fail = (message) => failures.push(message);

/** `export const NAME = 'value';` — the shape both sides declare their version constants in. */
function constant(source, name) {
  const match = new RegExp(`export const ${name} = '([^']*)'`).exec(source);
  return match?.[1];
}

const backendSource = readFileSync(BACKEND_DOC, 'utf8');
const mobileSource = readFileSync(MOBILE_COMPONENT, 'utf8');
const en = JSON.parse(readFileSync(MOBILE_EN, 'utf8'));
const policy = en.privacy.policy;

// ── 1. The document's identity ────────────────────────────────────────────────────────────────────
// Checked first and separately: a version mismatch is the failure that makes every other comparison
// moot, because the two sides are then legitimately different editions.
for (const name of ['POLICY_VERSION', 'POLICY_EFFECTIVE_DATE']) {
  const backend = constant(backendSource, name);
  const mobile = constant(mobileSource, name);
  if (backend === undefined) fail(`${name} not found in ${BACKEND_DOC}`);
  else if (mobile === undefined) fail(`${name} not found in ${MOBILE_COMPONENT}`);
  else if (backend !== mobile) fail(`${name}: backend '${backend}' vs mobile '${mobile}'`);
}

/**
 * Every string the PDF prints, paired with the i18n key it was copied from.
 *
 * The backend file is read as TEXT rather than imported: importing it would need the backend's
 * TypeScript toolchain in a script that has to run from the repo root in the lint job. What matters
 * is that the exact sentence appears there, and `includes` on the source proves that.
 */
const EXPECTED = [
  ['privacy.policy.brandName', policy.brandName],
  ['privacy.policy.complianceBadge', policy.complianceBadge],
  ['privacy.policy.intro', policy.intro],
  ['privacy.policy.contact.label', policy.contact.label],
];

const SECTIONS = {
  collection: [
    policy.sections.collection.title,
    policy.sections.collection.body,
    ...Object.values(policy.sections.collection.items),
    policy.sections.collection.note,
  ],
  usage: [
    policy.sections.usage.title,
    policy.sections.usage.body,
    policy.sections.usage.quote,
    policy.sections.usage.processors,
    policy.sections.usage.residency,
  ],
  compliance: [
    policy.sections.compliance.title,
    policy.sections.compliance.body,
    ...Object.values(policy.sections.compliance.rights),
    policy.sections.compliance.deadline,
  ],
  security: [
    policy.sections.security.title,
    policy.sections.security.body,
    ...Object.values(policy.sections.security.controls),
    policy.sections.security.trustCenter,
  ],
  rights: [policy.sections.rights.title, policy.sections.rights.body, policy.sections.rights.contact],
};

for (const [section, strings] of Object.entries(SECTIONS)) {
  for (const value of strings) EXPECTED.push([`privacy.policy.sections.${section}.*`, value]);
}

// ── 2. Every sentence ─────────────────────────────────────────────────────────────────────────────
// The backend file writes bullets as '• <text>', so the marker is stripped before comparing; and TS
// source escapes a single quote inside a single-quoted string, so the needle is escaped to match.
for (const [key, value] of EXPECTED) {
  if (typeof value !== 'string') {
    fail(`${key} is missing from the mobile bundle`);
    continue;
  }
  const needle = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const alsoEscaped = value.replace(/'/g, '’');
  if (
    !backendSource.includes(value) &&
    !backendSource.includes(needle) &&
    !backendSource.includes(alsoEscaped)
  ) {
    fail(`${key}: the backend document does not carry this string\n      "${value.slice(0, 90)}…"`);
  }
}

// ── 3. Section coverage ───────────────────────────────────────────────────────────────────────────
// Guards the guard: if a section is added to the screen and not to the PDF, the loops above compare
// only what they were told about and pass. The ids come from the component's own SECTIONS list.
const screenSections = [...mobileSource.matchAll(/^\s*id: '([a-z]+)',$/gm)].map((m) => m[1]);
for (const id of screenSections) {
  if (!(id in SECTIONS)) {
    fail(`section '${id}' is on the screen but not in this script's comparison list`);
  }
  if (!backendSource.includes(`id: '${id}'`)) {
    fail(`section '${id}' is on the screen but not in the backend document`);
  }
}

console.log('==> Privacy Policy parity (ADR-091)');
console.log('    the downloadable PDF must say exactly what the screen says\n');

if (failures.length > 0) {
  console.error('FAILED — the policy screen and the policy PDF have drifted:\n');
  for (const message of failures) console.error(`  ✗ ${message}`);
  console.error(
    '\n  Fix BOTH sides. The screen reads apps/mobile/src/i18n/{en,th}.json; the PDF reads',
  );
  console.error('  backend/src/modules/identity/privacy-policy/policy-document.ts.');
  process.exit(1);
}

console.log(`PASSED — ${EXPECTED.length} strings and ${screenSections.length} sections agree`);
