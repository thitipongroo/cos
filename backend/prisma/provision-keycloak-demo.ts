// Provision the demo tenant's seeded users into Keycloak so they can log in for real.
// Reads the users straight from platform.users + tenant_memberships (tenant_code = 'EKC') so it
// always matches what seed-realistic.ts loaded — no duplicated user list. For each user it:
//   1. creates a Keycloak account in the realm named by KEYCLOAK_REALM (construction-os-dev by
//      default) with the tenant_id / user_id / role attributes (the cos-backend + cos-web protocol
//      mappers turn these into JWT claims), email + a known password (Path B email/password login),
//   2. links platform.users.keycloak_user_id to the created account,
//   3. verifies a real Direct-Grant login (grant_type=password via the cos-backend client) and
//      decodes the issued JWT to confirm the tenant_id / user_id / role claims.
// Idempotent: an existing account is found by USERNAME and updated in place (attributes + password),
// never deleted. The one destructive path — recreating an account still keyed by its email so it can
// take the phone-number username — needs an exact email match on a real account before it runs.
//
// Run: DATABASE_URL=<direct pg url> pnpm exec ts-node prisma/provision-keycloak-demo.ts
import './load-root-env';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPrismaClient } from '../src/shared/prisma/create-prisma-client';
import { createLogger } from '@cos/logger';

const logger = createLogger('provision-kc-demo');
const prisma = createPrismaClient();

const KC = process.env['KEYCLOAK_BASE_URL'] ?? 'http://localhost:8090';
const REALM = process.env['KEYCLOAK_REALM'] ?? 'construction-os-dev';
const ADMIN_USER = process.env['KEYCLOAK_ADMIN_USER'] ?? 'admin';
const ADMIN_PW = process.env['KEYCLOAK_ADMIN_PASSWORD'] ?? 'cos_keycloak_admin';
const DEMO_PASSWORD = process.env['DEMO_USER_PASSWORD'] ?? 'Ekachai@2026';

// cos-backend client secret (Direct-Grant client) — from the imported realm file.
function backendClientSecret(): string {
  const realm = JSON.parse(
    readFileSync(
      join(__dirname, '../../infrastructure/keycloak/realms/construction-os-realm.json'),
      'utf8',
    ),
  ) as { clients: { clientId: string; secret?: string }[] };
  const c = realm.clients.find((x) => x.clientId === 'cos-backend');
  if (!c?.secret) throw new Error('cos-backend client secret not found in realm import');
  return c.secret;
}

async function form(url: string, body: Record<string, string>): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
}

async function adminToken(): Promise<string> {
  const res = await form(`${KC}/realms/master/protocol/openid-connect/token`, {
    grant_type: 'password',
    client_id: 'admin-cli',
    username: ADMIN_USER,
    password: ADMIN_PW,
  });
  if (!res.ok) throw new Error(`admin token failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function waitForKeycloak(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${KC}/realms/${REALM}/.well-known/openid-configuration`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('Keycloak did not become ready in time');
}

interface DemoUser {
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  phone_number: string | null;
}

interface KcUser {
  id: string;
  username: string;
  email?: string;
}

// Every lookup goes through here, and every caller re-checks the match CLIENT-SIDE.
//
// WHY THE RE-CHECK. Keycloak DROPS a search parameter whose value is empty instead of matching on it,
// so `?email=&exact=true` is not "the users with no email" — it is "every user in the realm", newest
// realm first. seed-realistic.ts loads 12 EKC site workers with `email = ''` (they are identified by
// phone), so the old email-keyed lookup returned the whole realm for each of them and treated
// `found[0]` — an unrelated account that merely sorted first — as the user being provisioned. It then
// took the rename branch and DELETED that account. Two runs destroyed the two Keycloak accounts the
// Path A capture users depend on (+66800000001, +66800000002), and each run ended on the recreate's
// 409 because the real conflicting account had never been touched.
//
// Filtering the response ourselves means a dropped parameter can only ever yield "no match", which is
// refused loudly below, never "some arbitrary account" that then gets deleted.
async function searchUsers(token: string, params: Record<string, string>): Promise<KcUser[]> {
  const qs = new URLSearchParams({ ...params, exact: 'true' });
  const res = await fetch(`${KC}/admin/realms/${REALM}/users?${qs.toString()}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`user search ${qs.toString()} failed: ${res.status}`);
  return (await res.json()) as KcUser[];
}

async function findByUsername(token: string, username: string): Promise<KcUser | undefined> {
  return (await searchUsers(token, { username })).find((x) => x.username === username);
}

async function findByEmail(token: string, email: string): Promise<KcUser | undefined> {
  const wanted = email.toLowerCase();
  return (await searchUsers(token, { email })).find((x) => x.email?.toLowerCase() === wanted);
}

async function upsertKeycloakUser(token: string, tenantId: string, u: DemoUser): Promise<string> {
  const [firstName, ...rest] = u.display_name.split(' ');
  const lastName = rest.join(' ') || firstName;
  // '' is not an email. Treated as one it becomes an empty search parameter (see searchUsers) and, in
  // the representation, an account Keycloak cannot key on either.
  const email = u.email?.trim() ? u.email.trim() : null;
  // Username is the phone number when the user has one, so BOTH auth paths work for one account:
  //   Path A (SMS OTP) — identity.service.ts issueTokensForPhone() resolves the account from the DB,
  //     then keycloak-admin.service.ts exchangeOtpForTokens() does a Direct Grant with
  //     `username: <phone>`. That only matches if the Keycloak username IS the phone number.
  //   Path B (email + password) — still fine: the realm sets loginWithEmailAllowed, so Keycloak
  //     accepts the email as the login identifier regardless of what the username is.
  // Provisioning username = email (the previous behaviour) made Path A impossible for every seeded
  // user, which is what docs/screens/android/README.md recorded as a known gap.
  const username = u.phone_number ?? email;
  if (!username) {
    throw new Error(`user ${u.user_id} has neither a phone number nor an email — cannot provision`);
  }
  const identity = {
    ...(email ? { email, emailVerified: true } : {}),
    enabled: true,
    firstName,
    lastName,
    attributes: { tenant_id: [tenantId], user_id: [u.user_id], role: [u.role] },
  };
  const rep = {
    username,
    ...identity,
    credentials: [{ type: 'password', value: DEMO_PASSWORD, temporary: false }],
  };
  const create = await fetch(`${KC}/admin/realms/${REALM}/users`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(rep),
  });

  if (create.status === 201) {
    const created = await findByUsername(token, username);
    if (!created) throw new Error(`created ${username} but it cannot be found again`);
    return created.id;
  }
  if (create.status !== 409) {
    throw new Error(`create ${username} failed: ${create.status} ${await create.text()}`);
  }

  // 409 says SOMETHING already occupies this account's identity. Which thing decides what to do, so
  // it is established rather than assumed — the old code assumed "the email account needs renaming"
  // and deleted whatever the search handed back.

  // (a) The username is taken — the ordinary re-run. Nothing to remove: re-apply the profile so a
  // stale tenant/role attribute or a forgotten password is corrected in place. `username` is left out
  // of the PUT because it already matches and this realm sets editUsernameAllowed=false.
  const byUsername = await findByUsername(token, username);
  if (byUsername) {
    const put = await fetch(`${KC}/admin/realms/${REALM}/users/${byUsername.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(identity),
    });
    if (!put.ok) throw new Error(`update ${username} failed: ${put.status} ${await put.text()}`);
    const pw = await fetch(`${KC}/admin/realms/${REALM}/users/${byUsername.id}/reset-password`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'password', value: DEMO_PASSWORD, temporary: false }),
    });
    if (!pw.ok) throw new Error(`reset-password ${username} failed: ${pw.status}`);
    return byUsername.id;
  }

  // (b) The username is free, so the email is what collided: an account provisioned before the
  // phone-username change still carries the email as its username. It cannot be renamed in place —
  // editUsernameAllowed=false makes Keycloak answer 400 error-user-attribute-read-only — so it is
  // recreated. Deleting is only ever reached from an EXACT email match on a real account.
  if (!email) {
    throw new Error(
      `create ${username} was refused 409 but no account holds that username, and this user has no ` +
        `email that could have collided — refusing to guess which account to change`,
    );
  }
  const byEmail = await findByEmail(token, email);
  if (!byEmail) {
    throw new Error(
      `create ${username} was refused 409 but neither that username nor ${email} matches an ` +
        `existing account — refusing to guess which account to change`,
    );
  }
  const del = await fetch(`${KC}/admin/realms/${REALM}/users/${byEmail.id}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
  if (!del.ok && del.status !== 404) {
    throw new Error(`rename ${byEmail.username} → ${username}: delete failed ${del.status}`);
  }
  const recreate = await fetch(`${KC}/admin/realms/${REALM}/users`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(rep),
  });
  if (recreate.status !== 201) {
    throw new Error(`recreate ${username} failed: ${recreate.status} ${await recreate.text()}`);
  }
  const renamed = await findByUsername(token, username);
  if (!renamed) throw new Error(`user ${username} not found after recreate`);
  return renamed.id;
}

// Logs in with the USERNAME (the phone number for every seeded user that has one), not the email:
// that is the identifier Path A's Direct Grant sends, and 12 of the demo users have no email to log in
// with at all.
async function verifyLogin(username: string): Promise<Record<string, unknown>> {
  const res = await form(`${KC}/realms/${REALM}/protocol/openid-connect/token`, {
    grant_type: 'password',
    client_id: 'cos-backend',
    client_secret: backendClientSecret(),
    username,
    password: DEMO_PASSWORD,
    scope: 'openid',
  });
  if (!res.ok) throw new Error(`login ${username} failed: ${res.status} ${await res.text()}`);
  const { access_token } = (await res.json()) as { access_token: string };
  const payload = JSON.parse(Buffer.from(access_token.split('.')[1], 'base64').toString('utf8'));
  return {
    tenant_id: payload.tenant_id,
    user_id: payload.user_id,
    role: payload.role,
    preferred_username: payload.preferred_username,
  };
}

async function main(): Promise<void> {
  await waitForKeycloak();
  logger.info({ kc: KC, realm: REALM }, 'provision-kc-demo: Keycloak ready');

  const tenantRows = await prisma.$queryRaw<{ tenant_id: string }[]>`
    SELECT tenant_id::text FROM platform.tenants WHERE tenant_code = 'EKC'`;
  if (!tenantRows.length) throw new Error('demo tenant EKC not found — run seed-realistic first');
  const tenantId = tenantRows[0].tenant_id;

  const users = await prisma.$queryRaw<DemoUser[]>`
    SELECT u.user_id::text, u.email, u.display_name, u.phone_number, m.role::text AS role
    FROM platform.users u
    JOIN platform.tenant_memberships m ON m.user_id = u.user_id AND m.tenant_id = u.tenant_id
    WHERE u.tenant_id = ${tenantId}::uuid
    ORDER BY u.email`;

  const token = await adminToken();
  for (const u of users) {
    const kcId = await upsertKeycloakUser(token, tenantId, u);
    await prisma.$executeRaw`UPDATE platform.users SET keycloak_user_id = ${kcId} WHERE user_id = ${u.user_id}::uuid`;
    logger.info({ login: u.phone_number ?? u.email, role: u.role, kcId }, 'provisioned');
  }

  // Prove real login for two representative users (office role + site role).
  const execUser = users.find((u) => u.role === 'EXECUTIVE') ?? users[0];
  const seUser = users.find((u) => u.role === 'SITE_ENGINEER') ?? users[0];
  for (const u of [execUser, seUser]) {
    const login = u.phone_number ?? u.email;
    const claims = await verifyLogin(login);
    logger.info({ login, claims }, 'LOGIN VERIFIED — JWT claims');
  }

  logger.info({ count: users.length, password: DEMO_PASSWORD }, 'provision-kc-demo: complete');
}

main()
  .catch((err: unknown) => {
    logger.error({ err }, 'provision-kc-demo: fatal');
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
