// Provision the demo tenant's seeded users into Keycloak so they can log in for real.
// Reads the users straight from platform.users + tenant_memberships (tenant_code = 'EKC') so it
// always matches what seed-realistic.ts loaded — no duplicated user list. For each user it:
//   1. creates a Keycloak account in the `construction-os` realm with the tenant_id / user_id /
//      role attributes (the cos-backend + cos-web protocol mappers turn these into JWT claims),
//      email + a known password (Path B email/password login),
//   2. links platform.users.keycloak_user_id to the created account,
//   3. verifies a real Direct-Grant login (grant_type=password via the cos-backend client) and
//      decodes the issued JWT to confirm the tenant_id / user_id / role claims.
// Idempotent: existing Keycloak users are reused (409 → fetch id), password + attributes re-applied.
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

async function upsertKeycloakUser(token: string, tenantId: string, u: DemoUser): Promise<string> {
  const [firstName, ...rest] = u.display_name.split(' ');
  const lastName = rest.join(' ') || firstName;
  // Username is the phone number when the user has one, so BOTH auth paths work for one account:
  //   Path A (SMS OTP) — identity.service.ts issueTokensForPhone() resolves the account from the DB,
  //     then keycloak-admin.service.ts exchangeOtpForTokens() does a Direct Grant with
  //     `username: <phone>`. That only matches if the Keycloak username IS the phone number.
  //   Path B (email + password) — still fine: the realm sets loginWithEmailAllowed, so Keycloak
  //     accepts the email as the login identifier regardless of what the username is.
  // Provisioning username = email (the previous behaviour) made Path A impossible for every seeded
  // user, which is what docs/screens/android/README.md recorded as a known gap.
  const username = u.phone_number ?? u.email;
  const rep = {
    username,
    email: u.email,
    emailVerified: true,
    enabled: true,
    firstName,
    lastName,
    attributes: { tenant_id: [tenantId], user_id: [u.user_id], role: [u.role] },
    credentials: [{ type: 'password', value: DEMO_PASSWORD, temporary: false }],
  };
  const create = await fetch(`${KC}/admin/realms/${REALM}/users`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(rep),
  });

  if (create.status !== 201 && create.status !== 409) {
    throw new Error(`create ${u.email} failed: ${create.status} ${await create.text()}`);
  }

  // Resolve the Keycloak user id (exact email match).
  const findByEmail = async (): Promise<{ id: string; username: string }[]> => {
    const res = await fetch(
      `${KC}/admin/realms/${REALM}/users?email=${encodeURIComponent(u.email)}&exact=true`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    return (await res.json()) as { id: string; username: string }[];
  };
  let found = await findByEmail();
  if (!found.length) throw new Error(`user ${u.email} not found after create`);

  // An account provisioned before the phone-username change still has the email as its username, and
  // it CANNOT be renamed in place: this realm sets editUsernameAllowed=false, so Keycloak rejects a
  // username change with 400 error-user-attribute-read-only. Recreate the account instead — these are
  // demo users this script owns, and the caller re-links platform.users.keycloak_user_id to the new
  // id, so nothing is left pointing at the deleted account.
  if (found[0].username !== username) {
    const del = await fetch(`${KC}/admin/realms/${REALM}/users/${found[0].id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    if (!del.ok && del.status !== 404) {
      throw new Error(`rename ${u.email} → ${username}: delete failed ${del.status}`);
    }
    const recreate = await fetch(`${KC}/admin/realms/${REALM}/users`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(rep),
    });
    if (recreate.status !== 201) {
      throw new Error(`recreate ${username} failed: ${recreate.status} ${await recreate.text()}`);
    }
    found = await findByEmail();
    if (!found.length) throw new Error(`user ${u.email} not found after recreate`);
    return found[0].id;
  }

  const kcId = found[0].id;

  // If it already existed (409), re-apply username + attributes + password so the account is
  // login-ready. `username` is re-sent deliberately: accounts provisioned before the phone-username
  // change still carry the email as their username, and without this they stay unable to do Path A.
  if (create.status === 409) {
    await fetch(`${KC}/admin/realms/${REALM}/users/${kcId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        username,
        email: u.email,
        emailVerified: true,
        enabled: true,
        firstName,
        lastName,
        attributes: { tenant_id: [tenantId], user_id: [u.user_id], role: [u.role] },
      }),
    });
    await fetch(`${KC}/admin/realms/${REALM}/users/${kcId}/reset-password`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'password', value: DEMO_PASSWORD, temporary: false }),
    });
  }
  return kcId;
}

async function verifyLogin(email: string): Promise<Record<string, unknown>> {
  const res = await form(`${KC}/realms/${REALM}/protocol/openid-connect/token`, {
    grant_type: 'password',
    client_id: 'cos-backend',
    client_secret: backendClientSecret(),
    username: email,
    password: DEMO_PASSWORD,
    scope: 'openid',
  });
  if (!res.ok) throw new Error(`login ${email} failed: ${res.status} ${await res.text()}`);
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
    logger.info({ email: u.email, role: u.role, kcId }, 'provisioned');
  }

  // Prove real login for two representative users (office role + site role).
  const execUser = users.find((u) => u.role === 'EXECUTIVE') ?? users[0];
  const seUser = users.find((u) => u.role === 'SITE_ENGINEER') ?? users[0];
  for (const u of [execUser, seUser]) {
    const claims = await verifyLogin(u.email);
    logger.info({ email: u.email, claims }, 'LOGIN VERIFIED — JWT claims');
  }

  logger.info({ count: users.length, password: DEMO_PASSWORD }, 'provision-kc-demo: complete');
}

main()
  .catch((err: unknown) => {
    logger.error({ err }, 'provision-kc-demo: fatal');
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
