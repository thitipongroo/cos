// Integration tests: Kafka → ClickHouse → API — Phase 14, TC-P14-INT-001
//
// §35.13 ESC-38 and ESC-39. This is the leg ESC-33 left open, and running it end to end found the
// pipeline does not work. Two independent blockers, either of which alone stops every event: the
// shipped `payload` Tuple cannot decode the shipped Avro schema (ESC-39), and the application
// publishes to a topic the engine tables never subscribe to (ESC-38).
//
// The harness is deliberately faithful: a real Kafka (KRaft), a real Confluent Schema Registry and
// a real ClickHouse on one Docker network, using the SAME images and the SAME broker/registry
// configuration as docker-compose.yml, with the network aliases `kafka` and `schema-registry` so
// `02-kafka-tables.sql` — which hard-codes `kafka:9092` — and `users.d/analytics.xml` both apply
// **verbatim**. All four DDL files load unmodified from infrastructure/clickhouse/.
//
// These tests assert the CURRENT, BROKEN behaviour on purpose, because a silent pipeline is
// exactly what nobody notices. **When ESC-38 and ESC-39 are fixed, these assertions must be
// inverted, not deleted** — each one says so at the point it matters.

import { createClient, type ClickHouseClient } from '@clickhouse/client';
import { Kafka, type Producer } from 'kafkajs';
import {
  GenericContainer,
  Network,
  type StartedNetwork,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';
import * as fs from 'fs';
import * as path from 'path';

import { AnalyticsService } from '../src/modules/analytics/analytics.service';
import { EVENT_AVSC_MAP, encodeAvro, registerSchema, topicForEvent } from '@cos/kafka';

const TENANT = 'aaaaaaaa-0001-4000-8000-000000000001';
const PROJECT = 'cccccccc-0001-4000-8000-000000000001';
const EVENT_DATE = '2026-06-08';
const TOPIC = 'construction.project.created';
const EVENT_TYPE = 'construction.project.created.v1';

/** Fixed, because a broker's advertised host listener is baked in before the port is mapped. */
const KAFKA_HOST_PORT = 29092;

const REPO_ROOT = path.resolve(__dirname, '../..');
const CH_DIR = path.join(REPO_ROOT, 'infrastructure/clickhouse');

const noCache = { get: async () => undefined, set: async () => undefined } as never;

async function applyDdl(ch: ClickHouseClient, file: string): Promise<void> {
  const sql = fs.readFileSync(path.join(CH_DIR, 'initdb.d', file), 'utf8');
  // Strip whole-line -- comments before splitting on ';': the DDL documents each table in prose
  // that contains semicolons of its own.
  const stripped = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  for (const statement of stripped
    .split(';')
    .map((t) => t.trim())
    .filter(Boolean)) {
    await ch.command({ query: statement });
  }
}

async function eventually<T>(
  read: () => Promise<T>,
  holds: (value: T) => boolean,
  timeoutMs: number,
  label: string,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T = await read();
  while (Date.now() < deadline) {
    if (holds(last)) return last;
    await new Promise((r) => setTimeout(r, 2_000));
    last = await read();
  }
  throw new Error(`${label}: never held within ${timeoutMs}ms. Last: ${JSON.stringify(last)}`);
}

describe('Kafka → ClickHouse → API (Testcontainers)', () => {
  jest.setTimeout(900_000);

  let network: StartedNetwork;
  let kafka: StartedTestContainer;
  let registry: StartedTestContainer;
  let clickhouse: StartedTestContainer;
  let ch: ClickHouseClient;
  let producer: Producer;
  let service: AnalyticsService;
  let schemaId: number;

  const projectPayload = {
    project_id: PROJECT,
    project_code: 'PROJ-BKK-001',
    project_name: 'Bangkok Riverside Tower',
    project_type: 'COMMERCIAL',
    budget: { amount: '1000000.0000', currency_code: 'THB' },
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    created_by: '99999999-0001-4000-8000-000000000001',
  };

  function envelope(eventId: string): Record<string, unknown> {
    return {
      event_id: eventId,
      event_type: EVENT_TYPE,
      event_version: 'v1',
      tenant_id: TENANT,
      actor_id: '99999999-0001-4000-8000-000000000001',
      occurred_at: `${EVENT_DATE}T09:00:00Z`,
      correlation_id: '88888888-0001-4000-8000-000000000001',
      trace_id: null,
      span_id: null,
      payload: projectPayload,
    };
  }

  async function publish(topic: string, eventId: string): Promise<void> {
    await producer.send({
      topic,
      messages: [{ value: await encodeAvro(schemaId, envelope(eventId)) }],
    });
  }

  beforeAll(async () => {
    network = await new Network().start();

    // Copied from docker-compose.yml, with one deliberate difference: the host listener advertises
    // the fixed port bound below, since advertised listeners are fixed at boot.
    kafka = await new GenericContainer('confluentinc/cp-kafka:8.3.0')
      .withNetwork(network)
      .withNetworkAliases('kafka')
      .withEnvironment({
        KAFKA_NODE_ID: '1',
        KAFKA_PROCESS_ROLES: 'broker,controller',
        KAFKA_LISTENERS: `PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093,PLAINTEXT_HOST://0.0.0.0:${KAFKA_HOST_PORT}`,
        KAFKA_ADVERTISED_LISTENERS: `PLAINTEXT://kafka:9092,PLAINTEXT_HOST://localhost:${KAFKA_HOST_PORT}`,
        KAFKA_LISTENER_SECURITY_PROTOCOL_MAP:
          'PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT',
        KAFKA_CONTROLLER_QUORUM_VOTERS: '1@kafka:9093',
        KAFKA_CONTROLLER_LISTENER_NAMES: 'CONTROLLER',
        KAFKA_INTER_BROKER_LISTENER_NAME: 'PLAINTEXT',
        KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: '1',
        KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: '1',
        KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: '1',
        KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'true',
        KAFKA_LOG_DIRS: '/var/lib/kafka/data',
        CLUSTER_ID: 'h-CJFTy_TE2EQva8gyOGJA',
      })
      .withExposedPorts({ container: KAFKA_HOST_PORT, host: KAFKA_HOST_PORT })
      .withWaitStrategy(Wait.forLogMessage(/Kafka Server started/, 1))
      .withStartupTimeout(300_000)
      .start();

    registry = await new GenericContainer('confluentinc/cp-schema-registry:8.3.0')
      .withNetwork(network)
      .withNetworkAliases('schema-registry')
      .withEnvironment({
        SCHEMA_REGISTRY_HOST_NAME: 'schema-registry',
        SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS: 'kafka:9092',
        SCHEMA_REGISTRY_KAFKASTORE_TOPIC_REPLICATION_FACTOR: '1',
        SCHEMA_REGISTRY_LISTENERS: 'http://0.0.0.0:8081',
      })
      .withExposedPorts(8081)
      .withWaitStrategy(Wait.forHttp('/subjects', 8081).forStatusCode(200))
      .withStartupTimeout(300_000)
      .start();

    const brokers = [`localhost:${KAFKA_HOST_PORT}`];
    const client = new Kafka({ clientId: 'p14-test', brokers });

    // Create the topic before ClickHouse subscribes; otherwise the engine tables sit in
    // "Can't get assignment" and the run measures the harness rather than the DDL.
    const admin = client.admin();
    await admin.connect();
    await admin.createTopics({
      topics: [{ topic: TOPIC, numPartitions: 1, replicationFactor: 1 }],
    });
    await admin.disconnect();

    // The ClickHouse version docker-compose actually deploys. This matters: the 24.8 image cannot
    // negotiate with cp-kafka 8.3.0 at all ("Required feature not supported by broker"), so testing
    // against it would have measured a version pairing this project does not ship.
    clickhouse = await new GenericContainer('clickhouse/clickhouse-server:26.3-alpine')
      .withNetwork(network)
      .withNetworkAliases('clickhouse')
      .withEnvironment({
        CLICKHOUSE_DB: 'analytics',
        CLICKHOUSE_USER: 'cos',
        CLICKHOUSE_PASSWORD: 'cos_test',
        CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: '1',
      })
      .withBindMounts([
        {
          source: path.join(CH_DIR, 'users.d/analytics.xml'),
          target: '/etc/clickhouse-server/users.d/analytics.xml',
          mode: 'ro',
        },
      ])
      .withExposedPorts(8123)
      .withWaitStrategy(Wait.forHttp('/ping', 8123).forStatusCode(200))
      .withStartupTimeout(300_000)
      .start();

    ch = createClient({
      url: `http://${clickhouse.getHost()}:${clickhouse.getMappedPort(8123)}`,
      username: 'cos',
      password: 'cos_test',
      database: 'analytics',
      request_timeout: 120_000,
    });

    process.env['SCHEMA_REGISTRY_URL'] =
      `http://${registry.getHost()}:${registry.getMappedPort(8081)}`;
    schemaId = await registerSchema(EVENT_TYPE, EVENT_AVSC_MAP[EVENT_TYPE]!);

    for (const file of [
      '01-database.sql',
      '02-kafka-tables.sql',
      '03-aggregation-tables.sql',
      '04-materialized-views.sql',
    ]) {
      await applyDdl(ch, file);
    }

    // A copy of the shipped definition with the two settings that hide failures removed. Same
    // columns, same format, its own consumer group. `kafka_handle_error_mode = 'stream'` surfaces
    // a decode failure through the `_error` virtual column instead of dropping the row, and
    // `kafka_skip_broken_messages = 0` stops it being skipped.
    await ch.command({
      query: `
        CREATE TABLE analytics.probe_project_created
        (
            event_id    String,
            tenant_id   String,
            occurred_at String,
            payload     Tuple(
                project_id  String,
                budget      Tuple(amount String, currency_code String)
            )
        )
        ENGINE = Kafka
        SETTINGS
            kafka_broker_list          = 'kafka:9092',
            kafka_topic_list           = '${TOPIC}',
            kafka_group_name           = 'probe-group',
            kafka_format               = 'AvroConfluent',
            kafka_num_consumers        = 1,
            kafka_skip_broken_messages = 0,
            kafka_handle_error_mode    = 'stream'
      `,
    });

    producer = client.producer();
    await producer.connect();

    await publish(TOPIC, '11111111-0000-4000-8000-000000000001');

    service = new AnalyticsService(ch, noCache);
  }, 1_200_000);

  afterAll(async () => {
    delete process.env['SCHEMA_REGISTRY_URL'];
    await producer?.disconnect();
    await ch?.close();
    await clickhouse?.stop();
    await registry?.stop();
    await kafka?.stop();
    await network?.stop();
  });

  describe('the plumbing is sound — broker, registry and consumer all work', () => {
    it('applies users.d/analytics.xml, so the engine knows where the registry is', async () => {
      const rows = await (
        await ch.query({
          query: `SELECT value FROM system.settings WHERE name = 'format_avro_schema_registry_url'`,
          format: 'JSONEachRow',
        })
      ).json<{ value: string }>();
      expect(rows[0]!.value).toBe('http://schema-registry:8081');
    });

    it('assigns the shipped engine table a partition and reads the message off it', async () => {
      const read = async () =>
        (
          await ch.query({
            query: `SELECT num_messages_read AS n FROM system.kafka_consumers WHERE \`table\` = 'kafka_construction_project_created'`,
            format: 'JSONEachRow',
          })
        ).json<{ n: string }>();

      const rows = await eventually(
        read,
        (r) => r.length > 0 && Number(r[0]!.n) > 0,
        180_000,
        'the engine table never read a message',
      );
      // The message is consumed. Whatever is wrong, it is not connectivity.
      expect(Number(rows[0]!.n)).toBeGreaterThan(0);
    });
  });

  describe('ESC-39 — the shipped payload Tuple cannot decode the shipped Avro schema', () => {
    it('reports a leaf-count mismatch on the payload column', async () => {
      const read = async () =>
        (
          await ch.query({
            query: `SELECT _error FROM analytics.probe_project_created LIMIT 1`,
            format: 'JSONEachRow',
            clickhouse_settings: { stream_like_engine_allow_direct_select: 1 },
          })
        ).json<{ _error: string }>();

      const rows = await eventually(
        read,
        (r) => r.length > 0,
        180_000,
        'the probe table returned nothing',
      );

      // 02-kafka-tables.sql declares `payload Tuple(project_id, budget)` and its comment states the
      // intent: "only fields needed for aggregation are declared". ClickHouse's Avro reader does
      // not support that — the Tuple must have as many leaves as the Avro record, and
      // ProjectCreatedPayload has eight fields.
      // WHEN ESC-39 IS FIXED THIS MUST ASSERT AN EMPTY _error AND A DECODED payload.
      expect(rows[0]!._error).toMatch(
        /number of leaves in record doesn't match the number of elements in tuple/,
      );
      expect(rows[0]!._error).toMatch(/column payload/);
    });

    it('drops the row silently in the shipped table, because skip_broken_messages hides it', async () => {
      // The shipped tables carry kafka_skip_broken_messages = 100, so the same failure produces no
      // error anywhere: no exception on the consumer, nothing in system.errors, just no rows. That
      // is what let this survive — a broken pipeline and an idle one look identical.
      const consumers = await (
        await ch.query({
          query: `SELECT length(exceptions.text) AS exceptionCount FROM system.kafka_consumers WHERE \`table\` = 'kafka_construction_project_created'`,
          format: 'JSONEachRow',
        })
      ).json<{ exceptionCount: string }>();
      expect(Number(consumers[0]!.exceptionCount)).toBe(0);

      const target = await (
        await ch.query({
          query: 'SELECT count() AS c FROM analytics.project_cost_daily',
          format: 'JSONEachRow',
        })
      ).json<{ c: string }>();
      // WHEN ESC-39 IS FIXED THIS MUST BECOME 1.
      expect(Number(target[0]!.c)).toBe(0);
    });
  });

  describe('ESC-38 — the application publishes where the engine tables do not listen', () => {
    it('routes to a tenant-prefixed, versioned topic', () => {
      // Pure function; no I/O. This is the routing every publish goes through.
      const actual = topicForEvent(EVENT_TYPE, TENANT);
      expect(actual).toBe(`${TENANT}.${EVENT_TYPE}`);
      // What 02-kafka-tables.sql subscribes to:
      expect(actual).not.toBe(TOPIC);
    });

    it('subscribes every engine table to a bare name no publisher ever writes', async () => {
      const rows = await (
        await ch.query({
          query: `SELECT name, create_table_query AS ddl
                  FROM system.tables
                  WHERE database = 'analytics' AND engine = 'Kafka' AND name != 'probe_project_created'
                  ORDER BY name`,
          format: 'JSONEachRow',
        })
      ).json<{ name: string; ddl: string }>();

      expect(rows).toHaveLength(8);
      for (const row of rows) {
        const topic = /kafka_topic_list\s*=\s*'([^']+)'/.exec(row.ddl)?.[1];
        expect(topic).toBeDefined();
        // No tenant prefix and no version suffix — neither shape any publisher produces.
        expect(topic).not.toMatch(/^[0-9a-f-]{36}\./);
        expect(topic).not.toMatch(/\.v\d+$/);
      }
    });
  });

  describe('the end-to-end consequence', () => {
    it('leaves the executive dashboard empty after a published event', async () => {
      // Both blockers land in the same place: the dashboard reports nothing, with no error to
      // explain it. This is the state TC-P14-INT-001 was written to detect.
      // WHEN ESC-38 AND ESC-39 ARE FIXED THIS MUST ASSERT THE PUBLISHED FIGURES.
      const rows = await service.getExecutiveDashboard(
        TENANT,
        [PROJECT],
        `${EVENT_DATE},${EVENT_DATE}`,
      );
      expect(rows).toEqual([]);
    });
  });
});
