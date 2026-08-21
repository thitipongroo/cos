#!/usr/bin/env node
// Keycloak realm — MFA Layer 1 configuration check (ADR-067, as corrected 2026-08-22).
//
// WHY THIS EXISTS. QM-4 and spec §5.4.1 make MFA (TOTP) REQUIRED for TENANT_ADMIN and FINANCE.
// ADR-067 enforces that in two layers: Layer 1 in Keycloak, Layer 2 the backend `acr` gate
// (`shared/guards/mfa-enforcement.ts`). On 2026-08-20 Layer 1 was found ENTIRELY ABSENT from the
// checked-in realm; any environment provisioned from that file had neither layer active. This script
// reads the realm file so nobody has to remember to.
//
// ADR-067 concluded "nothing in CI can catch it: there is no Keycloak in the test harness". That is
// true of whether the flow WORKS — you cannot execute an authentication flow without a server. It is
// not true of whether the flow is PRESENT, which is a property of the JSON and is exactly the failure
// that occurred.
//
// WHAT THIS CHECKS IS NOT WHAT ADR-067 SPECIFIED, and the difference is deliberate. ADR-067 keys the
// condition on a composite realm role `mfa-required` attached to TENANT_ADMIN / FINANCE. Verified
// against a live realm on 2026-08-22: **no user holds a COS role as a Keycloak realm role** — all 29
// carry it as the `role` user ATTRIBUTE, which is what the `oidc-usermodel-attribute-mapper` turns
// into the `role` claim (spec §5.4.2). `Condition - user role` reads role mappings, so the ADR-067
// construction would have fired for nobody even if it had been applied. The working mechanism is
// `Condition - user attribute` on `role`, which reads the same source the JWT claim reads — so the
// condition and the token can never disagree.
//
// THE acr TRAP THIS ENCODES. Keycloak emits `acr` from the realm's `acr.loa.map`. Measured on a live
// realm: a password-only Direct Grant token already carries LoA 1. With the map `{"gold":1}` that the
// runbook originally prescribed, EVERY token — including one that never ran OTP — reports
// `acr=gold`, and Layer 2's default `MFA_REQUIRED_ACR=gold` then accepts everything. The map must
// therefore separate a base level from an OTP level (`{"silver":1,"gold":2}`) and the OTP subflow
// must carry a `Condition - Level of Authentication` at the higher level.
//
// WHAT IT DOES NOT DO. It does not prove a user is actually challenged, that the token carries the
// expected `acr`, or that the import is well-formed enough for Keycloak to accept. Those need a live
// server — `docs/runbooks/mfa-enforcement.md` Step 2.
//
// Run: node scripts/ci/check-keycloak-mfa-config.mjs [path-to-realm.json]

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_REALM = join(
  REPO_ROOT,
  'infrastructure',
  'keycloak',
  'realms',
  'construction-os-realm.json',
);

/** Mirrors MFA_REQUIRED_ROLES in backend/src/shared/guards/mfa-enforcement.ts. */
const PRIVILEGED_ROLES = ['TENANT_ADMIN', 'FINANCE'];
/** The claim/attribute the role travels in (spec §5.4.1, §5.4.2). */
const ROLE_ATTRIBUTE = 'role';

const COND_ATTRIBUTE = 'conditional-user-attribute';
const COND_CONFIGURED = 'conditional-user-configured';
const COND_LOA = 'conditional-level-of-authentication';
const OTP_BROWSER = 'auth-otp-form';
const DENY = 'deny-access-authenticator';

const failures = [];
const notes = [];
const fail = (check, detail) => failures.push({ check, detail });

/** Flatten a flow into every execution reachable from it. Keycloak's export misspells the subflow
 *  marker as `autheticatorFlow` — that is the wire format, not a typo here. */
function collect(flowsByAlias, alias, seen = new Set()) {
  if (seen.has(alias)) return [];
  seen.add(alias);
  const flow = flowsByAlias.get(alias);
  if (!flow) return [];
  const out = [];
  for (const e of flow.authenticationExecutions ?? []) {
    if (e.autheticatorFlow && e.flowAlias) {
      out.push({ ...e, subflowOf: alias });
      out.push(...collect(flowsByAlias, e.flowAlias, seen));
    } else {
      out.push({ ...e, subflowOf: alias });
    }
  }
  return out;
}

const configFor = (realm, e) =>
  e.authenticatorConfig
    ? ((realm.authenticatorConfig ?? []).find((c) => c.alias === e.authenticatorConfig) ?? null)
    : null;

/** A privileged-role condition: reads the `role` attribute and its expected value covers both roles. */
function privilegedConditions(realm, executions) {
  return executions.filter((e) => {
    if (e.authenticator !== COND_ATTRIBUTE) return false;
    const cfg = configFor(realm, e)?.config ?? {};
    if (cfg.attribute_name !== ROLE_ATTRIBUTE) return false;
    const expected = String(cfg.attribute_expected_value ?? '');
    return PRIVILEGED_ROLES.every((r) => expected.includes(r));
  });
}

function checkBinding(realm, flowsByAlias, { label, boundAlias, required }) {
  if (!boundAlias || !flowsByAlias.has(boundAlias)) {
    fail(`${label}: binding`, `bound flow "${boundAlias ?? '(none)'}" is not defined in this realm`);
    return;
  }
  if (flowsByAlias.get(boundAlias).builtIn) {
    fail(`${label}: binding`, `bound flow "${boundAlias}" is builtIn — it carries no MFA condition`);
  }

  const executions = collect(flowsByAlias, boundAlias);

  if (privilegedConditions(realm, executions).length === 0) {
    const usesConfigured = executions.some((e) => e.authenticator === COND_CONFIGURED);
    fail(
      `${label}: privileged condition`,
      `no "${COND_ATTRIBUTE}" on attribute "${ROLE_ATTRIBUTE}" covering ${PRIVILEGED_ROLES.join(' + ')}` +
        (usesConfigured
          ? ` — the chain relies on "${COND_CONFIGURED}", which only challenges users who already enrolled`
          : ''),
    );
  }

  for (const { provider, why } of required) {
    const found = executions.filter((e) => e.authenticator === provider);
    if (found.length === 0) fail(`${label}: ${provider}`, `missing — ${why}`);
    else if (!found.some((e) => e.requirement === 'REQUIRED'))
      fail(
        `${label}: ${provider}`,
        `present but not REQUIRED (${found.map((e) => e.requirement).join(', ')})`,
      );
  }
}

function main() {
  const realmPath = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_REALM;
  let realm;
  try {
    realm = JSON.parse(readFileSync(realmPath, 'utf8'));
  } catch (error) {
    console.error(`✖ cannot read realm file ${realmPath}: ${error.message}`);
    process.exit(1);
  }
  notes.push(`realm "${realm.realm}" — ${realmPath.replace(REPO_ROOT, '.')}`);

  const flowsByAlias = new Map((realm.authenticationFlows ?? []).map((f) => [f.alias, f]));

  // 1. acr.loa.map must separate a base level from an OTP level — see "THE acr TRAP" above.
  const raw = realm.attributes?.['acr.loa.map'];
  if (!raw) {
    fail('acr.loa.map', 'realm attribute absent — Layer 2 has no `acr` to read');
  } else {
    let map;
    try {
      map = JSON.parse(raw);
    } catch {
      map = null;
      fail('acr.loa.map', `not valid JSON: ${raw}`);
    }
    if (map) {
      const levels = Object.values(map).map(Number);
      const top = Math.max(...levels);
      if (levels.length < 2 || top < 2) {
        fail(
          'acr.loa.map',
          `${raw} maps every authentication to one level, so a token that never ran OTP reports the ` +
            `same acr as one that did. Needs a base level and a higher OTP level, e.g. {"silver":1,"gold":2}`,
        );
      } else {
        const otpAcr = Object.keys(map).find((k) => Number(map[k]) === top);
        notes.push(`acr.loa.map = ${raw} → set MFA_REQUIRED_ACR=${otpAcr} (level ${top})`);
      }
    }
  }

  // 2. The acr client scope must be default or Keycloak never emits the claim.
  if (!(realm.defaultDefaultClientScopes ?? []).includes('acr')) {
    fail('acr client scope', '"acr" is not in defaultDefaultClientScopes');
  }

  // 3. Path B — privileged users must be challenged for OTP, and that OTP must raise the LoA.
  checkBinding(realm, flowsByAlias, {
    label: 'browser flow (Path B)',
    boundAlias: realm.browserFlow,
    required: [
      { provider: OTP_BROWSER, why: 'privileged users must be challenged for TOTP' },
      { provider: COND_LOA, why: 'without it the OTP does not raise the LoA and acr cannot prove MFA' },
    ],
  });

  // 4. Path A — privileged users must not obtain a token at all (PO decision 2026-08-21).
  //    Deny rather than challenge: the Path A exchange sends no `otp` parameter, so demanding OTP
  //    here produced an uncaught AuthenticationFlowException (HTTP 500) instead of a refusal.
  checkBinding(realm, flowsByAlias, {
    label: 'direct grant flow (Path A)',
    boundAlias: realm.directGrantFlow,
    required: [{ provider: DENY, why: 'privileged roles are Path B only and must be refused here' }],
  });

  for (const n of notes) console.log(`  ${n}`);

  if (failures.length === 0) {
    console.log('✔ Keycloak MFA Layer 1 present in the realm file (ADR-067)');
    console.log('  NOTE: presence only — live behaviour is runbook Step 2, not this check.');
    process.exit(0);
  }

  console.error(`\n✖ Keycloak MFA Layer 1 incomplete — ${failures.length} finding(s):\n`);
  for (const { check, detail } of failures) console.error(`  [${check}] ${detail}`);
  console.error(
    '\n  Fix: docs/runbooks/mfa-enforcement.md Steps 1a/1b/1c against a live Keycloak, then export' +
      '\n  the realm back over this file. Do NOT hand-author the flow JSON — a malformed' +
      '\n  authentication-flow import breaks every login in the realm.\n',
  );
  process.exit(1);
}

main();
