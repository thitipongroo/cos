import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { KafkaContainer, StartedKafkaContainer } from '@testcontainers/kafka';
import { Neo4jContainer, StartedNeo4jContainer } from '@testcontainers/neo4j';
import { MinioContainer, StartedMinioContainer } from '@testcontainers/minio';
import { ClickHouseContainer, StartedClickHouseContainer } from '@testcontainers/clickhouse';
import { GenericContainer, Network, StartedNetwork, StartedTestContainer } from 'testcontainers';

/**
 * The PostgreSQL image every caller gets.
 *
 * TimescaleDB, not plain postgres, because three migrations call `create_hypertable`
 * (ADR-032; master §Phase 18 testcontainers setup states it outright: "backend uses the
 * timescale/timescaledb image"). The image is a superset of stock PostgreSQL, so a service that
 * needs no hypertable is unaffected.
 *
 * This used to be `postgres:16-alpine`. Nothing had noticed because `startContainers` has no caller
 * outside this package's own unit test — but the first suite to run the backend's migrations
 * through it would have failed at migrate time, before reaching a single assertion, with an error
 * about an unknown function rather than about the image. `backend/test/helpers/integration-infra.ts`
 * already uses the right one; these two must not disagree.
 */
export const POSTGRES_IMAGE = 'timescale/timescaledb:latest-pg16';

export interface TestContainers {
  postgres?: StartedPostgreSqlContainer;
  redis?: StartedRedisContainer;
  kafka?: StartedKafkaContainer;
  schemaRegistry?: StartedTestContainer;
  neo4j?: StartedNeo4jContainer;
  minio?: StartedMinioContainer;
  clickhouse?: StartedClickHouseContainer;
  // Internal — used to tear down the shared Kafka+Schema Registry network
  _kafkaNetwork?: StartedNetwork;
}

export interface TestContainersOptions {
  postgres?: boolean;
  redis?: boolean;
  // When schemaRegistry is true, Kafka is started on a shared Docker network so
  // Schema Registry can reach it via the 'kafka' network alias.
  kafka?: boolean;
  schemaRegistry?: boolean;
  neo4j?: boolean;
  minio?: boolean;
  // Analytics tests only (spec §Phase 18 testcontainers setup)
  clickhouse?: boolean;
}

export async function startContainers(opts: TestContainersOptions = {}): Promise<TestContainers> {
  const started: TestContainers = {};
  const independentPromises: Promise<void>[] = [];

  if (opts.postgres) {
    independentPromises.push(
      new PostgreSqlContainer(POSTGRES_IMAGE)
        .withDatabase('cos_test')
        .withUsername('cos_test')
        .withPassword('cos_test')
        .start()
        .then((c) => {
          started.postgres = c;
        }),
    );
  }

  if (opts.redis) {
    independentPromises.push(
      new RedisContainer('redis:7-alpine').start().then((c) => {
        started.redis = c;
      }),
    );
  }

  if (opts.neo4j) {
    independentPromises.push(
      new Neo4jContainer('neo4j:5-community')
        .withPassword('test')
        .start()
        .then((c) => {
          started.neo4j = c;
        }),
    );
  }

  if (opts.minio) {
    independentPromises.push(
      new MinioContainer('minio/minio:latest')
        .withUsername('minioadmin')
        .withPassword('minioadmin')
        .start()
        .then((c) => {
          started.minio = c;
        }),
    );
  }

  if (opts.clickhouse) {
    independentPromises.push(
      new ClickHouseContainer('clickhouse/clickhouse-server:24.4').start().then((c) => {
        started.clickhouse = c;
      }),
    );
  }

  // Kafka without Schema Registry — start standalone in parallel
  if (opts.kafka && !opts.schemaRegistry) {
    independentPromises.push(
      new KafkaContainer('confluentinc/cp-kafka:7.6.0')
        .withKraft()
        .start()
        .then((c) => {
          started.kafka = c;
        }),
    );
  }

  await Promise.all(independentPromises);

  // Schema Registry requires Kafka on a shared Docker network so it can reach
  // Kafka's broker listener via the 'kafka' network alias at port 9093.
  if (opts.schemaRegistry) {
    const network = await new Network().start();
    started._kafkaNetwork = network;

    started.kafka = await new KafkaContainer('confluentinc/cp-kafka:7.6.0')
      .withNetwork(network)
      .withNetworkAliases('kafka')
      .withKraft()
      .start();

    started.schemaRegistry = await new GenericContainer('confluentinc/cp-schema-registry:7.6.0')
      .withNetwork(network)
      .withExposedPorts(8081)
      .withEnvironment({
        SCHEMA_REGISTRY_HOST_NAME: 'schema-registry',
        SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS: 'kafka:9093',
      })
      .start();
  }

  return started;
}

export async function stopContainers(containers: TestContainers): Promise<void> {
  await Promise.all([
    containers.postgres?.stop(),
    containers.redis?.stop(),
    containers.schemaRegistry?.stop(),
    containers.kafka?.stop(),
    containers.neo4j?.stop(),
    containers.minio?.stop(),
    containers.clickhouse?.stop(),
  ]);
  await containers._kafkaNetwork?.stop();
}

export function getPostgresUrl(c: StartedPostgreSqlContainer): string {
  return c.getConnectionUri();
}

export function getRedisUrl(c: StartedRedisContainer): string {
  return `redis://${c.getHost()}:${c.getPort()}`;
}

export function getKafkaBroker(c: StartedKafkaContainer): string {
  return `${c.getHost()}:${c.getMappedPort(9093)}`;
}

export function getNeo4jUrl(c: StartedNeo4jContainer): string {
  return c.getBoltUri();
}

export function getSchemaRegistryUrl(c: StartedTestContainer): string {
  return `http://${c.getHost()}:${c.getMappedPort(8081)}`;
}

export function getClickHouseUrl(c: StartedClickHouseContainer): string {
  return `http://${c.getHost()}:${c.getMappedPort(8123)}`;
}
