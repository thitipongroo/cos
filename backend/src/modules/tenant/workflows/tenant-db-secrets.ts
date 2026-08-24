// AWS Secrets Manager access for dedicated (ENTERPRISE) tenant databases — security review F4 / F9.
//
// WHAT WAS WRONG
// --------------
// `buildDbUrl()` minted `postgresql://cos_admin:${TENANT_DB_MASTER_PASSWORD}@…` and that URL was stored
// in `platform.tenants.dedicated_db_url`, which `TenantPrismaService` then used for EVERY tenant-scoped
// query. Two separate defects:
//
//   F4 — `cos_admin` is the RDS MASTER user. Running the application as it contradicts the invariant
//        `appDatabaseUrl()` exists to enforce (connect as a non-owner so RLS is actually applied), and
//        means any SQL-injection or app compromise carries DBA rights on that tenant's database.
//        The instance is also created with `ManageMasterUserPassword: true`, so AWS generates the
//        master password and stores it in Secrets Manager — `TENANT_DB_MASTER_PASSWORD` was never the
//        real password to begin with.
//
//   F9 — migration `20260623000001_app_user_login_and_grants` runs
//        `ALTER ROLE app_user WITH LOGIN PASSWORD 'app_user_dev_password'` unconditionally, and
//        `runMigrationsActivity` runs `prisma migrate deploy` against each new dedicated DB. Every
//        provisioned tenant therefore ended up with the RLS-enforcing role holding a password that is
//        committed to git.
//
// THE MODEL
// ---------
// Master credential  → the AWS-managed secret attached to the instance (`MasterUserSecret.SecretArn`).
//                      Read, never written, and used only for admin steps (migrations, role setup).
// App-role credential → a per-tenant secret this module CREATES with a generated password, then
//                      applies to `app_user` on the dedicated DB. `dedicated_db_url` stores the
//                      app-role URL, so runtime queries are subject to RLS (spec §5.2, ADR-013, QM-4).
//
// Secret naming is deterministic (`cos/{env}/tenant-db/{tenantCode}/app_user`) so provisioning is
// idempotent and rotation has a stable handle (docs/policies/secrets-rotation-policy.md).

import { createLogger } from '@cos/logger';

const logger = createLogger('tenant-db-secrets');

/** Deterministic per-tenant secret name for the dedicated DB's app_user credential. */
export function appUserSecretName(tenantCode: string): string {
  const env = process.env['NODE_ENV'] ?? 'prod';
  return `cos/${env}/tenant-db/${tenantCode}/app_user`;
}

function region(): string {
  return process.env['AWS_REGION'] ?? 'ap-southeast-1';
}

/**
 * Read the AWS-managed master password for a dedicated instance.
 *
 * `secretArn` comes from `DBInstance.MasterUserSecret.SecretArn` — set because the instance is created
 * with `ManageMasterUserPassword: true`. AWS stores it as `{"username":…,"password":…}`.
 */
export async function readMasterPassword(secretArn: string): Promise<string> {
  const { SecretsManagerClient, GetSecretValueCommand } =
    await import('@aws-sdk/client-secrets-manager');
  const client = new SecretsManagerClient({ region: region() });
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  if (!res.SecretString) {
    throw new Error(`Master user secret ${secretArn} has no SecretString`);
  }
  const parsed = JSON.parse(res.SecretString) as { password?: string };
  if (!parsed.password) {
    throw new Error(`Master user secret ${secretArn} does not contain a password field`);
  }
  return parsed.password;
}

/**
 * Return the app_user password for `tenantCode`, creating the secret on first call.
 *
 * Idempotent: a second provisioning attempt (Temporal retry, re-run after a partial failure) reads the
 * existing secret rather than rotating the password out from under a database that already has it.
 * The password is generated here with the platform CSPRNG and never logged.
 */
export async function ensureAppUserPassword(tenantCode: string): Promise<string> {
  const { SecretsManagerClient, GetSecretValueCommand, CreateSecretCommand } =
    await import('@aws-sdk/client-secrets-manager');
  const client = new SecretsManagerClient({ region: region() });
  const name = appUserSecretName(tenantCode);

  try {
    const existing = await client.send(new GetSecretValueCommand({ SecretId: name }));
    if (existing.SecretString) {
      const parsed = JSON.parse(existing.SecretString) as { password?: string };
      if (parsed.password) {
        logger.info({ tenantCode, secretName: name }, 'tenant-db.app_user_secret.reused');
        return parsed.password;
      }
    }
    throw new Error(`Secret ${name} exists but contains no password field`);
  } catch (err) {
    // Only "not found" justifies creating one. Any other failure (denied, throttled, malformed) must
    // propagate — silently minting a second credential would leave the DB and the secret disagreeing.
    if ((err as { name?: string }).name !== 'ResourceNotFoundException') throw err;
  }

  // 32 random bytes, base64url — no shell metacharacters, so it stays safe for assertShellSafeDbUrl.
  const password = Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(32))).toString(
    'base64url',
  );
  await client.send(
    new CreateSecretCommand({
      Name: name,
      Description: `COS dedicated-tenant app_user credential for ${tenantCode} (RLS-enforcing role)`,
      SecretString: JSON.stringify({ username: 'app_user', password }),
      Tags: [
        { Key: 'tenant_code', Value: tenantCode },
        { Key: 'managed_by', Value: 'cos-enterprise-provisioning' },
      ],
    }),
  );
  logger.info({ tenantCode, secretName: name }, 'tenant-db.app_user_secret.created');
  return password;
}
