// Global mocks for integration specs (wired via jest.integration.config.js setupFilesAfterEnv).
// AppModule boots NotificationConsumer.onModuleInit → KafkaConsumer.on(), and several services
// construct a KafkaProducer / OpenSearch Client. Integration tests run without a broker or
// OpenSearch, so stub those network clients here once for every integration spec. Real @cos/shared
// exports (event types, topic catalog, etc.) are preserved via requireActual.

// AppModule also boots graph.module (neo4j.driver) and analytics.module (ClickHouse createClient),
// whose useFactory providers getOrThrow() these env vars at construction. startIntegrationInfra only
// spins up PostgreSQL + Redis (not Neo4j/ClickHouse), and no integration spec queries the graph or
// analytics endpoints, so the driver/client are constructed lazily but never actually connect.
// Provide dummy values so getOrThrow doesn't throw and abort the entire AppModule boot. Assigned
// here (runs before every integration spec's beforeAll → createTestingModule), never overriding a
// real value if one is already present in the environment.
process.env['NEO4J_URI'] ??= 'bolt://localhost:7687';
process.env['NEO4J_USERNAME'] ??= 'neo4j';
process.env['NEO4J_PASSWORD'] ??= 'test_neo4j_password';
process.env['CLICKHOUSE_URL'] ??= 'http://localhost:8123';
process.env['CLICKHOUSE_USER'] ??= 'test';
process.env['CLICKHOUSE_PASSWORD'] ??= 'test_ch_password';

jest.mock('@cos/shared', () => {
  const actual = jest.requireActual('@cos/shared');
  const noopKafka = {
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    disconnect: jest.fn().mockResolvedValue(undefined),
  };
  return {
    ...actual,
    KafkaProducer: jest.fn().mockImplementation(() => noopKafka),
    KafkaConsumer: jest.fn().mockImplementation(() => noopKafka),
  };
});

jest.mock('@opensearch-project/opensearch', () => ({
  Client: jest.fn().mockImplementation(() => ({
    index: jest.fn().mockResolvedValue({}),
    search: jest.fn().mockResolvedValue({ body: { hits: { hits: [] } } }),
    delete: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  })),
}));
