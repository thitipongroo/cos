#!/usr/bin/env node
// Keycloak realm — MFA Layer 1 configuration check (ADR-067).
//
// WHY THIS EXISTS. QM-4 and spec §5.4.1 make MFA (TOTP) REQUIRED for TENANT_ADMIN and FINANCE.
// ADR-067 enforces that in two layers: Layer 1 is Keycloak-native role-conditional OTP, Layer 2 is
// the backend `acr` gate (`shared/guards/mfa-enforcement.ts`, default OFF until the realm is
// verified). On 2026-08-20 Layer 1 was found to be ENTIRELY ABSENT from the checked-in realm — the
// ADR's own Decision section says it was applied and exported, and the file says otherwise. Any
// environment provisioned from that file has neither layer active for the two privileged roles.
//
// ADR-067 concluded "nothing in CI can catch it: there is no Keycloak in the test harness, so the
// only guard against a realm that silently loses Layer 1 is reading the file." That is true of
// whether the flow WORKS — you cannot execute an authentication flow without a server. It is not
// true of whether the flow is PRESENT, which is a property of the JSON and is exactly the failure
// that occurred. This script reads the file so nobody has to remember to.
//
// WHAT IT DOES NOT DO. It does not prove a user is actually prompted for OTP, that the `acr` claim
// is emitted, or that the import is well-formed enough for Keycloak to accept. Those need a live
// server — `docs/runbooks/mfa-enforcement.md` Step 2. A PASS here means the realm still carries the
// configuration that was verified live; it is a regression guard, not a substitute for that step.
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

/** Roles that must be forced through OTP — mirrors MFA_REQUIRED_ROLES in mfa-enforcement.ts. */
const PRIVILEGED_ROLES = ['TENANT_ADMIN', 'FINANCE'];
/** The composite role the role-condition keys on (runbook Step 1.1). */
const MFA_ROLE = 'mfa-required';
/** Keycloak's provider ids. `conditional-user-configured` is the one ADR-067 rejected: it runs OTP
 *  only for users who already enrolled, so a privileged user who never enrolled signs in unchallenged. */
const COND_ROLE = 'conditional-user-role';
const COND_CONFIGURED = 'conditional-user-configured';
const OTP_BROWSER = 'auth-otp-form';
const OTP_DIRECT_GRANT = 'direct-grant-validate-otp';

const failures = [];
const notes = [];

function fail(check, detail) {
  failures.push({ check, detail });
}

/**
 * Flatten a top-level flow into every execution reachable from it, following subflows.
 * Keycloak's export misspells the subflow marker as `autheticatorFlow` — that is the wire format,
 * not a typo here.
 */
function collectExecutions(flowsByAlias, alias, seen = new Set()) {
  if (seen.has(alias)) return [];
  seen.add(alias);
  const flow = flowsByAlias.get(alias);
  if (!flow) return [];
  const out = [];
  for (const execution of flow.authenticationExecutions ?? []) {
    if (execution.autheticatorFlow && execution.flowAlias) {
      out.push({ ...execution, kind: 'subflow', parent: alias });
      out.push(...collectExecutions(flowsByAlias, execution.flowAlias, seen));
    } else {
      out.push({ ...execution, kind: 'execution', parent: alias });
    }
  }
  return out;
}

/** Resolve an execution's `authenticatorConfig` alias to its config object. */
function configFor(realm, execution) {
  if (!execution.authenticatorConfig) return null;
  return (
    (realm.authenticatorConfig ?? []).find((c) => c.alias === execution.authenticatorConfig) ?? null
  );
}

/**
 * One binding (browser or direct grant): the chain must gate OTP on the ROLE condition, and the OTP
 * step itself must be REQUIRED. A CONDITIONAL subflow whose condition never fires is not enforcement.
 */
function checkBinding(realm, flowsByAlias, { label, boundAlias, otpProvider }) {
  if (!boundAlias) {
    fail(`${label}: flow binding`, 'realm has no bound flow for this binding');
    return;
  }
  const flow = flowsByAlias.get(boundAlias);
  if (!flow) {
    fail(`${label}: flow binding`, `bound flow "${boundAlias}" is not defined in this realm file`);
    return;
  }
  if (flow.builtIn) {
    fail(
      `${label}: flow binding`,
      `bound flow "${boundAlias}" is builtIn — the stock flow carries no role condition ` +
        `(runbook Step 1.3 duplicates it before editing)`,
    );
  }

  const executions = collectExecutions(flowsByAlias, boundAlias);

  const roleConditions = executions.filter((e) => e.authenticator === COND_ROLE);
  if (roleConditions.length === 0) {
    const usesConfigured = executions.some((e) => e.authenticator === COND_CONFIGURED);
    fail(
      `${label}: role condition`,
      `no "${COND_ROLE}" in the "${boundAlias}" chain` +
        (usesConfigured
          ? ` — it still uses "${COND_CONFIGURED}", which ADR-067 rejected because it only ` +
            `challenges users who already enrolled`
          : ''),
    );
  } else {
    const boundToMfaRole = roleConditions.some((e) => {
      const cfg = configFor(realm, e);
      return cfg && Object.values(cfg.config ?? {}).includes(MFA_ROLE);
    });
    if (!boundToMfaRole) {
      fail(
        `${label}: role condition`,
        `"${COND_ROLE}" is present but no authenticatorConfig binds it to the "${MFA_ROLE}" role`,
      );
    }
  }

  const otp = executions.filter((e) => e.authenticator === otpProvider);
  if (otp.length === 0) {
    fail(`${label}: OTP step`, `no "${otpProvider}" execution in the "${boundAlias}" chain`);
  } else if (!otp.some((e) => e.requirement === 'REQUIRED')) {
    fail(
      `${label}: OTP step`,
      `"${otpProvider}" is present but not REQUIRED (found: ${otp.map((e) => e.requirement).join(', ')})`,
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

  const flowsByAlias = new Map(
    (realm.authenticationFlows ?? []).map((flow) => [flow.alias, flow]),
  );

  // 1. The composite role the conditions key on.
  const realmRoles = (realm.roles?.realm ?? []).map((r) => r.name);
  if (!realmRoles.includes(MFA_ROLE)) {
    fail('composite role', `realm role "${MFA_ROLE}" does not exist (${realmRoles.length} roles defined)`);
  } else {
    // 2. Each privileged role must actually carry it, or the condition never fires for anyone.
    for (const role of PRIVILEGED_ROLES) {
      const definition = (realm.roles?.realm ?? []).find((r) => r.name === role);
      if (!definition) {
        fail('composite role', `privileged role "${role}" is not defined in this realm`);
        continue;
      }
      const associated = definition.composites?.realm ?? [];
      if (!associated.includes(MFA_ROLE)) {
        fail('composite role', `"${role}" does not have "${MFA_ROLE}" as an associated role`);
      }
    }
  }

  // 3. Step-up mapping — without it the token carries no acr and Layer 2 has nothing to check.
  const acrMap = realm.attributes?.['acr.loa.map'];
  if (!acrMap) {
    fail('acr.loa.map', 'realm attribute "acr.loa.map" is absent — the token cannot prove OTP ran');
  } else {
    try {
      const parsed = JSON.parse(acrMap);
      if (!parsed || Object.keys(parsed).length === 0) {
        fail('acr.loa.map', `realm attribute is present but empty: ${acrMap}`);
      } else {
        notes.push(`acr.loa.map = ${acrMap} → set MFA_REQUIRED_ACR to one of: ${Object.keys(parsed).join(', ')}`);
      }
    } catch {
      fail('acr.loa.map', `realm attribute is not valid JSON: ${acrMap}`);
    }
  }

  // 4. The acr client scope must be a default scope or Keycloak never emits the claim.
  const defaultScopes = realm.defaultDefaultClientScopes ?? [];
  if (!defaultScopes.includes('acr')) {
    fail('acr client scope', '"acr" is not in defaultDefaultClientScopes');
  }

  // 5+6. Both bindings. Browser is Path B; direct grant is the path Path A tokens are minted through
  // (spec §5.4.2 step 3), and Keycloak binds the two flows separately — a browser-flow condition does
  // not run on a direct-grant token.
  checkBinding(realm, flowsByAlias, {
    label: 'browser flow (Path B)',
    boundAlias: realm.browserFlow,
    otpProvider: OTP_BROWSER,
  });
  checkBinding(realm, flowsByAlias, {
    label: 'direct grant flow (Path A)',
    boundAlias: realm.directGrantFlow,
    otpProvider: OTP_DIRECT_GRANT,
  });

  for (const note of notes) console.log(`  ${note}`);

  if (failures.length === 0) {
    console.log('✔ Keycloak MFA Layer 1 present in the realm file (ADR-067)');
    console.log('  NOTE: presence only — live behaviour is runbook Step 2, not this check.');
    process.exit(0);
  }

  console.error(`\n✖ Keycloak MFA Layer 1 incomplete — ${failures.length} finding(s):\n`);
  for (const { check, detail } of failures) {
    console.error(`  [${check}] ${detail}`);
  }
  console.error(
    '\n  Fix: docs/runbooks/mfa-enforcement.md Steps 1a/1b against a live Keycloak, then export' +
      '\n  the realm back over this file. Do NOT hand-edit the flow JSON — a malformed' +
      '\n  authentication-flow import breaks every login in the realm.\n',
  );
  process.exit(1);
}

main();
