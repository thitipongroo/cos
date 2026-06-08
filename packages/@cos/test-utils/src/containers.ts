import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { KafkaContainer, StartedKafkaContainer } from '@testcontainers/kafka';
import { Neo4jContainer, StartedNeo4jContainer } from '@testcontainers/neo4j';
import { MinioContainer, StartedMinioContainer } from '@testcontainers/minio';

export interface TestContainers {
  postgres?: StartedPostgreSqlContainer;
  redis?: StartedRedisContainer;
  kafka?: StartedKafkaContainer;
  neo4j?: StartedNeo4jContainer;
  minio?: StartedMinioContainer;
}

export interface TestContainersOptions {
  postgres?: boolean;
  redis?: boolean;
  kafka?: boolean;
  neo4j?: boolean;
  minio?: boolean;
}

export async function startContainers(opts: TestContainersOptions = {}): Promise<TestContainers> {
  const started: TestContainers = {};
  const promises: Promise<void>[] = [];

  if (opts.postgres) {
    promises.push(
      new PostgreSqlContainer('postgres:16-alpine')
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
    promises.push(
      new RedisContainer('redis:7-alpine').start().then((c) => {
        started.redis = c;
      }),
    );
  }

  if (opts.kafka) {
    promises.push(
      new KafkaContainer('confluentinc/cp-kafka:7.6.0')
        .withKraft()
        .start()
        .then((c) => {
          started.kafka = c;
        }),
    );
  }

  if (opts.neo4j) {
    promises.push(
      new Neo4jContainer('neo4j:5-community')
        .withoutAuthentication()
        .start()
        .then((c) => {
          started.neo4j = c;
        }),
    );
  }

  if (opts.minio) {
    promises.push(
      new MinioContainer('minio/minio:latest')
        .withUsername('minioadmin')
        .withPassword('minioadmin')
        .start()
        .then((c) => {
          started.minio = c;
        }),
    );
  }

  await Promise.all(promises);
  return started;
}

export async function stopContainers(containers: TestContainers): Promise<void> {
  await Promise.all([
    containers.postgres?.stop(),
    containers.redis?.stop(),
    containers.kafka?.stop(),
    containers.neo4j?.stop(),
    containers.minio?.stop(),
  ]);
}

export function getPostgresUrl(c: StartedPostgreSqlContainer): string {
  return c.getConnectionUri();
}

export function getRedisUrl(c: StartedRedisContainer): string {
  return `redis://${c.getHost()}:${c.getPort()}`;
}

export function getKafkaBroker(c: StartedKafkaContainer): string {
  return c.getBootstrapServers();
}

export function getNeo4jUrl(c: StartedNeo4jContainer): string {
  return c.getBoltUri();
}
