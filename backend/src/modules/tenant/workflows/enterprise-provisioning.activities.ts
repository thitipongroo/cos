import { PrismaClient } from '@prisma/client';
import { KafkaProducer, KafkaTopicProvisioner } from '@cos/shared';
import { createLogger } from '@cos/logger';
import { randomUUID } from 'crypto';

const logger = createLogger('enterprise-provisioning-activities');

const TEMPORAL_ADDRESS = process.env['TEMPORAL_ADDRESS'] ?? 'localhost:7233';
const DATABASE_URL = process.env['DATABASE_URL'] ?? '';

export interface RdsActivityParams {
  tenantId: string;
}
export interface RdsWithEndpointParams {
  tenantId: string;
  rdsEndpoint: string;
}

// ── Activity 1: createRdsActivity ─────────────────────────────────────────

export async function createRdsActivity(
  params: RdsActivityParams,
): Promise<{ rdsEndpoint: string }> {
  const { RDSClient, CreateDBInstanceCommand } = await import('@aws-sdk/client-rds');

  const tenantCode = await getPlatformTenantCode(params.tenantId);
  const env = process.env['NODE_ENV'] ?? 'prod';
  const dbIdentifier = `cos-tenant-${tenantCode.replace(/_/g, '-')}-${env}`;

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

  logger.info({ tenantId: params.tenantId, dbIdentifier, endpoint }, 'rds.instance.created');
  return { rdsEndpoint: endpoint };
}

// ── Activity 2: runMigrationsActivity ─────────────────────────────────────

export async function runMigrationsActivity(params: RdsWithEndpointParams): Promise<void> {
  const { execSync } = await import('child_process');
  const dbUrl = buildDbUrl(params.rdsEndpoint);

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

// ── Activity 3: assignDedicatedDbActivity ─────────────────────────────────

export async function assignDedicatedDbActivity(params: RdsWithEndpointParams): Promise<void> {
  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  try {
    const dbUrl = buildDbUrl(params.rdsEndpoint);
    await prisma.$executeRaw`
      UPDATE platform.tenants
      SET dedicated_db_url = ${dbUrl}, updated_at = now()
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
  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
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

// ── Human gate: notifyAwaitingApprovalActivity ─────────────────────────────

export async function notifyAwaitingApprovalActivity(params: RdsActivityParams): Promise<void> {
  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
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

// ── Activity 4: migrateDataActivity ───────────────────────────────────────

export async function migrateDataActivity(params: RdsWithEndpointParams): Promise<void> {
  const { execSync } = await import('child_process');
  const sharedDbUrl = DATABASE_URL;
  const dedicatedDbUrl = buildDbUrl(params.rdsEndpoint);

  // Check if tenant has existing domain data — skip migration if empty
  const prisma = new PrismaClient({ datasources: { db: { url: sharedDbUrl } } });
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
  const dbUrl = buildDbUrl(params.rdsEndpoint);
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
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
  const kafka = new KafkaProducer();
  try {
    await kafka.connect();
    await kafka.publish({
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
    await kafka.disconnect();
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function getPlatformTenantCode(tenantId: string): Promise<string> {
  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
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

function buildDbUrl(rdsEndpoint: string): string {
  const password = process.env['TENANT_DB_MASTER_PASSWORD'] ?? '';
  return `postgresql://cos_admin:${password}@${rdsEndpoint}:5432/cos`;
}

void TEMPORAL_ADDRESS; // referenced by worker
