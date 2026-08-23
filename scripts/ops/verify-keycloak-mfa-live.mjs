#!/usr/bin/env node
// Verify MFA Layer 1 on a RUNNING Keycloak — the counterpart to scripts/ci/check-keycloak-mfa-config.mjs.
//
// WHY BOTH EXIST. The CI check reads the committed realm FILE. That file is imported only on a
// Keycloak's first initialisation (`--import-realm`), so an environment that already had the realm
// never picks up a change to it — docs/runbooks/mfa-enforcement.md § "Applying to an existing
// environment" says exactly that, and then says "Re-run Step 2 against that environment. Do not
// assume it inherited anything." This is that re-run, as a command instead of a checklist.
//
// The runbook calls Step 2 "the part no script can do". That is true of the BROWSER cases — forcing
// TOTP enrolment and reading `acr=gold` out of the resulting token needs a real browser, and this
// script does not pretend otherwise. It is not true of the rest: the flow bindings, the deny
// execution, the acr.loa.map and the actual Direct Grant refusal are all reachable over HTTP, and
// those are what this checks.
//
// WHAT IT ASSERTS
//   1. `browserFlow` is bound to browser-mfa and `directGrantFlow` to direct-grant-mfa.
//   2. `acr.loa.map` has a base level AND a higher level. A single-level map is the documented
//      footgun: every token, including one that never ran OTP, comes back labelled with the only
//      level there is, and Layer 2's MFA_REQUIRED_ACR then passes everything.
//   3. The direct-grant flow carries a CONDITIONAL privileged-role subflow with a `Deny access`
//      execution, ordered BEFORE the conditional-OTP subflow.
//   4. The privileged-role condition matches TENANT_ADMIN and FINANCE.
//   5. LIVE BEHAVIOUR, with --probe: a throwaway TENANT_ADMIN is refused on Direct Grant and a
//      throwaway SITE_ENGINEER is not. This is the only assertion that proves the flow RUNS rather
//      than merely existing — configuration can be present and still not fire.
//
// The probe creates two users, tries a grant as each, and deletes them. It refuses to run against a
// realm whose name does not look like a non-production one unless --force is given: creating users
// in a customer's realm to test it is not something to do by accident.
//
// Usage:
//   KEYCLOAK_URL=http://localhost:8090 KEYCLOAK_ADMIN_USER=admin KEYCLOAK_ADMIN_PASSWORD=... \
//   node scripts/ops/verify-keycloak-mfa-live.mjs --realm construction-os-dev [--probe] [--force]

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE = (process.env['KEYCLOAK_URL'] ?? 'http://localhost:8090').replace(/\/+$/, '');
const REALM = opt('--realm', process.env['KEYCLOAK_REALM'] ?? 'construction-os-dev');
const ADMIN_USER = process.env['KEYCLOAK_ADMIN_USER'] ?? 'admin';
const ADMIN_PASSWORD = process.env['KEYCLOAK_ADMIN_PASSWORD'] ?? '';
const CLIENT_ID = process.env['KEYCLOAK_CLIENT_ID'] ?? 'cos-backend';
const CLIENT_SECRET = process.env['KEYCLOAK_CLIENT_SECRET'] ?? '';

const PRIVILEGED = ['TENANT_ADMIN', 'FINANCE'];
const failures = [];
const notes = [];

function fail(check, detail) {
  failures.push({ check, detail });
}

/**
 * Admin tokens from the master realm are short-lived (60s by default), and several steps here take
 * longer than that. Fetch a fresh one per call rather than holding one — measured the hard way:
 * a held token returned 401 half-way through a sequence.
 */
async function adminToken() {
  const res = await fetch(`${BASE}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: 'admin-cli',
      username: ADMIN_USER,
      password: ADMIN_PASSWORD,
      grant_type: 'password',
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(
      `cannot authenticate to ${BASE} as "${ADMIN_USER}" (HTTP ${res.status}). ` +
        `Set KEYCLOAK_ADMIN_USER / KEYCLOAK_ADMIN_PASSWORD.`,
    );
  }
  return (await res.json()).access_token;
}

async function admin(path, init = {}) {
  const res = await fetch(`${BASE}/admin/realms/${REALM}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await adminToken()}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  return res;
}

async function adminJson(path) {
  const res = await admin(path);
  if (!res.ok) throw new Error(`GET ${path} → HTTP ${res.status}`);
  return res.json();
}

/** A Direct Grant attempt. Returns the HTTP status and the OAuth error, if any. */
async function directGrant(username, password) {
  const res = await fetch(`${BASE}/realms/${REALM}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      username,
      password,
    }).toString(),
  });
  const body = await res.text();
  let oauthError = null;
  try {
    oauthError = JSON.parse(body).error ?? null;
  } catch {
    /* not an OAuth error body */
  }
  return { status: res.status, oauthError };
}

// ── static checks ───────────────────────────────────────────────────────────

async function checkBindingsAndAcr() {
  const realm = await adminJson('');

  if (realm.browserFlow !== 'browser-mfa') {
    fail('binding', `browserFlow is "${realm.browserFlow}", expected "browser-mfa" (Step 1a)`);
  }
  if (realm.directGrantFlow !== 'direct-grant-mfa') {
    fail(
      'binding',
      `directGrantFlow is "${realm.directGrantFlow}", expected "direct-grant-mfa" (Step 1b)`,
    );
  }

  const raw = (realm.attributes ?? {})['acr.loa.map'];
  if (!raw) {
    fail(
      'acr',
      'realm attribute acr.loa.map is absent — a token can never prove OTP ran (Step 1c)',
    );
    return;
  }
  let map;
  try {
    map = JSON.parse(raw);
  } catch {
    fail('acr', `acr.loa.map is not JSON: ${raw}`);
    return;
  }
  const levels = Object.entries(map);
  if (levels.length < 2) {
    fail(
      'acr',
      `acr.loa.map has ${levels.length} level(s): ${raw}. A single level labels EVERY token with ` +
        `it — including one that never ran OTP — so Layer 2's MFA_REQUIRED_ACR passes everything. ` +
        `Needs a base level and a higher OTP level, e.g. {"silver":1,"gold":2}.`,
    );
    return;
  }
  const highest = levels.sort((a, b) => Number(b[1]) - Number(a[1]))[0][0];
  notes.push(`acr.loa.map = ${raw} → set MFA_REQUIRED_ACR=${highest}`);
}

async function checkDirectGrantFlow() {
  let executions;
  try {
    executions = await adminJson('/authentication/flows/direct-grant-mfa/executions');
  } catch {
    fail('flow', 'flow "direct-grant-mfa" does not exist in this realm (Step 1b)');
    return;
  }

  const deny = executions.find((e) => (e.providerId ?? '') === 'deny-access-authenticator');
  if (!deny) {
    fail(
      'flow',
      'direct-grant-mfa has no "Deny access" execution. Demanding OTP here instead does not work: ' +
        'the Path A exchange sends no otp parameter, and direct-grant-validate-otp against a user ' +
        'with no OTP credential returns HTTP 500 rather than refusing cleanly.',
    );
    return;
  }

  const denyIdx = executions.indexOf(deny);
  const otpIdx = executions.findIndex((e) => (e.providerId ?? '') === 'direct-grant-validate-otp');
  if (otpIdx >= 0 && denyIdx > otpIdx) {
    fail(
      'flow',
      'the privileged-role deny subflow is ordered AFTER the conditional-OTP subflow. It must come ' +
        'first, or a privileged user is challenged for OTP before being refused.',
    );
  }

  const cond = executions.find((e) => (e.providerId ?? '') === 'conditional-user-attribute');
  if (!cond) {
    fail('flow', 'direct-grant-mfa has no "Condition - user attribute" guarding the deny');
    return;
  }
  if (!cond.authenticationConfig) {
    fail('flow', 'the privileged-role condition has no config — it would match every user');
    return;
  }
  const cfg = (await adminJson(`/authentication/config/${cond.authenticationConfig}`)).config ?? {};
  const expected = cfg['attribute_expected_value'] ?? '';
  const missing = PRIVILEGED.filter((r) => !expected.includes(r));
  if (cfg['attribute_name'] !== 'role') {
    fail('flow', `the condition matches attribute "${cfg['attribute_name']}", expected "role"`);
  }
  if (missing.length) {
    fail(
      'flow',
      `the privileged-role condition does not match ${missing.join(', ')} — its value is ` +
        `"${expected}". Those roles would be allowed onto Path A.`,
    );
  }
}

// ── live probe ──────────────────────────────────────────────────────────────

const PROBE_PASSWORD = 'Pr0be-Verify-MFA!';

async function withProbeUser(username, role, fn) {
  const create = await admin('/users', {
    method: 'POST',
    body: JSON.stringify({
      username,
      enabled: true,
      email: `${username}@probe.invalid`,
      firstName: 'MFA',
      lastName: 'Probe',
      attributes: { role: [role] },
    }),
  });
  if (!create.ok && create.status !== 409) {
    throw new Error(`could not create probe user ${username}: HTTP ${create.status}`);
  }
  const [user] = await adminJson(`/users?username=${encodeURIComponent(username)}&exact=true`);
  try {
    const pw = await admin(`/users/${user.id}/reset-password`, {
      method: 'PUT',
      body: JSON.stringify({ type: 'password', value: PROBE_PASSWORD, temporary: false }),
    });
    if (!pw.ok) throw new Error(`could not set probe password: HTTP ${pw.status}`);
    return await fn();
  } finally {
    // Always remove it, including after a throw: a leftover enabled account with a known password is
    // worse than a failed check.
    await admin(`/users/${user.id}`, { method: 'DELETE' });
  }
}

async function probe() {
  if (!CLIENT_SECRET) {
    fail('probe', 'KEYCLOAK_CLIENT_SECRET is unset — the Direct Grant probe cannot authenticate');
    return;
  }
  const looksProduction = !/-dev$|-staging$|^test/.test(REALM);
  if (looksProduction && !flag('--force')) {
    fail(
      'probe',
      `refusing to create probe users in realm "${REALM}", which does not look like a non-production ` +
        `realm. Re-run with --force if that is wrong.`,
    );
    return;
  }

  const admin = await withProbeUser('probe-mfa-admin', 'TENANT_ADMIN', () =>
    directGrant('probe-mfa-admin', PROBE_PASSWORD),
  );
  if (admin.status === 200) {
    fail(
      'probe',
      'a TENANT_ADMIN was ISSUED a token on Direct Grant. Path A is open to a privileged role — the ' +
        'flow is bound but not refusing (spec §5.4.4).',
    );
  } else {
    notes.push(`probe: TENANT_ADMIN refused on Direct Grant (HTTP ${admin.status})`);
  }

  const worker = await withProbeUser('probe-mfa-worker', 'SITE_ENGINEER', () =>
    directGrant('probe-mfa-worker', PROBE_PASSWORD),
  );
  if (worker.status !== 200) {
    fail(
      'probe',
      `a SITE_ENGINEER was REFUSED on Direct Grant (HTTP ${worker.status}, ${worker.oauthError}). ` +
        `The deny condition is too broad — this locks every field worker out of Path A.`,
    );
  } else {
    notes.push('probe: SITE_ENGINEER issued a token on Direct Grant');
  }
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Keycloak MFA Layer 1 — live check\n  server: ${BASE}\n  realm:  ${REALM}\n`);

  await checkBindingsAndAcr();
  await checkDirectGrantFlow();
  if (flag('--probe')) await probe();
  else
    notes.push(
      'static checks only — pass --probe to also prove the flow REFUSES a privileged user',
    );

  for (const n of notes) console.log(`  · ${n}`);

  if (failures.length === 0) {
    console.log(`\n✔ MFA Layer 1 is applied to the running realm "${REALM}"`);
    console.log(
      '  NOT covered here: the browser cases (forced TOTP enrolment, acr=gold in the issued token).\n' +
        '  Those need a real browser — mfa-enforcement.md Step 2, cases 1, 2, 5 and 6.',
    );
    return;
  }

  console.error(`\n✖ MFA Layer 1 — ${failures.length} finding(s) on realm "${REALM}":\n`);
  for (const { check, detail } of failures) console.error(`  [${check}] ${detail}`);
  console.error(
    '\n  A realm that already existed does NOT pick up the committed file: --import-realm runs on\n' +
      '  first initialisation only. Apply Steps 1a–1c against this environment\n' +
      '  (docs/runbooks/mfa-enforcement.md), then re-run this.\n',
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(`\n✖ could not complete the check: ${err.message}\n`);
  process.exit(2);
});
