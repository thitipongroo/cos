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
//      execution, ordered BEFORE the conditional-OTP subflow; the browser flow a CONDITIONAL subflow
//      with the OTP form.
//   4. In each of those subflows, exactly one REQUIRED `Condition - user attribute` that holds for
//      `mfa_required` = `true` and not for `false` / absent, evaluated as Keycloak does (`regex`, `not`), and
//      no other attribute condition ANDed beside it. The backend sets the attribute for TENANT_ADMIN / FINANCE
//      held as a primary OR additional role (ADR-110 rounds 5–6; the condition used to read `role`).
//   5. LIVE BEHAVIOUR, with --probe: a throwaway TENANT_ADMIN and a throwaway SITE_ENGINEER carrying
//      `mfa_required` (an additional privileged role) are refused on Direct Grant with HTTP 401, and a plain
//      SITE_ENGINEER is not. This is the only assertion that proves the flow RUNS rather
//      than merely existing — configuration can be present and still not fire.
//
// The probe creates three users, tries a grant as each, and deletes them. It refuses to run against a
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

/** Whether a `conditional-user-attribute` config holds for an attribute value, as Keycloak evaluates it:
 *  `regex` on → the whole value matches the pattern (Java String.matches); off → equality; `not` inverts. */
function conditionHolds(cfg, value) {
  const expected = String(cfg['attribute_expected_value'] ?? '');
  let matches;
  if (String(cfg['regex']) === 'true') {
    try {
      matches = new RegExp(`^(?:${expected})$`).test(value);
    } catch {
      matches = false; // an invalid pattern matches nothing in Keycloak either
    }
  } else {
    matches = expected === value;
  }
  return String(cfg['not']) === 'true' ? !matches : matches;
}

/** The flattened executions of a flow, each with `parent` — the subflow entry it sits in. The Admin API gives no
 *  parent reference, only order and `level`: an entry's parent is the latest subflow one level up. */
async function executionsOf(alias) {
  const list = await adminJson(`/authentication/flows/${encodeURIComponent(alias)}/executions`);
  const open = [];
  return list.map((e) => {
    open.length = e.level;
    const withParent = { ...e, parent: e.level > 0 ? open[e.level - 1] : null };
    if (e.authenticationFlow) open[e.level] = withParent; // so `parent.parent` walks up
    return withParent;
  });
}

/** The CONDITIONAL subflow holding the OTP form / Deny must be guarded by exactly one REQUIRED attribute condition
 *  that holds for `mfa_required` = `true` and not for `false` or an absent value (ADR-110 rounds 5–6). Any other
 *  attribute condition beside it is ANDed with it — a `role` one left there means an additional-only holder of
 *  TENANT_ADMIN / FINANCE is not challenged. */
async function checkGate(label, executions, gate, allowed) {
  const at = `${label}: subflow "${gate.parent?.displayName ?? '(top level)'}"`;
  // Every subflow above it must be REQUIRED or ALTERNATIVE: a CONDITIONAL one adds conditions of its own, a DISABLED
  // one switches the gate off.
  for (let up = gate.parent?.parent; up; up = up.parent) {
    if (!['REQUIRED', 'ALTERNATIVE'].includes(up.requirement)) {
      fail(
        at,
        `sits inside subflow "${up.displayName}", which is ${up.requirement} — ` +
          (up.requirement === 'CONDITIONAL'
            ? 'its own conditions decide whether the gate is reached at all'
            : 'the gate is never reached'),
      );
    }
  }
  if (!gate.parent || gate.parent.requirement !== 'CONDITIONAL') {
    fail(
      at,
      `is ${gate.parent?.requirement ?? 'not a subflow'}, not CONDITIONAL — its conditions are not evaluated`,
    );
    return;
  }
  if (gate.requirement !== 'REQUIRED') {
    fail(at, `"${gate.displayName}" is ${gate.requirement}, not REQUIRED`);
  }
  const conditions = executions.filter(
    (e) => e.parent === gate.parent && (e.providerId ?? '') === 'conditional-user-attribute',
  );
  const guards = [];
  // Any other condition type in the subflow is ANDed with the guard just the same (`conditional-user-role`, …).
  const others = executions
    .filter(
      (e) =>
        e.parent === gate.parent &&
        (e.providerId ?? '').startsWith('conditional-') &&
        e.providerId !== 'conditional-user-attribute' &&
        !allowed.includes(e.providerId) &&
        e.requirement !== 'DISABLED',
    )
    .map((e) => e.providerId);
  for (const c of conditions) {
    const cfg = c.authenticationConfig
      ? ((await adminJson(`/authentication/config/${c.authenticationConfig}`)).config ?? {})
      : {};
    const guard =
      c.requirement === 'REQUIRED' &&
      cfg['attribute_name'] === 'mfa_required' &&
      conditionHolds(cfg, 'true') &&
      !conditionHolds(cfg, 'false') &&
      !conditionHolds(cfg, '');
    if (guard) guards.push(c);
    else if (c.requirement !== 'DISABLED') others.push(cfg['attribute_name'] ?? '(no config)');
  }
  if (guards.length === 0) {
    fail(
      at,
      'no REQUIRED "Condition - user attribute" that holds for mfa_required = true (and not for false / absent)' +
        (others.includes('role')
          ? ' — it reads "role", the PRIMARY role only, so an additional TENANT_ADMIN / FINANCE is never challenged'
          : ''),
    );
  } else if (others.length > 0) {
    fail(
      at,
      `condition(s) on ${others.join(', ')} beside the mfa_required one — conditions in a subflow are ANDed`,
    );
  }
}

async function checkFlows() {
  let browser;
  let direct;
  try {
    browser = await executionsOf('browser-mfa');
  } catch {
    fail('flow', 'flow "browser-mfa" does not exist in this realm (Step 1a)');
  }
  try {
    direct = await executionsOf('direct-grant-mfa');
  } catch {
    fail('flow', 'flow "direct-grant-mfa" does not exist in this realm (Step 1b)');
  }

  if (browser) {
    const otp = browser.filter((e) => (e.providerId ?? '') === 'auth-otp-form');
    if (otp.length === 0) fail('flow', 'browser-mfa has no "OTP Form" execution (Step 1a)');
    for (const gate of otp) {
      await checkGate('browser-mfa', browser, gate, ['conditional-level-of-authentication']);
    }
  }

  if (direct) {
    const deny = direct.find((e) => (e.providerId ?? '') === 'deny-access-authenticator');
    if (!deny) {
      fail(
        'flow',
        'direct-grant-mfa has no "Deny access" execution. Demanding OTP here instead does not work: ' +
          'the Path A exchange sends no otp parameter, and direct-grant-validate-otp against a user ' +
          'with no OTP credential returns HTTP 500 rather than refusing cleanly.',
      );
      return;
    }
    const denyIdx = direct.indexOf(deny);
    const otpIdx = direct.findIndex((e) => (e.providerId ?? '') === 'direct-grant-validate-otp');
    if (otpIdx >= 0 && denyIdx > otpIdx) {
      fail(
        'flow',
        'the privileged-role deny subflow is ordered AFTER the conditional-OTP subflow. It must come ' +
          'first, or a privileged user is challenged for OTP before being refused.',
      );
    }
    await checkGate('direct-grant-mfa', direct, deny, []);
  }
}

// ── live probe ──────────────────────────────────────────────────────────────

const PROBE_PASSWORD = 'Pr0be-Verify-MFA!';

async function withProbeUser(username, attributes, fn) {
  const create = await admin('/users', {
    method: 'POST',
    body: JSON.stringify({
      username,
      enabled: true,
      email: `${username}@probe.invalid`,
      firstName: 'MFA',
      lastName: 'Probe',
      attributes,
    }),
  });
  if (create.status === 409) {
    // Left over from an interrupted run, possibly by an older version with other attributes: start clean.
    const [stale] = await adminJson(`/users?username=${encodeURIComponent(username)}&exact=true`);
    if (stale) await admin(`/users/${stale.id}`, { method: 'DELETE' });
    return withProbeUser(username, attributes, fn);
  }
  if (!create.ok) {
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

  // Each probe user carries what the backend would write for it (ADR-110 rounds 5–6). "Refused" means HTTP 401 for
  // the USER — a 500, or a 401 `unauthorized_client` / `invalid_client` for a bad client secret, proves nothing about
  // the condition and stops the probe.
  const probes = [
    {
      name: 'probe-mfa-admin',
      label: 'a primary TENANT_ADMIN',
      attributes: { role: ['TENANT_ADMIN'], mfa_required: ['true'] },
      refused: true,
    },
    {
      // The case round 5 exists for: `role` alone would let this one through.
      name: 'probe-mfa-additional',
      label: 'an additional TENANT_ADMIN / FINANCE (role SITE_ENGINEER + mfa_required)',
      attributes: { role: ['SITE_ENGINEER'], mfa_required: ['true'] },
      refused: true,
    },
    {
      name: 'probe-mfa-worker',
      label: 'a SITE_ENGINEER',
      attributes: { role: ['SITE_ENGINEER'] },
      refused: false,
    },
  ];
  for (const p of probes) {
    const res = await withProbeUser(p.name, p.attributes, () =>
      directGrant(p.name, PROBE_PASSWORD),
    );
    if (['unauthorized_client', 'invalid_client'].includes(res.oauthError)) {
      fail(
        'probe',
        `the client "${CLIENT_ID}" was refused (${res.oauthError}) — check KEYCLOAK_CLIENT_SECRET`,
      );
      return;
    }
    if (p.refused && res.status !== 401) {
      fail(
        'probe',
        res.status === 200
          ? `${p.label} was ISSUED a token on Direct Grant. Path A is open to a privileged role (spec §5.4.4).`
          : `${p.label}: expected HTTP 401, got ${res.status} (${res.oauthError}) — not a clean refusal.`,
      );
    } else if (!p.refused && res.status !== 200) {
      fail(
        'probe',
        `${p.label} was REFUSED on Direct Grant (HTTP ${res.status}, ${res.oauthError}). ` +
          `The deny condition is too broad — this locks every field worker out of Path A.`,
      );
    } else {
      notes.push(`probe: ${p.label} → HTTP ${res.status}`);
    }
  }
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Keycloak MFA Layer 1 — live check\n  server: ${BASE}\n  realm:  ${REALM}\n`);

  await checkBindingsAndAcr();
  await checkFlows();
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
