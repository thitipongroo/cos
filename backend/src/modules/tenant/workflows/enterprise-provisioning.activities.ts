import { createPrismaClient } from '../../../shared/prisma/create-prisma-client';
import { prismaMigrateDeploy } from './prisma-migrate-deploy';
import { setTenantActiveDrained } from '../../../shared/prisma/tenant-tx';
import { Client as PgClient } from 'pg';
import { ApplicationFailure, asyncLocalStorage as activityContext } from '@temporalio/activity';
import {
  assertBypassesRls,
  copyTenantRows,
  listForeignKeys,
  listTenantTables,
  orderByForeignKeys,
  tenantHasRows,
} from './tenant-data-copy';
import { EventOutboxService } from '../../../shared/events/event-outbox.service';
import { KafkaTopicProvisioner, replayTenantDlq } from '@cos/kafka';
import { createLogger } from '@cos/logger';
import { randomUUID } from 'crypto';
import { readMasterPassword, ensureAppUserPassword } from './tenant-db-secrets';
import {
  decryptDedicatedDbUrl,
  encryptDedicatedDbUrl,
} from '../../../shared/crypto/dedicated-db-url-cipher';
import { createStandaloneNotifier } from '../../notification/public/notification.standalone';
import { PLATFORM_HUMAN_GATE_EVENT_TYPE } from '../../notification/public/event-types';

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
  const dbUrl = await buildMasterDbUrl(params.rdsEndpoint, params.masterSecretArn);

  logger.info(
    { tenantId: params.tenantId, rdsEndpoint: params.rdsEndpoint },
    'migrations.starting',
  );
  // The prisma CLI, with node and no shell, against the TENANT database — see prisma-migrate-deploy.ts
  // for why `npx prisma migrate deploy` with DATABASE_URL could not have done that (D45).
  const { stdout } = await prismaMigrateDeploy(dbUrl);
  logger.info(
    { tenantId: params.tenantId, output: stdout.trim().split('\n').slice(-3).join(' | ') },
    'migrations.complete',
  );
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

// ── Pause / resume the tenant around the copy (D48, 2026-11-13) ──────────────
//
// The copy reads one snapshot of the shared database and routing switches after it, so whatever the tenant
// writes to the shared database in between would be left behind. `is_active = false` turns every request
// of the tenant away (keycloak-jwt.strategy joins `t.is_active = true` → 401) for the copy's duration.
// It does NOT stop writers that resolve the database without a request — withTenantTx
// (shared/workflows/activity-helpers.ts) and notification-prisma.service.ts go through getDbUrlForTenant
// (register Open item). Read and set are separate activities so a retried set cannot record its own
// earlier write as "the state before".

const tenantNotFound = (tenantId: string) =>
  ApplicationFailure.nonRetryable(`tenant ${tenantId} not found`, 'TenantNotFound');

export async function getTenantActiveActivity(params: RdsActivityParams): Promise<boolean> {
  const prisma = createPrismaClient(DATABASE_URL);
  try {
    const rows = await prisma.$queryRaw<Array<{ is_active: boolean }>>`
      SELECT is_active FROM platform.tenants WHERE tenant_id = ${params.tenantId}::uuid
    `;
    // Not retryable: retrying cannot make a missing tenant appear, and the restore path retries forever.
    if (rows.length === 0) throw tenantNotFound(params.tenantId);
    return rows[0]!.is_active;
  } finally {
    await prisma.$disconnect();
  }
}

export async function setTenantActiveActivity(
  params: RdsActivityParams & { active: boolean },
): Promise<void> {
  // Under the tenant's pause lock, exclusive (D51): setting false waits for the tenant's transactions in
  // flight on the shared database to finish, and refuses every later one — the drain before the copy.
  const db = connectionFor(DATABASE_URL, 'tenant-active');
  await db.connect();
  try {
    const n = await setTenantActiveDrained(db, params.tenantId, params.active);
    if (n !== 1) throw tenantNotFound(params.tenantId);
    logger.info(
      { tenantId: params.tenantId, active: params.active },
      params.active ? 'tenant.provisioning.resumed' : 'tenant.provisioning.paused',
    );
  } finally {
    await endQuietly(db);
  }
}

// ── Replay what the pause refused (D53, 2026-11-13) ─────────────────────────
//
// During the pause every consumer refused the tenant's events (TenantInactiveError, D50) and, after its
// retries, sent them to the tenant's DLQ. Once the tenant is active again — resumed, or put back after a
// failure — they are republished onto their original topics. The consumer group is the run's, so a
// retried attempt continues where the last stopped.
export async function replayPausedEventsActivity(params: {
  tenantId: string;
  /** ISO time the workflow paused the tenant. */
  since: string;
  runId: string;
}): Promise<number> {
  const { replayed, skipped } = await replayTenantDlq({
    tenantId: params.tenantId,
    since: new Date(params.since),
    reasonIncludes: 'TenantInactiveError',
    groupId: `cos-dlq-replay.${params.tenantId}.${params.runId}`,
  });
  logger.info({ tenantId: params.tenantId, replayed, skipped }, 'tenant.provisioning.dlq_replayed');
  return replayed;
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
  let tenantName: string;
  try {
    const [tenant] = await prisma.$queryRaw<Array<{ tenant_name: string; tenant_code: string }>>`
      SELECT tenant_name, tenant_code FROM platform.tenants
      WHERE tenant_id = ${params.tenantId}::uuid LIMIT 1
    `;
    tenantName = tenant?.tenant_name ?? params.tenantId;
  } finally {
    await prisma.$disconnect();
  }

  // Routed through the Notification Service, as §19.8 says this gate is ("sent directly by
  // EnterpriseProvisioningWorkflow via the Notification Service — it is NOT a Kafka event").
  // The previous version wrote raw SQL instead, and had drifted from the schema in four ways at once
  // — recipient_user_id / title / lowercase 'in_app' / tenant_id NULL — so it threw on every run.
  // Going through the service also delivers the EMAIL channel §19.8 asks for, which raw SQL never
  // did: the channel set and the wording both come from the templates table now.
  const notifier = createStandaloneNotifier();
  try {
    await notifier.service.notifySystemAdmins(PLATFORM_HUMAN_GATE_EVENT_TYPE, {
      tenant_name: tenantName,
    });
    logger.info({ tenantId: params.tenantId }, 'notify.awaiting_approval.sent');
  } finally {
    await notifier.dispose();
  }
}

// tenant_id is a UUID everywhere it is stored; anything else must never reach a shell command.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(value: string, field: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${field} must be a UUID`);
  }
}

// ── Activity 4: migrateDataActivity ───────────────────────────────────────

export async function migrateDataActivity(params: RdsWithEndpointParams): Promise<void> {
  // A UUID, because the copy puts it into COPY statements as a literal (COPY takes no bind parameters).
  // Every tenant_id in this system is one, so the constraint costs nothing.
  assertUuid(params.tenantId, 'tenantId');

  // Master URL on the target: the load writes every schema and sets session_replication_role, which
  // needs the admin credential (security review F4). The source is DATABASE_URL, which must bypass RLS
  // to read the tenant's rows.
  const dedicatedDbUrl = await buildMasterDbUrl(params.rdsEndpoint, params.masterSecretArn);
  // Heartbeats on a timer as well as with progress: listing the tables, the has-data check, the per-table
  // counts and COMMIT report no progress, and one of them can outlast heartbeatTimeout on a large tenant.
  // The timer keeps a working attempt alive and lets a cancellation through within its period; a worker
  // that dies stops heartbeating all the same.
  const ctx = activityContext.getStore();
  const src = connectionFor(DATABASE_URL, 'source');
  await src.connect();
  const beat = ctx && setInterval(() => ctx.heartbeat({ phase: 'working' }), 30_000).unref();
  try {
    // Before the skip below: under RLS every lookup finds nothing, which would read as "no data" and
    // succeed with the tenant's rows left behind.
    await assertBypassesRls(src, 'source');
    const tables = await listTenantTables(src);
    // Conditional, as specified (master:5738): skipped when the tenant has no existing domain data —
    // any row of any table that moves, not only a project (39 of the 73 tables carry no project_id).
    const hasData = await tenantHasRows(src, params.tenantId, tables);
    if (!hasData) {
      logger.info({ tenantId: params.tenantId }, 'migrate_data.skipped.no_existing_data');
      return;
    }

    const dst = connectionFor(dedicatedDbUrl, 'target');
    await dst.connect();
    try {
      const ordered = orderByForeignKeys(tables, await listForeignKeys(src, tables));
      logger.info({ tenantId: params.tenantId, tables: ordered.length }, 'migrate_data.starting');
      // Heartbeats carry progress and let Temporal tell this attempt to stop (cancellation, or a heartbeat
      // timeout that has already started the next attempt); the signal aborts the stream and the target
      // rolls back. Outside an activity (tests) there is neither.
      const { alreadyCopied, tables: copied } = await copyTenantRows(
        src,
        dst,
        params.tenantId,
        ordered,
        ctx && {
          onProgress: (table) => ctx.heartbeat({ table }),
          signal: ctx.cancellationSignal,
        },
      );
      logger.info(
        {
          tenantId: params.tenantId,
          tables: copied.length,
          rows: copied.reduce((n, c) => n + c.rows, 0),
          nonEmpty: copied.filter((c) => c.rows > 0).map((c) => `${c.table}=${c.rows}`),
        },
        alreadyCopied ? 'migrate_data.already_complete' : 'migrate_data.complete',
      );
    } finally {
      await endQuietly(dst);
    }
  } finally {
    // copyTenantRows closes src itself on an error (a cut-off COPY TO leaves ROLLBACK hanging); closing
    // it again must neither throw nor wait forever.
    clearInterval(beat);
    await endQuietly(src);
  }
}

/**
 * A pg client whose connection errors are logged, not left unhandled: an idle client's 'error' event with
 * no listener (the server or a pooler dropping it) would take the whole worker process down.
 */
function connectionFor(connectionString: string, side: string): PgClient {
  // TCP keepalive: the copy also heartbeats on a timer, so a connection whose peer vanished (a failover,
  // a dropped idle flow) would otherwise leave a query waiting until the activity's 24 h limit. With it
  // the OS probes the peer once the connection has been idle this long and fails the query when it is gone.
  const client = new PgClient({
    connectionString,
    keepAlive: true,
    keepAliveInitialDelayMillis: 30_000,
  });
  client.on('error', (err) =>
    logger.warn({ side, error: err.message }, 'migrate_data.connection_error'),
  );
  return client;
}

/** End a pg client without throwing and without waiting more than a few seconds. */
async function endQuietly(client: PgClient): Promise<void> {
  await Promise.race([
    client.end().catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000).unref()),
  ]);
}

// ── Activity 5: verifyRoutingActivity ─────────────────────────────────────

export async function verifyRoutingActivity(params: RdsWithEndpointParams): Promise<void> {
  // Two databases, two checks (2026-11-13). Routing lives in platform.tenants on the SHARED database —
  // platform never moves (get-db-url.ts) and the dedicated database's own platform.tenants is empty, so
  // reading it there (as this did until then) failed for every real tenant. The stored URL must name the
  // new instance. Then the dedicated database must answer, as the master role: app_user's RLS policies
  // need app.current_tenant_id, which no provisioning activity sets.
  const shared = createPrismaClient(DATABASE_URL);
  try {
    const [row] = await shared.$queryRaw<Array<{ dedicated_db_url: string | null }>>`
      SELECT dedicated_db_url FROM platform.tenants
      WHERE tenant_id = ${params.tenantId}::uuid LIMIT 1
    `;
    if (!row?.dedicated_db_url) {
      throw new Error(
        `verifyRoutingActivity: dedicated_db_url is NULL for tenant ${params.tenantId} — assignDedicatedDbActivity may have failed`,
      );
    }
    const routedHost = new URL(decryptDedicatedDbUrl(row.dedicated_db_url)).hostname;
    if (routedHost !== params.rdsEndpoint) {
      throw new Error(
        `verifyRoutingActivity: tenant ${params.tenantId} is routed to ${routedHost}, not ${params.rdsEndpoint}`,
      );
    }
  } finally {
    await shared.$disconnect();
  }

  const dedicated = createPrismaClient(
    await buildMasterDbUrl(params.rdsEndpoint, params.masterSecretArn),
  );
  try {
    await dedicated.$queryRaw`SELECT 1 AS ok`;
    logger.info({ tenantId: params.tenantId, rdsEndpoint: params.rdsEndpoint }, 'routing.verified');
  } finally {
    await dedicated.$disconnect();
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
  const identity = await getPlatformTenantIdentity(params.tenantId);
  const outbox = new EventOutboxService();
  try {
    await outbox.publish({
      event_type: 'platform.enterprise.db_provisioned.v1',
      event_version: '1.0',
      tenant_id: 'platform',
      actor_id: 'system',
      occurred_at: new Date().toISOString(),
      correlation_id: randomUUID(),
      payload: {
        tenant_id: params.tenantId,
        tenant_name: identity.tenant_name,
        tenant_code: identity.tenant_code,
        rds_endpoint: params.rdsEndpoint,
      },
    });
    logger.info({ tenantId: params.tenantId }, 'platform.enterprise.db_provisioned.v1.emitted');
  } finally {
    await outbox.onModuleDestroy();
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function getPlatformTenantCode(tenantId: string): Promise<string> {
  return (await getPlatformTenantIdentity(tenantId)).tenant_code;
}

/**
 * Tenant display identity for event payloads. §19.8 pins the SYSTEM_ADMIN notification body to
 * "Dedicated DB for {tenant_name} is live" — the Notification Service renders templates from the
 * event payload alone, so the name and code have to be resolved here, at emit time.
 */
async function getPlatformTenantIdentity(
  tenantId: string,
): Promise<{ tenant_code: string; tenant_name: string }> {
  const prisma = createPrismaClient(DATABASE_URL);
  try {
    const [row] = await prisma.$queryRaw<Array<{ tenant_code: string; tenant_name: string }>>`
      SELECT tenant_code, tenant_name FROM platform.tenants WHERE tenant_id = ${tenantId}::uuid LIMIT 1
    `;
    if (!row) throw new Error(`Tenant ${tenantId} not found`);
    return row;
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
