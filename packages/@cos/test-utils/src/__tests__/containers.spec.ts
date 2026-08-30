// containers.ts — unit tests using mocked testcontainers

const mockStartedPg = {
  stop: jest.fn().mockResolvedValue(undefined),
  getConnectionUri: jest
    .fn()
    .mockReturnValue('postgresql://cos_test:cos_test@localhost:5432/cos_test'),
};
const mockPgBuilder = {
  withDatabase: jest.fn().mockReturnThis(),
  withUsername: jest.fn().mockReturnThis(),
  withPassword: jest.fn().mockReturnThis(),
  start: jest.fn().mockResolvedValue(mockStartedPg),
};

const mockStartedRedis = {
  stop: jest.fn().mockResolvedValue(undefined),
  getHost: jest.fn().mockReturnValue('localhost'),
  getPort: jest.fn().mockReturnValue(6379),
};
const mockRedisBuilder = {
  start: jest.fn().mockResolvedValue(mockStartedRedis),
};

const mockStartedKafka = {
  stop: jest.fn().mockResolvedValue(undefined),
  // getKafkaBroker() builds `${getHost()}:${getMappedPort(9093)}` (containers.ts)
  getHost: jest.fn().mockReturnValue('localhost'),
  getMappedPort: jest.fn().mockReturnValue(9092),
};
const mockKafkaBuilder = {
  withKraft: jest.fn().mockReturnThis(),
  withNetwork: jest.fn().mockReturnThis(),
  withNetworkAliases: jest.fn().mockReturnThis(),
  start: jest.fn().mockResolvedValue(mockStartedKafka),
};

const mockStartedClickhouse = {
  stop: jest.fn().mockResolvedValue(undefined),
  getHost: jest.fn().mockReturnValue('localhost'),
  getMappedPort: jest.fn().mockReturnValue(8123),
};
const mockClickhouseBuilder = {
  start: jest.fn().mockResolvedValue(mockStartedClickhouse),
};

// Schema Registry runs as a GenericContainer on a shared Network (testcontainers core module).
const mockStartedSchemaRegistry = {
  stop: jest.fn().mockResolvedValue(undefined),
  getHost: jest.fn().mockReturnValue('localhost'),
  getMappedPort: jest.fn().mockReturnValue(8081),
};
const mockGenericBuilder = {
  withNetwork: jest.fn().mockReturnThis(),
  withNetworkAliases: jest.fn().mockReturnThis(),
  withExposedPorts: jest.fn().mockReturnThis(),
  withEnvironment: jest.fn().mockReturnThis(),
  withWaitStrategy: jest.fn().mockReturnThis(),
  withStartupTimeout: jest.fn().mockReturnThis(),
  start: jest.fn().mockResolvedValue(mockStartedSchemaRegistry),
};
const mockWait = { forHttp: jest.fn(() => ({ withStartupTimeout: jest.fn().mockReturnThis() })) };
const mockStartedNetwork = { stop: jest.fn().mockResolvedValue(undefined) };
const mockNetworkBuilder = { start: jest.fn().mockResolvedValue(mockStartedNetwork) };

const mockStartedNeo4j = {
  stop: jest.fn().mockResolvedValue(undefined),
  getBoltUri: jest.fn().mockReturnValue('bolt://localhost:7687'),
};
const mockNeo4jBuilder = {
  withPassword: jest.fn().mockReturnThis(),
  start: jest.fn().mockResolvedValue(mockStartedNeo4j),
};

const mockStartedMinio = {
  stop: jest.fn().mockResolvedValue(undefined),
};
const mockMinioBuilder = {
  withUsername: jest.fn().mockReturnThis(),
  withPassword: jest.fn().mockReturnThis(),
  start: jest.fn().mockResolvedValue(mockStartedMinio),
};

jest.mock('@testcontainers/postgresql', () => ({
  PostgreSqlContainer: jest.fn(() => mockPgBuilder),
}));
jest.mock('@testcontainers/redis', () => ({
  RedisContainer: jest.fn(() => mockRedisBuilder),
}));
jest.mock('@testcontainers/kafka', () => ({
  KafkaContainer: jest.fn(() => mockKafkaBuilder),
}));
jest.mock('@testcontainers/neo4j', () => ({
  Neo4jContainer: jest.fn(() => mockNeo4jBuilder),
}));
jest.mock('@testcontainers/minio', () => ({
  MinioContainer: jest.fn(() => mockMinioBuilder),
}));
jest.mock('@testcontainers/clickhouse', () => ({
  ClickHouseContainer: jest.fn(() => mockClickhouseBuilder),
}));
jest.mock('testcontainers', () => ({
  GenericContainer: jest.fn(() => mockGenericBuilder),
  Network: jest.fn(() => mockNetworkBuilder),
  Wait: mockWait,
}));

import {
  startContainers,
  stopContainers,
  getPostgresUrl,
  getRedisUrl,
  getKafkaBroker,
  getNeo4jUrl,
  getSchemaRegistryUrl,
  getClickHouseUrl,
} from '../containers';
import type { StartedTestContainer } from 'testcontainers';
import type { StartedClickHouseContainer } from '@testcontainers/clickhouse';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedRedisContainer } from '@testcontainers/redis';
import type { StartedKafkaContainer } from '@testcontainers/kafka';
import type { StartedNeo4jContainer } from '@testcontainers/neo4j';

describe('startContainers', () => {
  it('returns empty object when no options provided', async () => {
    const result = await startContainers({});
    expect(result).toEqual({});
  });

  it('starts all containers when all options are true', async () => {
    const result = await startContainers({
      postgres: true,
      redis: true,
      kafka: true,
      neo4j: true,
      minio: true,
    });
    expect(result.postgres).toBe(mockStartedPg);
    expect(result.redis).toBe(mockStartedRedis);
    expect(result.kafka).toBe(mockStartedKafka);
    expect(result.neo4j).toBe(mockStartedNeo4j);
    expect(result.minio).toBe(mockStartedMinio);
  });

  it('starts only postgres when only postgres is true', async () => {
    const result = await startContainers({ postgres: true });
    expect(result.postgres).toBe(mockStartedPg);
    expect(result.redis).toBeUndefined();
    expect(result.kafka).toBeUndefined();
  });

  it('starts only redis when only redis is true', async () => {
    const result = await startContainers({ redis: true });
    expect(result.redis).toBe(mockStartedRedis);
    expect(result.postgres).toBeUndefined();
  });

  it('starts only kafka when only kafka is true', async () => {
    const result = await startContainers({ kafka: true });
    expect(result.kafka).toBe(mockStartedKafka);
  });

  it('starts only neo4j when only neo4j is true', async () => {
    const result = await startContainers({ neo4j: true });
    expect(result.neo4j).toBe(mockStartedNeo4j);
  });

  it('starts only minio when only minio is true', async () => {
    const result = await startContainers({ minio: true });
    expect(result.minio).toBe(mockStartedMinio);
  });

  it('uses default empty options when called with no argument', async () => {
    const result = await startContainers();
    expect(result).toEqual({});
  });

  it('starts clickhouse when clickhouse is true', async () => {
    const result = await startContainers({ clickhouse: true });
    expect(result.clickhouse).toBe(mockStartedClickhouse);
  });

  it('points Schema Registry at the in-network broker listener, not the host one', async () => {
    // Regression guard. This helper shipped with 'kafka:9093' — the listener cp-kafka advertises to
    // the HOST as localhost:<mappedPort>. Schema Registry bootstrapped there, was told to reach
    // localhost:<mappedPort> from inside its own container, and died on the kafkastore init
    // timeout. Nothing caught it because these tests mock testcontainers, so the value had never
    // reached a real broker until a Phase 14 integration spec used this path.
    await startContainers({ schemaRegistry: true });
    expect(mockGenericBuilder.withEnvironment).toHaveBeenCalledWith(
      expect.objectContaining({
        SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS: 'PLAINTEXT://kafka:9092',
      }),
    );
  });

  it('waits for the Schema Registry REST API rather than the open port', async () => {
    await startContainers({ schemaRegistry: true });
    expect(mockWait.forHttp).toHaveBeenCalledWith('/subjects', 8081);
  });

  it('starts kafka + schema registry on a shared network when schemaRegistry is true', async () => {
    const result = await startContainers({ schemaRegistry: true });
    expect(result.kafka).toBe(mockStartedKafka);
    expect(result.schemaRegistry).toBe(mockStartedSchemaRegistry);
    expect(result._kafkaNetwork).toBe(mockStartedNetwork);
  });
});

describe('stopContainers', () => {
  it('stops nothing when all containers are undefined', async () => {
    await expect(stopContainers({})).resolves.toBeUndefined();
  });

  it('stops all started containers', async () => {
    await stopContainers({
      postgres: mockStartedPg as unknown as StartedPostgreSqlContainer,
      redis: mockStartedRedis as unknown as StartedRedisContainer,
      kafka: mockStartedKafka as unknown as StartedKafkaContainer,
      neo4j: mockStartedNeo4j as unknown as StartedNeo4jContainer,
    });
    expect(mockStartedPg.stop).toHaveBeenCalled();
    expect(mockStartedRedis.stop).toHaveBeenCalled();
    expect(mockStartedKafka.stop).toHaveBeenCalled();
    expect(mockStartedNeo4j.stop).toHaveBeenCalled();
  });
});

describe('URL helpers', () => {
  it('getPostgresUrl returns connection URI', () => {
    const url = getPostgresUrl(mockStartedPg as unknown as StartedPostgreSqlContainer);
    expect(url).toBe('postgresql://cos_test:cos_test@localhost:5432/cos_test');
  });

  it('getRedisUrl returns redis:// URL', () => {
    const url = getRedisUrl(mockStartedRedis as unknown as StartedRedisContainer);
    expect(url).toBe('redis://localhost:6379');
  });

  it('getKafkaBroker returns bootstrap servers', () => {
    const broker = getKafkaBroker(mockStartedKafka as unknown as StartedKafkaContainer);
    expect(broker).toBe('localhost:9092');
  });

  it('getNeo4jUrl returns bolt URI', () => {
    const url = getNeo4jUrl(mockStartedNeo4j as unknown as StartedNeo4jContainer);
    expect(url).toBe('bolt://localhost:7687');
  });

  it('getSchemaRegistryUrl returns http URL from host + mapped 8081', () => {
    const url = getSchemaRegistryUrl(mockStartedSchemaRegistry as unknown as StartedTestContainer);
    expect(url).toBe('http://localhost:8081');
  });

  it('getClickHouseUrl returns http URL from host + mapped 8123', () => {
    const url = getClickHouseUrl(mockStartedClickhouse as unknown as StartedClickHouseContainer);
    expect(url).toBe('http://localhost:8123');
  });
});
