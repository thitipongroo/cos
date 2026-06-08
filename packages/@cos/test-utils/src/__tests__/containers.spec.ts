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
  getBootstrapServers: jest.fn().mockReturnValue('localhost:9092'),
};
const mockKafkaBuilder = {
  withKraft: jest.fn().mockReturnThis(),
  start: jest.fn().mockResolvedValue(mockStartedKafka),
};

const mockStartedNeo4j = {
  stop: jest.fn().mockResolvedValue(undefined),
  getBoltUri: jest.fn().mockReturnValue('bolt://localhost:7687'),
};
const mockNeo4jBuilder = {
  withoutAuthentication: jest.fn().mockReturnThis(),
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

import {
  startContainers,
  stopContainers,
  getPostgresUrl,
  getRedisUrl,
  getKafkaBroker,
  getNeo4jUrl,
} from '../containers';
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
});
