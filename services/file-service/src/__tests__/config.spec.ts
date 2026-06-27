import { loadConfig } from '../config';

describe('loadConfig', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env['DATABASE_URL'] = 'postgresql://cos:pass@localhost:6432/db';
    // MinIO S3 credentials come from the server root creds (docker-compose + .env), per config.ts.
    process.env['MINIO_ROOT_USER'] = 'test-key';
    process.env['MINIO_ROOT_PASSWORD'] = 'test-secret';
  });

  afterEach(() => {
    // Restore original env — prevent cross-test pollution
    Object.keys(process.env).forEach((k) => {
      if (!(k in ORIGINAL_ENV)) delete process.env[k];
    });
    Object.assign(process.env, ORIGINAL_ENV);
  });

  it('loads defaults when optional vars are absent', () => {
    const cfg = loadConfig();
    expect(cfg.port).toBe(3002);
    expect(cfg.minio.endPoint).toBe('localhost');
    expect(cfg.minio.useSSL).toBe(false);
    expect(cfg.clamav.host).toBe('clamav');
    expect(cfg.clamav.port).toBe(3310);
    expect(cfg.clamav.timeoutMs).toBe(60000);
    expect(cfg.opensearch.host).toBe('http://localhost:9200');
    expect(cfg.temporal.address).toBe('localhost:7233');
    expect(cfg.signedUrlTtlSeconds).toBe(3600);
  });

  it('reads FILE_SERVICE_PORT from environment', () => {
    process.env['FILE_SERVICE_PORT'] = '4000';
    expect(loadConfig().port).toBe(4000);
  });

  it('reads NODE_ENV fallback to development when absent', () => {
    delete process.env['NODE_ENV'];
    expect(loadConfig().nodeEnv).toBe('development');
  });

  it('reads MINIO_ENDPOINT from environment', () => {
    process.env['MINIO_ENDPOINT'] = 'minio.internal';
    expect(loadConfig().minio.endPoint).toBe('minio.internal');
  });

  it('reads MINIO_PORT from environment', () => {
    process.env['MINIO_PORT'] = '9001';
    expect(loadConfig().minio.port).toBe(9001);
  });

  it('reads MINIO_USE_SSL=true', () => {
    process.env['MINIO_USE_SSL'] = 'true';
    expect(loadConfig().minio.useSSL).toBe(true);
  });

  it('reads CLAMAV_HOST from environment', () => {
    process.env['CLAMAV_HOST'] = 'my-clamav';
    expect(loadConfig().clamav.host).toBe('my-clamav');
  });

  it('reads CLAMAV_PORT from environment', () => {
    process.env['CLAMAV_PORT'] = '3311';
    expect(loadConfig().clamav.port).toBe(3311);
  });

  it('reads CLAMAV_TIMEOUT_MS from environment', () => {
    process.env['CLAMAV_TIMEOUT_MS'] = '30000';
    expect(loadConfig().clamav.timeoutMs).toBe(30000);
  });

  it('reads OPENSEARCH_HOST from environment', () => {
    process.env['OPENSEARCH_HOST'] = 'http://os:9200';
    expect(loadConfig().opensearch.host).toBe('http://os:9200');
  });

  it('reads KAFKA_BROKERS as comma-separated list', () => {
    process.env['KAFKA_BROKERS'] = 'broker1:9092,broker2:9092';
    expect(loadConfig().kafka.brokers).toEqual(['broker1:9092', 'broker2:9092']);
  });

  it('reads TEMPORAL_ADDRESS from environment', () => {
    process.env['TEMPORAL_ADDRESS'] = 'temporal:7233';
    expect(loadConfig().temporal.address).toBe('temporal:7233');
  });

  it('reads SIGNED_URL_TTL_SECONDS from environment', () => {
    process.env['SIGNED_URL_TTL_SECONDS'] = '1800';
    expect(loadConfig().signedUrlTtlSeconds).toBe(1800);
  });

  it('throws when DATABASE_URL is missing', () => {
    delete process.env['DATABASE_URL'];
    expect(() => loadConfig()).toThrow('DATABASE_URL');
  });

  it('throws when MINIO_ROOT_USER is missing', () => {
    delete process.env['MINIO_ROOT_USER'];
    expect(() => loadConfig()).toThrow('MINIO_ROOT_USER');
  });

  it('throws when MINIO_ROOT_PASSWORD is missing', () => {
    delete process.env['MINIO_ROOT_PASSWORD'];
    expect(() => loadConfig()).toThrow('MINIO_ROOT_PASSWORD');
  });
});
