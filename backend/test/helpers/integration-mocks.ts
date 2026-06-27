// Global mocks for integration specs (wired via jest.integration.config.js setupFilesAfterEnv).
// AppModule boots NotificationConsumer.onModuleInit → KafkaConsumer.on(), and several services
// construct a KafkaProducer / OpenSearch Client. Integration tests run without a broker or
// OpenSearch, so stub those network clients here once for every integration spec. Real @cos/shared
// exports (event types, topic catalog, etc.) are preserved via requireActual.

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
