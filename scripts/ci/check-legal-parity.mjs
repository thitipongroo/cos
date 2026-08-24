#!/usr/bin/env node
// Legal-document parity: each downloadable PDF must say exactly what its screen says
// (Privacy Policy — ADR-091; Terms of Use — ADR-092).
//
// WHY THIS EXISTS. The prose of both documents lives in two places, and that is a deliberate trade
// with a known cost. `apps/mobile/src/i18n/{en,th}.json` is what the app renders; the backend needs
// its own copy because `apps/mobile` is a standalone pnpm workspace whose i18n bundles are app
// assets, not a package the backend can import at runtime. Two copies of a legal document is exactly
// the drift <PrivacyPolicyDocument /> was extracted to prevent — so it does not rest on anyone
// remembering. This runs in the CI lint job and fails the build the moment the two disagree.
//
// WHAT WOULD GO WRONG WITHOUT IT: someone corrects a sentence on the screen, the PDF keeps the old
// one, and the platform is serving two different notices under one version number. That is not a
// style bug — under PDPA §23 the notice IS the disclosure, and for the terms it is the agreement the
// user is asked to accept; which text applies becomes an open question at exactly the moment it
// matters.
//
// Compared, per document: the version, the effective date, and every string the PDF prints against
// the i18n key it was copied from. The Thai bundle is NOT compared — both PDFs are English only
// (pdf-lib's standard fonts carry no Thai glyphs), which each metadata endpoint states outright.
//
// This file was `check-policy-parity.mjs` until the Terms of Use gained a PDF of its own (ADR-092).
// One script rather than two near-identical ones: the machinery below is the whole check, and a
// second copy of it would be one more thing to keep in step.
//
// Run: node scripts/ci/check-legal-parity.mjs

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MOBILE_EN = join(ROOT, 'apps/mobile/src/i18n/en.json');

const failures = [];
const fail = (message) => failures.push(message);

const en = JSON.parse(readFileSync(MOBILE_EN, 'utf8'));
const policy = en.privacy.policy;
const terms = en.terms;

/**
 * The two documents, each described by where its halves live and which strings must appear in both.
 *
 * `sections` maps the id the SCREEN uses to the strings the PDF is expected to carry for it. The ids
 * are what ties the halves together: the backend document declares the same `id: '…'`, so a section
 * added on one side and not the other is caught by name rather than by a string search that happens
 * to come up empty.
 */
const DOCUMENTS = [
  {
    label: 'Privacy Policy',
    adr: 'ADR-091',
    backend: 'backend/src/modules/identity/privacy-policy/policy-document.ts',
    screen: 'apps/mobile/src/components/PrivacyPolicyDocument.tsx',
    constants: ['POLICY_VERSION', 'POLICY_EFFECTIVE_DATE'],
    keyPrefix: 'privacy.policy',
    strings: [
      ['brandName', policy.brandName],
      ['complianceBadge', policy.complianceBadge],
      ['intro', policy.intro],
      ['contact.label', policy.contact.label],
    ],
    sections: {
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
      rights: [
        policy.sections.rights.title,
        policy.sections.rights.body,
        policy.sections.rights.contact,
      ],
    },
  },
  {
    label: 'Terms of Use',
    adr: 'ADR-092',
    backend: 'backend/src/modules/identity/terms-of-use/terms-document.ts',
    // The screen, not a shared component: unlike the policy, the terms are rendered at one route
    // only (pre-auth), so the copy and its version constants live in the screen itself.
    screen: 'apps/mobile/src/app/(auth)/terms-of-use.tsx',
    constants: ['TERMS_VERSION', 'TERMS_EFFECTIVE_DATE'],
    keyPrefix: 'terms',
    strings: [['intro', terms.intro]],
    // The two summary tiles and the closing banner caption are screen chrome, not clauses, and are
    // deliberately absent from the PDF — see the header of the backend document.
    sections: Object.fromEntries(
      Object.entries(terms.sections).map(([id, clause]) => [id, [clause.title, clause.body]]),
    ),
  },
];

/** `export const NAME = 'value';` — the shape both sides declare their version constants in. */
function constant(source, name) {
  const match = new RegExp(`export const ${name} = '([^']*)'`).exec(source);
  return match?.[1];
}

/**
 * The ids in a screen's `const SECTIONS … = [ … ];` block.
 *
 * Sliced to that block rather than matched across the file: both screens declare other id-bearing
 * objects (the Terms screen's two summary tiles among them), and a file-wide match would report
 * `status` as a missing clause.
 */
function screenSectionIds(source, file) {
  const start = source.indexOf('const SECTIONS');
  if (start === -1) {
    fail(`${file}: no 'const SECTIONS' block to read section ids from`);
    return [];
  }
  const end = source.indexOf('];', start);
  const block = source.slice(start, end === -1 ? undefined : end);
  return [...block.matchAll(/id: '([A-Za-z]+)'/g)].map((m) => m[1]);
}

let comparisons = 0;

for (const doc of DOCUMENTS) {
  const backendPath = join(ROOT, doc.backend);
  const screenPath = join(ROOT, doc.screen);
  const backendSource = readFileSync(backendPath, 'utf8');
  const screenSource = readFileSync(screenPath, 'utf8');

  // ── 1. The document's identity ──────────────────────────────────────────────────────────────────
  // Checked first and separately: a version mismatch is the failure that makes every other comparison
  // moot, because the two sides are then legitimately different editions.
  for (const name of doc.constants) {
    const backend = constant(backendSource, name);
    const mobile = constant(screenSource, name);
    if (backend === undefined) fail(`${doc.label}: ${name} not found in ${doc.backend}`);
    else if (mobile === undefined) fail(`${doc.label}: ${name} not found in ${doc.screen}`);
    else if (backend !== mobile) {
      fail(`${doc.label}: ${name} — backend '${backend}' vs mobile '${mobile}'`);
    }
  }

  /**
   * Every string the PDF prints, paired with the i18n key it was copied from.
   *
   * The backend file is read as TEXT rather than imported: importing it would need the backend's
   * TypeScript toolchain in a script that has to run from the repo root in the lint job. What matters
   * is that the exact sentence appears there, and `includes` on the source proves that.
   */
  const expected = doc.strings.map(([key, value]) => [`${doc.keyPrefix}.${key}`, value]);
  for (const [section, strings] of Object.entries(doc.sections)) {
    for (const value of strings) expected.push([`${doc.keyPrefix}.sections.${section}.*`, value]);
  }

  // ── 2. Every sentence ───────────────────────────────────────────────────────────────────────────
  // The policy document writes bullets as '• <text>', so a bullet's own text is what is compared; and
  // TS source escapes a single quote inside a single-quoted string, so the needle is escaped to match.
  for (const [key, value] of expected) {
    if (typeof value !== 'string') {
      fail(`${doc.label}: ${key} is missing from the mobile bundle`);
      continue;
    }
    const needle = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const alsoEscaped = value.replace(/'/g, '’');
    if (
      !backendSource.includes(value) &&
      !backendSource.includes(needle) &&
      !backendSource.includes(alsoEscaped)
    ) {
      fail(
        `${doc.label}: ${key} — the backend document does not carry this string\n      "${value.slice(0, 90)}…"`,
      );
    }
  }
  comparisons += expected.length;

  // ── 3. Section coverage ─────────────────────────────────────────────────────────────────────────
  // Guards the guard: if a section is added to the screen and not to the PDF, the loop above compares
  // only what it was told about and passes. The ids come from the screen's own SECTIONS list.
  for (const id of screenSectionIds(screenSource, doc.screen)) {
    if (!(id in doc.sections)) {
      fail(`${doc.label}: section '${id}' is on the screen but not in this script's list`);
    }
    if (!backendSource.includes(`id: '${id}'`)) {
      fail(`${doc.label}: section '${id}' is on the screen but not in the backend document`);
    }
  }
}

console.log('==> Legal document parity (ADR-091, ADR-092)');
console.log('    each downloadable PDF must say exactly what its screen says\n');

if (failures.length > 0) {
  console.error('FAILED — a screen and its PDF have drifted:\n');
  for (const message of failures) console.error(`  ✗ ${message}`);
  console.error(
    '\n  Fix BOTH sides. The screens read apps/mobile/src/i18n/{en,th}.json; the PDFs read',
  );
  console.error(
    '  backend/src/modules/identity/{privacy-policy/policy,terms-of-use/terms}-document.ts.',
  );
  process.exit(1);
}

console.log(`PASSED — ${comparisons} strings across ${DOCUMENTS.length} documents agree`);
