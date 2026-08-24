import { createPrismaClient } from '../../../shared/prisma/create-prisma-client';
import { EventOutboxService } from '../../../shared/events/event-outbox.service';
import { KafkaTopicProvisioner } from '@cos/kafka';
import { createLogger } from '@cos/logger';
import { randomUUID } from 'crypto';
import { readMasterPassword, ensureAppUserPassword } from './tenant-db-secrets';
import { encryptDedicatedDbUrl } from '../utils/dedicated-db-url-cipher';

const logger = createLogger('enterprise-provisioning-activities');

const TEMPORAL_ADDRESS = process.env['TEMPORAL_ADDRESS'] ?? 'localhost:7233';
const DATABASE_URL = process.env['DATABASE_URL'] ?? '';

export interface RdsActivityParams {
  tenantId: string;
}
export interface RdsWithEndpointParams {
  tenantId: string;
  rdsEndpoint: string;
  /** ARN of the AWS-managed master user secret (see createRdsActivity; security review F4). */
  masterSecretArn: string;
}

/**
 * RDS instance identifier for a tenant. MUST be identical between createRdsActivity and its
 * compensation (compensateCreateRdsActivity) — otherwise the rollback deletes the wrong instance or
 * none at all. Extracted so the two never drift.
 */
function dbIdentifierFor(tenantCode: string): string {
  const env = process.env['NODE_ENV'] ?? 'prod';
  return `cos-tenant-${tenantCode.replace(/_/g, '-')}-${env}`;
}

// ── Activity 1: createRdsActivity ─────────────────────────────────────────

export async function createRdsActivity(
  params: RdsActivityParams,
): Promise<{ rdsEndpoint: string; masterSecretArn: string }> {
  const { RDSClient, CreateDBInstanceCommand } = await import('@aws-sdk/client-rds');

  const tenantCode = await getPlatformTenantCode(params.tenantId);
  const env = process.env['NODE_ENV'] ?? 'prod';
  const dbIdentifier = dbIdentifierFor(tenantCode);

  const client = new RDSClient({ region: process.env['AWS_REGION'] ?? 'ap-southeast-1' });

  const command = new CreateDBInstanceCommand({
    DBInstanceIdentifier: dbIdentifier,
    DBInstanceClass: 'db.t3.medium',
    Engine: 'postgres',
    EngineVersion: '15',
    AllocatedStorage: 100,
    StorageType: 'gp3',
    MultiAZ: env === 'prod',
    BackupRetentionPeriod: 7,
    StorageEncrypted: true,
    KmsKeyId:
      process.env[`TENANT_KMS_KEY_${tenantCode.toUpperCase()}`] ??
      process.env['DEFAULT_TENANT_KMS_KEY'],
    DBName: 'cos',
    MasterUsername: 'cos_admin',
    ManageMasterUserPassword: true,
    VpcSecurityGroupIds: (process.env['TENANT_DB_SECURITY_GROUP_IDS'] ?? '')
      .split(',')
      .filter(Boolean),
    DBSubnetGroupName: process.env['TENANT_DB_SUBNET_GROUP'] ?? 'cos-tenant-subnet-group',
    Tags: [
      { Key: 'tenant_id', Value: params.tenantId },
      { Key: 'tenant_code', Value: tenantCode },
      { Key: 'managed_by', Value: 'cos-enterprise-provisioning' },
    ],
  });

  const response = await client.send(command);
  const endpoint = response.DBInstance?.Endpoint?.Address;
  if (!endpoint)
    throw new Error(`RDS instance created but endpoint not available for ${dbIdentifier}`);

  // ManageMasterUserPassword: true means AWS generated the master password and stored it in Secrets
  // Manager — the ARN is the ONLY way to obtain it. TENANT_DB_MASTER_PASSWORD never held the real
  // value (security review F4), so downstream activities must carry this ARN instead.
  const masterSecretArn = response.DBInstance?.MasterUserSecret?.SecretArn;
  if (!masterSecretArn)
    throw new Error(
      `RDS instance ${dbIdentifier} created without a managed master user secret — ` +
        'ManageMasterUserPassword must be true for the provisioning workflow to obtain credentials',
    );

  logger.info({ tenantId: params.tenantId, dbIdentifier, endpoint }, 'rds.instance.created');
  return { rdsEndpoint: endpoint, masterSecretArn };
}

// ── Activity 2: runMigrationsActivity ─────────────────────────────────────

export async function runMigrationsActivity(params: RdsWithEndpointParams): Promise<void> {
  const { execSync } = await import('child_process');
  const dbUrl = await buildMasterDbUrl(params.rdsEndpoint, params.masterSecretArn);

  logger.info(
    { tenantId: params.tenantId, rdsEndpoint: params.rdsEndpoint },
    'migrations.starting',
  );
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'inherit',
  });
  logger.info({ tenantId: params.tenantId }, 'migrations.complete');
}

// ── Activity 2b: secureAppUserActivity ────────────────────────────────────

/**
 * Replace the app_user password that `prisma migrate deploy` just set (security review F9).
 *
 * Migration `20260623000001_app_user_login_and_grants` runs
 * `ALTER ROLE app_user WITH LOGIN PASSWORD 'app_user_dev_password'` unconditionally — its own comment
 * calls that value local-dev only, but nothing stopped it running here. Every dedicated tenant DB was
 * therefore left with the RLS-enforcing role holding a password published in the git history.
 *
 * This runs immediately after migrations and before the URL is stored, so the window in which the
 * git-known password is live is bounded by this workflow rather than by the life of the tenant.
 *
 * The password is bound as a parameter, never interpolated: role names cannot be parameterised in
 * PostgreSQL but passwords can, and this value comes from Secrets Manager rather than a UUID-validated
 * source, so it is exactly the kind of string that must not reach SQL by concatenation.
 */
export async function secureAppUserActivity(params: RdsWithEndpointParams): Promise<void> {
  const tenantCode = await getPlatformTenantCode(params.tenantId);
  const masterUrl = await buildMasterDbUrl(params.rdsEndpoint, params.masterSecretArn);
  const appPassword = await ensureAppUserPassword(tenantCode);

  const prisma = createPrismaClient(masterUrl);
  try {
    await prisma.$executeRaw`SELECT set_config('cos.app_user_pw', ${appPassword}, false)`;
    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN EXECUTE format('ALTER ROLE app_user WITH LOGIN PASSWORD %L', current_setting('cos.app_user_pw')); END $$;`,
    );
    logger.info({ tenantId: params.tenantId }, 'tenant-db.app_user.password_secured');
  } finally {
    await prisma.$disconnect();
  }
}

// ── Activity 3: assignDedicatedDbActivity ─────────────────────────────────

export async function assignDedicatedDbActivity(params: RdsWithEndpointParams): Promise<void> {
  const prisma = createPrismaClient(DATABASE_URL);
  try {
    const tenantCode = await getPlatformTenantCode(params.tenantId);
    // The APP-ROLE url, not the master one — this column feeds TenantPrismaService (security review F4).
    const dbUrl = await buildAppDbUrl(params.rdsEndpoint, tenantCode);
    // Always encrypted on this path (security review F5b). Unlike TenantService, a Temporal activity has
    // no Nest DI container to resolve FeatureFlagService from, and constructing an Unleash client per
    // activity would both leak a handle (Rule 39) and answer from stale defaults before its first poll.
    // Encrypting unconditionally is the fail-safe direction, and the read side accepts both formats, so
    // this stays compatible whichever way the s1.tenant.encrypted-db-url flag is set.
    const stored = encryptDedicatedDbUrl(dbUrl, true);
    await prisma.$executeRaw`
      UPDATE platform.tenants
      SET dedicated_db_url = ${stored}, updated_at = now()
      WHERE tenant_id = ${params.tenantId}::uuid
    `;
    logger.info({ tenantId: params.tenantId }, 'tenant.dedicated_db_url.assigned');
  } finally {
    await prisma.$disconnect();
  }
}

// ── Compensation: compensateAssignDedicatedDbActivity ──────────────────────

export async function compensateAssignDedicatedDbActivity(
  params: RdsActivityParams,
): Promise<void> {
  const prisma = createPrismaClient(DATABASE_URL);
  try {
    await prisma.$executeRaw`
      UPDATE platform.tenants
      SET dedicated_db_url = NULL, updated_at = now()
      WHERE tenant_id = ${params.tenantId}::uuid
    `;
    logger.warn({ tenantId: params.tenantId }, 'tenant.dedicated_db_url.compensated_to_null');
  } finally {
    await prisma.$disconnect();
  }
}

// ── Compensation: compensateCreateRdsActivity (spec §Phase 25 — createRds → DeleteDBInstance) ───────

/**
 * Roll back createRdsActivity by deleting the tenant's RDS instance. Fired on SYSTEM_ADMIN abort (and
 * available for saga rollback on a later-activity failure) so an aborted provisioning does not leave
 * an orphaned instance running. SkipFinalSnapshot: the DB was never put into service.
 */
export async function compensateCreateRdsActivity(params: RdsActivityParams): Promise<void> {
  const { RDSClient, DeleteDBInstanceCommand } = await import('@aws-sdk/client-rds');
  const tenantCode = await getPlatformTenantCode(params.tenantId);
  const dbIdentifier = dbIdentifierFor(tenantCode);

  const client = new RDSClient({ region: process.env['AWS_REGION'] ?? 'ap-southeast-1' });
  await client.send(
    new DeleteDBInstanceCommand({
      DBInstanceIdentifier: dbIdentifier,
      SkipFinalSnapshot: true,
      DeleteAutomatedBackups: true,
    }),
  );
  logger.warn({ tenantId: params.tenantId, dbIdentifier }, 'rds.instance.compensated_deleted');
}

// ── Human gate: notifyAwaitingApprovalActivity ─────────────────────────────

export async function notifyAwaitingApprovalActivity(params: RdsActivityParams): Promise<void> {
  const prisma = createPrismaClient(DATABASE_URL);
  try {
    const [tenant] = await prisma.$queryRaw<Array<{ tenant_name: string; tenant_code: string }>>`
      SELECT tenant_name, tenant_code FROM platform.tenants
      WHERE tenant_id = ${params.tenantId}::uuid LIMIT 1
    `;
    const tenantName = tenant?.tenant_name ?? params.tenantId;
    const admins = await prisma.$queryRaw<Array<{ user_id: string }>>`
      SELECT u.user_id FROM platform.users u
      JOIN platform.tenant_memberships tm ON tm.user_id = u.user_id
      WHERE tm.role = 'SYSTEM_ADMIN' AND u.is_active = true
    `;
    for (const admin of admins) {
      await prisma.$executeRaw`
        INSERT INTO notifications.notifications (tenant_id, recipient_user_id, event_type, channel, title, body)
        VALUES (
          NULL,
          ${admin.user_id}::uuid,
          'platform.enterprise.awaiting_approval',
          'in_app',
          'Data migration approval required',
          ${`Dedicated DB provisioned for ${tenantName}. Approve or abort data migration.`}
        )
      `;
    }
    logger.info(
      { tenantId: params.tenantId, adminCount: admins.length },
      'notify.awaiting_approval.sent',
    );
  } finally {
    await prisma.$disconnect();
  }
}

// tenant_id is a UUID everywhere it is stored; anything else must never reach a shell command.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(value: string, field: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${field} must be a UUID`);
  }
}

// The two connection URLs below are interpolated into a shell command (the `|` between pg_dump and
// psql means execSync goes through /bin/sh). They come from configuration rather than from a
// request, but a generated password is not a safe string: Secrets Manager will happily hand back
// one containing a backtick or `$(`, and that would execute. Postgres URLs have no legitimate use
// for shell metacharacters, so reject them rather than hope.
// Found by CodeQL js/indirect-command-line-injection.
const SHELL_METACHARACTERS = /[`$\\"'|;&<>(){}\s]/;

export function assertShellSafeDbUrl(value: string, field: string): void {
  if (!value.startsWith('postgres://') && !value.startsWith('postgresql://')) {
    throw new Error(`${field} must be a postgres:// URL`);
  }
  if (SHELL_METACHARACTERS.test(value)) {
    throw new Error(`${field} contains characters that are unsafe in a shell command`);
  }
}

// ── Activity 4: migrateDataActivity ───────────────────────────────────────

export async function migrateDataActivity(params: RdsWithEndpointParams): Promise<void> {
  // Validate before anything reaches a shell. This activity interpolates tenantId into a `pg_dump
  // ... --where="tenant_id='...'" | psql ...` command, which runs through /bin/sh because of the
  // pipe — so a tenantId carrying a quote or `$(...)` was arbitrary command execution with the
  // database credentials in the same string. Every tenant_id in this system is a UUID, so the
  // constraint costs nothing. The same pattern already guards app.current_tenant_id in
  // TenantPrismaService. Found by CodeQL js/indirect-command-line-injection.
  assertUuid(params.tenantId, 'tenantId');

  const { execSync } = await import('child_process');
  const sharedDbUrl = DATABASE_URL;
  // Master URL: pg_dump/psql restore writes across every schema and needs ownership, so this is one of
  // the few steps that legitimately uses the admin credential (security review F4).
  const dedicatedDbUrl = await buildMasterDbUrl(params.rdsEndpoint, params.masterSecretArn);

  // Check if tenant has existing domain data — skip migration if empty
  const prisma = createPrismaClient(sharedDbUrl);
  let hasData = false;
  try {
    const [row] = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
      SELECT COUNT(*) AS cnt FROM projects.projects WHERE tenant_id = ${params.tenantId}::uuid LIMIT 1
    `;
    hasData = (row?.cnt ?? 0n) > 0n;
  } finally {
    await prisma.$disconnect();
  }

  if (!hasData) {
    logger.info({ tenantId: params.tenantId }, 'migrate_data.skipped.no_existing_data');
    return;
  }

  logger.info({ tenantId: params.tenantId }, 'migrate_data.starting');
  assertShellSafeDbUrl(sharedDbUrl, 'DATABASE_URL');
  assertShellSafeDbUrl(dedicatedDbUrl, 'dedicatedDbUrl');
  // pg_dump tenant-scoped data and restore to dedicated DB
  execSync(
    `pg_dump "${sharedDbUrl}" --schema=projects --schema=boq --schema=procurement ` +
      `--schema=finance --schema=files --schema=notifications --schema=site_ops ` +
      `--schema=equipment --schema=workforce --schema=ai ` +
      `--where="tenant_id='${params.tenantId}'" ` +
      `| psql "${dedicatedDbUrl}"`,
    { stdio: 'inherit' },
  );
  logger.info({ tenantId: params.tenantId }, 'migrate_data.complete');
}

// ── Activity 5: verifyRoutingActivity ─────────────────────────────────────

export async function verifyRoutingActivity(params: RdsWithEndpointParams): Promise<void> {
  // Master URL, deliberately. This step reads platform.tenants, and after the F5a policy change
  // app_user only sees the row matching app.current_tenant_id — a GUC no provisioning activity sets.
  // Verifying as the admin role keeps the check meaningful; the app-role credential is exercised by
  // the first real request instead.
  const dbUrl = await buildMasterDbUrl(params.rdsEndpoint, params.masterSecretArn);
  const prisma = createPrismaClient(dbUrl);
  try {
    await prisma.$queryRaw`SELECT 1 AS ok`;
    const [row] = await prisma.$queryRaw<Array<{ dedicated_db_url: string | null }>>`
      SELECT dedicated_db_url FROM platform.tenants
      WHERE tenant_id = ${params.tenantId}::uuid LIMIT 1
    `;
    if (!row?.dedicated_db_url) {
      throw new Error(
        `verifyRoutingActivity: dedicated_db_url is NULL for tenant ${params.tenantId} — assignDedicatedDbActivity may have failed`,
      );
    }
    logger.info({ tenantId: params.tenantId, rdsEndpoint: params.rdsEndpoint }, 'routing.verified');
  } finally {
    await prisma.$disconnect();
  }
}

// ── Provision per-tenant Kafka topics (§7.3) ───────────────────────────────
//
// Eager provisioning is retained HERE and only here. An enterprise tenant gets a dedicated MSK
// namespace or cluster (§7.3), so its topic count is bounded by one tenant's catalogue rather than
// by customer count — the arithmetic that forced the shared tier onto create-on-first-publish does
// not apply. Standard tenants are provisioned lazily by KafkaProducer instead; see tenant.service.

export async function provisionKafkaTopicsActivity(params: RdsActivityParams): Promise<void> {
  const provisioner = new KafkaTopicProvisioner();
  try {
    await provisioner.connect();
    await provisioner.provisionTenant(params.tenantId);
    logger.info({ tenantId: params.tenantId }, 'enterprise.kafka.topics.provisioned');
  } finally {
    await provisioner.disconnect();
  }
}

// ── Emit completion event ──────────────────────────────────────────────────

export async function emitProvisionedEventActivity(params: RdsWithEndpointParams): Promise<void> {
  // Queued through the outbox rather than published inline. This activity runs at the END of a long
  // provisioning workflow — dedicated RDS, VPC peering, Route 53 — and a broker blip at that moment
  // used to throw, which made Temporal retry the ACTIVITY, not just the publish. Retrying an emit is
  // harmless; what made it worth changing is that until the retries were exhausted the workflow could
  // not complete, over an event that nothing is waiting on synchronously.
  const outbox = new EventOutboxService();
  try {
    await outbox.publish({
      event_type: 'platform.enterprise.db_provisioned.v1',
      event_version: '1.0',
      tenant_id: 'platform',
      actor_id: 'system',
      occurred_at: new Date().toISOString(),
      correlation_id: randomUUID(),
      payload: { tenant_id: params.tenantId, rds_endpoint: params.rdsEndpoint },
    });
    logger.info({ tenantId: params.tenantId }, 'platform.enterprise.db_provisioned.v1.emitted');
  } finally {
    await outbox.onModuleDestroy();
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function getPlatformTenantCode(tenantId: string): Promise<string> {
  const prisma = createPrismaClient(DATABASE_URL);
  try {
    const [row] = await prisma.$queryRaw<Array<{ tenant_code: string }>>`
      SELECT tenant_code FROM platform.tenants WHERE tenant_id = ${tenantId}::uuid LIMIT 1
    `;
    if (!row) throw new Error(`Tenant ${tenantId} not found`);
    return row.tenant_code;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * ADMIN connection URL — the RDS master role (`cos_admin`).
 *
 * Restricted to provisioning steps that genuinely need ownership: running migrations and creating the
 * app role. It must NEVER be stored in `platform.tenants.dedicated_db_url`, because that column feeds
 * TenantPrismaService and would run every tenant query as the DB owner, bypassing RLS (security review
 * F4). The password is the AWS-managed one, read from Secrets Manager — the instance is created with
 * ManageMasterUserPassword, so no environment variable holds it.
 */
async function buildMasterDbUrl(rdsEndpoint: string, masterSecretArn: string): Promise<string> {
  const password = await readMasterPassword(masterSecretArn);
  return `postgresql://cos_admin:${encodeURIComponent(password)}@${rdsEndpoint}:5432/cos`;
}

/**
 * RUNTIME connection URL — the non-owner `app_user` role, so PostgreSQL RLS is enforced on the
 * dedicated database exactly as it is on the shared one (spec §7.7, QM-18, ADR-008). This is the URL
 * stored in `dedicated_db_url`.
 */
async function buildAppDbUrl(rdsEndpoint: string, tenantCode: string): Promise<string> {
  const password = await ensureAppUserPassword(tenantCode);
  return `postgresql://app_user:${encodeURIComponent(password)}@${rdsEndpoint}:5432/cos`;
}

void TEMPORAL_ADDRESS; // referenced by worker
