/**
 * DEV ONLY — a Temporal worker that runs the REAL `enterpriseProvisioningWorkflow` with every activity replaced
 * by a stub, so a local stack can show the SYSTEM_ADMIN panel's provisioning states (product-owner decision
 * 2026-09-15, revision R11). It lives under `test/`, which `tsconfig.build.json` excludes, so it never ships.
 *
 * WHY IT EXISTS. The panel reads each ENTERPRISE tenant's state by querying `workflowState` on
 * `enterprise-provisioning-<tenantId>`; a query is answered only while a worker polls the task queue, and the
 * real first activity creates an AWS RDS instance. Locally there is neither. This worker supplies the first
 * and skips the second. The WORKFLOW — its states, its gate, its signals — is the production file, loaded by
 * `workflowsPath`; only the activities are fake.
 *
 * WHAT THE STUBS DO. Nothing that persists: no RDS, no migration, no URL written to `platform.tenants`, no
 * notification, no Kafka topic, no event. Each returns the shape the workflow expects, so a run walks
 * CREATING_RDS → … → AWAITING_APPROVAL and waits for a real Approve / Abort from the panel.
 * A tenant whose CODE is listed in `COS_DEV_STUB_HOLD` (comma-separated) is held in CREATING_RDS instead:
 * `createRdsActivity` sleeps 25 minutes and then fails, and the workflow's own retry policy (3 attempts,
 * 30 m start-to-close) keeps it there for roughly 75 minutes before the run fails. Long enough to capture.
 *
 * REFUSES TO START unless TEMPORAL_ADDRESS and DATABASE_URL both point at localhost / 127.0.0.1.
 *
 * Run from `backend/`, with the root .env loaded, while capturing:
 *   set -a; . ../.env; set +a
 *   COS_DEV_STUB_HOLD=<tenant_code> npx ts-node test/dev/provisioning-stub-worker.ts
 * Stop it with Ctrl+C. Do not run it next to the real worker (`src/workers/main.ts`): both would poll the
 * same queue and whichever took a task would decide whether AWS is called.
 */

import { Worker } from '@temporalio/worker';
import { Client as PgClient } from 'pg';

const TASK_QUEUE = 'enterprise-provisioning';
const TEMPORAL_ADDRESS = process.env['TEMPORAL_ADDRESS'] ?? 'localhost:7233';
const DATABASE_URL = process.env['DATABASE_URL'] ?? '';
const HOLD_CODES = new Set(
  (process.env['COS_DEV_STUB_HOLD'] ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean),
);
const HOLD_MS = 25 * 60 * 1000;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

function assertLocal(): void {
  const temporalHost = TEMPORAL_ADDRESS.split(':')[0] ?? '';
  let dbHost = '';
  try {
    dbHost = new URL(DATABASE_URL).hostname;
  } catch {
    dbHost = '';
  }
  if (!LOCAL_HOSTS.has(temporalHost) || !LOCAL_HOSTS.has(dbHost)) {
    throw new Error(
      `provisioning-stub-worker refuses to run: TEMPORAL_ADDRESS host "${temporalHost}" and DATABASE_URL host ` +
        `"${dbHost}" must both be localhost or 127.0.0.1`,
    );
  }
}

async function tenantCode(tenantId: string): Promise<string> {
  const pg = new PgClient({ connectionString: DATABASE_URL });
  await pg.connect();
  try {
    const res = await pg.query<{ tenant_code: string }>(
      'SELECT tenant_code FROM platform.tenants WHERE tenant_id = $1::uuid',
      [tenantId],
    );
    return res.rows[0]?.tenant_code ?? '';
  } finally {
    await pg.end();
  }
}

const log = (activity: string, tenantId: string, note = ''): void => {
  console.log(`[stub] ${activity} tenant=${tenantId}${note ? ` ${note}` : ''}`);
};

const noop =
  (name: string) =>
  async (params: { tenantId: string }): Promise<void> => {
    log(name, params.tenantId);
  };

const activities = {
  async createRdsActivity(params: {
    tenantId: string;
  }): Promise<{ rdsEndpoint: string; masterSecretArn: string }> {
    const code = await tenantCode(params.tenantId);
    if (HOLD_CODES.has(code)) {
      log('createRdsActivity', params.tenantId, `code=${code} HELD`);
      await new Promise((resolve) => setTimeout(resolve, HOLD_MS));
      throw new Error(`stub: ${code} is held in CREATING_RDS (COS_DEV_STUB_HOLD)`);
    }
    log('createRdsActivity', params.tenantId, `code=${code}`);
    return {
      rdsEndpoint: 'stub-rds.localhost',
      masterSecretArn: 'arn:stub:secretsmanager:local:0:secret:none',
    };
  },
  runMigrationsActivity: noop('runMigrationsActivity'),
  secureAppUserActivity: noop('secureAppUserActivity'),
  assignDedicatedDbActivity: noop('assignDedicatedDbActivity'),
  notifyAwaitingApprovalActivity: noop('notifyAwaitingApprovalActivity'),
  compensateAssignDedicatedDbActivity: noop('compensateAssignDedicatedDbActivity'),
  compensateCreateRdsActivity: noop('compensateCreateRdsActivity'),
  migrateDataActivity: noop('migrateDataActivity'),
  verifyRoutingActivity: noop('verifyRoutingActivity'),
  provisionKafkaTopicsActivity: noop('provisionKafkaTopicsActivity'),
  emitProvisionedEventActivity: noop('emitProvisionedEventActivity'),
};

async function main(): Promise<void> {
  assertLocal();
  const worker = await Worker.create({
    taskQueue: TASK_QUEUE,
    workflowsPath:
      require.resolve('../../src/modules/tenant/workflows/enterprise-provisioning.workflow'),
    activities,
  });
  console.log(
    `[stub] provisioning-stub-worker polling "${TASK_QUEUE}" at ${TEMPORAL_ADDRESS}; held codes: ${
      [...HOLD_CODES].join(', ') || '(none)'
    }`,
  );
  await worker.run();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
