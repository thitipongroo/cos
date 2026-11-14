// Global mocks for integration specs (wired via jest.integration.config.js setupFilesAfterEnv).
// AppModule boots NotificationConsumer.onModuleInit → KafkaConsumer.on(), and several services
// construct a KafkaProducer / OpenSearch Client. Integration tests run without a broker or
// OpenSearch, so stub those network clients here once for every integration spec. Real @cos/kafka
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

jest.mock('@cos/kafka', () => {
  const actual = jest.requireActual('@cos/kafka');
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

// ── Every app under test listens on 127.0.0.1 ─────────────────────────────────────────────────────
// Suites call `request(app.getHttpServer())` on an app that was init()ed but never listened. supertest
// then calls `server.listen(0)` for EACH request and sends it to `http://127.0.0.1:<port>` — but
// `listen(0)` with no host binds the IPv6 wildcard (`::`), and macOS lets that bind succeed on a port
// another process already holds on 127.0.0.1. The request then reaches that other process: measured
// 4 wrong answers in 12,000 (an Autodesk licensing page, a browser-control page, an Express 404), and
// in full runs a 404, an empty body, and a 200 where a SITE_WORKER must get 403. Listening on
// 127.0.0.1 once, after init(), makes supertest use that address and never call listen(0) (0 wrong in
// 12,000). A suite that calls app.listen() itself — before or after init() — still can: listen()
// before init() skips this, and listen() after it first closes the listen made here.
{
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { NestApplication } = require('@nestjs/core') as typeof import('@nestjs/core');
  type Patched = InstanceType<typeof NestApplication> & {
    __explicitListen?: boolean;
    __loopbackListened?: boolean;
  };
  const proto = NestApplication.prototype as Patched;
  const originalInit = proto.init;
  const originalListen = proto.listen;
  proto.listen = async function (this: Patched, ...args: Parameters<typeof originalListen>) {
    this.__explicitListen = true;
    const server = this.getHttpServer() as import('http').Server | undefined;
    if (this.__loopbackListened && server?.listening) {
      // init() already listened on 127.0.0.1 here; the suite's own listen() takes over.
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
      this.__loopbackListened = false;
    }
    return originalListen.apply(this, args);
  } as typeof originalListen;
  proto.init = async function (this: Patched) {
    const app = await originalInit.call(this);
    const server = this.getHttpServer() as import('http').Server | undefined;
    if (!this.__explicitListen && server && !server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          server.off('error', reject);
          this.__loopbackListened = true;
          resolve();
        });
      });
    }
    return app;
  } as typeof originalInit;
}
