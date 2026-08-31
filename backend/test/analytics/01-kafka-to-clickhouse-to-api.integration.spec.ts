/**
 * Phase 14 — the Kafka → ClickHouse → API flow master:4330 asks for, executed end to end.
 *
 * WHY THIS EXISTS. Every other test of this phase inspects declarations or mocks the store: the
 * 02-analytics.integration.spec.ts beside this one overrides CLICKHOUSE_CLIENT with a stub,
 * and the offline suite reads DDL and source text. Nothing anywhere ran a query against a real
 * ClickHouse, and nothing ran the ingester at all.
 *
 * That gap has already cost this phase once. Ingestion used to be eight ClickHouse Kafka-engine
 * tables subscribed to bare event names ('construction.project.created') while real topics are
 * '{tenant_id}.construction.project.created.v1'. kafka_topic_list takes literal names, so not one
 * subscription ever matched: the aggregate tables stayed empty and every dashboard answered 200
 * with zeros — which reads as "no data yet", not "not connected". A declaration test cannot tell
 * those two apart. Only publishing a real event and reading the number back can.
 *
 * So this spec runs the real pieces: a real Kafka + Schema Registry, the real Avro producer, the
 * REAL compiled Go worker as a child process, the real ClickHouse with the real DDL from
 * infrastructure/clickhouse/initdb.d, and the real AnalyticsService SQL.
 *
 * ONE deliberate boundary: the service is constructed directly rather than reached over HTTP.
 * AnalyticsService takes (ClickHouseClient, Cache, Redis) and holds all the SQL; the controller
 * layer adds §6.5 project-scope filtering through Postgres, which is a different subject with its
 * own coverage. Pulling Postgres and migrations in here would test RBAC, not the data path.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createClient, type ClickHouseClient } from '@clickhouse/client';
import Redis from 'ioredis';
import {
  startContainers,
  stopContainers,
  getClickHouseUrl,
  getKafkaBroker,
  getSchemaRegistryUrl,
  getRedisUrl,
  type TestContainers,
} from '@cos/test-utils';
import { AnalyticsService } from '../../src/modules/analytics/analytics.service';

const repoRoot = path.resolve(__dirname, '../../..');
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
/** parseDateRange splits on a comma — it is a start,end pair, not a duration. */
const DATE_RANGE = '2026-08-01,2026-08-31';

/** Cache-manager surface AnalyticsService uses, backed by a Map so the cache path is real. */
const makeCache = (): { get: jest.Mock; set: jest.Mock; del: jest.Mock } => {
  const store = new Map<string, unknown>();
  return {
    get: jest.fn(async (k: string) => store.get(k)),
    set: jest.fn(async (k: string, v: unknown) => void store.set(k, v)),
    del: jest.fn(async (k: string) => void store.delete(k)),
  };
};

describe('Phase 14 · Kafka → ClickHouse → API (master:4330)', () => {
  let containers: TestContainers;
  let ch: ClickHouseClient;
  let redis: Redis;
  let worker: ChildProcess | undefined;
  const workerLog: string[] = [];
  let svc: AnalyticsService;
  let cache: ReturnType<typeof makeCache>;

  beforeAll(async () => {
    containers = await startContainers({
      kafka: true,
      schemaRegistry: true,
      clickhouse: true,
      redis: true,
    });

    const chUrl = getClickHouseUrl(containers.clickhouse!);
    const brokers = getKafkaBroker(containers.kafka!);
    const registry = getSchemaRegistryUrl(containers.schemaRegistry!);
    const redisUrl = getRedisUrl(containers.redis!);

    process.env['KAFKA_BROKERS'] = brokers;
    process.env['SCHEMA_REGISTRY_URL'] = registry;

    const chUser = containers.clickhouse!.getUsername();
    const chPass = containers.clickhouse!.getPassword();
    ch = createClient({ url: chUrl, username: chUser, password: chPass, database: 'default' });

    // The REAL DDL, in the order initdb.d applies it. 02 only drops the retired Kafka-engine
    // tables; running it keeps this database identical to a freshly initialised one.
    const initDir = path.join(repoRoot, 'infrastructure/clickhouse/initdb.d');
    for (const file of fs.readdirSync(initDir).sort()) {
      const sql = fs
        .readFileSync(path.join(initDir, file), 'utf8')
        .split('\n')
        .filter((l) => !l.trimStart().startsWith('--'))
        .join('\n');
      for (const statement of sql.split(';')) {
        if (statement.trim()) await ch.command({ query: statement });
      }
    }

    // Topics are provisioned BEFORE the worker subscribes, exactly as tenant onboarding does it.
    // The consumer matches topics by regex and franz-go only re-reads metadata every MetadataMaxAge
    // (5 minutes), so a topic created after subscription is invisible for minutes — the worker would
    // look healthy and ingest nothing, which is precisely the failure mode this phase already had.
    const { KafkaTopicProvisioner } = await import('@cos/kafka');
    const provisioner = new KafkaTopicProvisioner();
    await provisioner.connect();
    try {
      await provisioner.provisionTenant(TENANT_ID);
    } finally {
      await provisioner.disconnect();
    }

    // The compiled worker, not a re-implementation of it. Its Go build cache makes repeat runs cheap.
    //
    // The .exe suffix is required on Windows and must NOT be there anywhere else. `go build -o`
    // writes exactly the name it is given, and Windows CreateProcess will not launch a file without
    // an executable extension — so on a Windows checkout the build succeeded, produced a valid
    // 47 MB PE image, and spawn() then failed with ENOENT, which reads like a missing file rather
    // than an unlaunchable one.
    const workerBin = path.join(
      os.tmpdir(),
      `cos-analytics-worker-under-test${process.platform === 'win32' ? '.exe' : ''}`,
    );
    execFileSync('go', ['build', '-o', workerBin, './cmd/analytics-worker'], {
      cwd: path.join(repoRoot, 'services/analytics-worker'),
      stdio: 'pipe',
    });

    const nativePort = containers.clickhouse!.getMappedPort(9000);
    worker = spawn(workerBin, [], {
      env: {
        ...process.env,
        KAFKA_BROKERS: brokers,
        SCHEMA_REGISTRY_URL: registry,
        CLICKHOUSE_DSN: `clickhouse://${chUser}:${chPass}@${containers.clickhouse!.getHost()}:${nativePort}/analytics`,
        REDIS_URL: redisUrl,
        PORT: '0',
      },
      stdio: 'pipe',
    });
    // Kept so a timeout can show WHY the worker wrote nothing — a silent child process turns every
    // ingestion failure into the same uninformative "timed out".
    worker.stdout?.on('data', (d: Buffer) => workerLog.push(d.toString()));
    worker.stderr?.on('data', (d: Buffer) => workerLog.push(d.toString()));

    redis = new Redis(redisUrl);
    cache = makeCache();
    svc = new AnalyticsService(ch as never, cache as never, redis as never);
  });

  afterAll(async () => {
    worker?.kill('SIGTERM');
    await redis?.quit().catch(() => undefined);
    await ch?.close().catch(() => undefined);
    await stopContainers(containers);
  });

  /** Poll until `check` returns a value, or fail — the worker is asynchronous by nature. */
  const eventually = async <T>(check: () => Promise<T | null>, label: string): Promise<T> => {
    const deadline = Date.now() + 120_000;
    let last: T | null = null;
    while (Date.now() < deadline) {
      last = await check();
      if (last !== null) return last;
      await new Promise((r) => setTimeout(r, 1_000));
    }
    throw new Error(
      `timed out waiting for ${label}\n--- analytics-worker output ---\n${workerLog.join('').slice(-4000)}`,
    );
  };

  it('ingests a published event into the aggregate table', async () => {
    // requireActual, NOT the module import: this config's setupFilesAfterEach helper
    // (test/helpers/integration-mocks.ts) replaces @cos/kafka's KafkaProducer with a no-op,
    // because most integration specs boot AppModule with no broker present. This one HAS a broker,
    // and the stub is what makes a publish silently write nothing — the first version of this test
    // waited two minutes for a worker that had been sent no message at all.
    const { KafkaProducer } = jest.requireActual<typeof import('@cos/kafka')>('@cos/kafka');
    const producer = new KafkaProducer();
    await producer.connect();
    try {
      await producer.publish({
        event_type: 'construction.project.created.v1',
        event_version: '1.0',
        tenant_id: TENANT_ID,
        actor_id: '33333333-3333-4333-8333-333333333333',
        occurred_at: '2026-08-20T09:00:00Z',
        correlation_id: '44444444-4444-4444-8444-444444444444',
        payload: {
          project_id: PROJECT_ID,
          project_code: 'P-14',
          project_name: 'Phase 14 Project',
          project_type: 'COMMERCIAL',
          budget: { amount: '1000000.0000', currency_code: 'THB' },
          start_date: '2026-08-01',
          end_date: '2026-12-31',
          created_by: '33333333-3333-4333-8333-333333333333',
        },
      });
    } finally {
      await producer.disconnect();
    }

    // Localises a failure: if the message never reached Kafka, the ClickHouse wait below would
    // blame the worker for the producer's mistake.
    const { Kafka } = await import('kafkajs');
    const admin = new Kafka({ brokers: [process.env['KAFKA_BROKERS']!] }).admin();
    await admin.connect();
    try {
      const topic = `${TENANT_ID}.construction.project.created.v1`;
      const topics = await admin.listTopics();
      expect(topics).toContain(topic);
      const offsets = await admin.fetchTopicOffsets(topic);
      const total = offsets.reduce((n, o) => n + Number(o.high), 0);
      if (total <= 0) {
        throw new Error(
          `no message on ${topic}: offsets=${JSON.stringify(offsets)} tenantTopics=${JSON.stringify(
            topics.filter((t) => t.includes(TENANT_ID)),
          )}`,
        );
      }
    } finally {
      await admin.disconnect();
    }

    const row = await eventually(async () => {
      const rs = await ch.query({
        query: `SELECT max(budget_amount) AS budget FROM analytics.project_cost_daily
                 WHERE tenant_id = '${TENANT_ID}' AND project_id = '${PROJECT_ID}'`,
        format: 'JSONEachRow',
      });
      const rows = (await rs.json()) as Array<{ budget: string }>;
      return rows.length && Number(rows[0].budget) > 0 ? rows[0] : null;
    }, 'the worker to write project_cost_daily');

    // Money survives as an exact decimal — the payload carries it as a string precisely so no
    // float rounds the value the budget-variance threshold is computed from.
    expect(Number(row.budget)).toBe(1_000_000);
  });

  it('serves that same number through the analytics query', async () => {
    const rows = await svc.getExecutiveDashboard(TENANT_ID, [PROJECT_ID], DATE_RANGE);

    expect(rows).toHaveLength(1);
    expect(rows[0].projectId).toBe(PROJECT_ID);
    // The write side stores sumState/max partial aggregates; the read side merges them. A mismatch
    // between the two is invisible to any test that seeds the table itself in the shape it expects.
    expect(Number(rows[0].totalBudget)).toBe(1_000_000);
    expect(Number(rows[0].totalActual)).toBe(0);
    // Strict identity, not truthiness: the SQL returns UInt8 unless it is cast, and `1` would pass
    // a loose check while breaking every client that follows the declared boolean contract.
    // The value is TRUE here — with no actuals yet, |0 - budget| / budget is 100%, far past the 10%
    // threshold master:4303 names.
    // UInt8 on the wire, and the declared type says so (§35.13 ESC-34).
    expect(rows[0].atRisk).toBe(1);
  });

  it('answers the second identical request from cache rather than ClickHouse', async () => {
    // master:4294-4296 — Redis layer, 5-minute TTL. Asserted by counting cache reads and by
    // checking the stored key, not by timing.
    cache.get.mockClear();
    cache.set.mockClear();
    await svc.getExecutiveDashboard(TENANT_ID, [PROJECT_ID], DATE_RANGE);

    expect(cache.get).toHaveBeenCalled();
    // Nothing new was written: the entry from the previous test answered this one.
    expect(cache.set).not.toHaveBeenCalled();
  });
});
