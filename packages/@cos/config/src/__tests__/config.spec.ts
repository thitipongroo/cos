// Unit tests for @cos/config — env validation via Zod

// Must reset the module singleton between tests
afterEach(() => {
  jest.resetModules();
});

describe('loadConfig', () => {
  const validEnv = {
    NODE_ENV: 'test',
    PORT: '3000',
    LOG_LEVEL: 'info',
    DATABASE_URL: 'postgresql://cos:pass@localhost:6432/cos',
    REDIS_URL: 'redis://localhost:6379',
    KAFKA_BROKERS: 'localhost:29092',
    SCHEMA_REGISTRY_URL: 'http://localhost:8081',
    TEMPORAL_ADDRESS: 'localhost:7233',
    OTEL_SERVICE_NAME: 'test-service',
  };

  it('loads valid config without throwing', async () => {
    Object.assign(process.env, validEnv);
    const { loadConfig } = await import('../index.js');
    expect(() => loadConfig()).not.toThrow();
  });

  it('returns config with correct values', async () => {
    Object.assign(process.env, validEnv);
    const { loadConfig } = await import('../index.js');
    const config = loadConfig();
    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe('test');
    expect(config.LOG_LEVEL).toBe('info');
  });

  it('throws when required field is missing (DATABASE_URL)', async () => {
    const env = { ...validEnv };
    delete (env as Partial<typeof env>).DATABASE_URL;
    // Clear DATABASE_URL from process.env
    const prev = process.env['DATABASE_URL'];
    delete process.env['DATABASE_URL'];
    Object.assign(process.env, env);

    const { loadConfig } = await import('../index.js');
    expect(() => loadConfig()).toThrow('Invalid environment configuration');
    if (prev !== undefined) process.env['DATABASE_URL'] = prev;
  });

  it('applies default PORT=3000 when PORT not set', async () => {
    const env = { ...validEnv };
    delete (env as Partial<typeof env>).PORT;
    delete process.env['PORT'];
    Object.assign(process.env, env);

    const { loadConfig } = await import('../index.js');
    const config = loadConfig();
    expect(config.PORT).toBe(3000);
  });
});

describe('getConfig', () => {
  it('throws when config not loaded yet', async () => {
    const { getConfig } = await import('../index.js');
    // After module reset, _config is null
    expect(() => getConfig()).toThrow('Config not loaded');
  });

  it('returns cached config after loadConfig is called', async () => {
    Object.assign(process.env, {
      DATABASE_URL: 'postgresql://cos:pass@localhost:6432/cos',
      REDIS_URL: 'redis://localhost:6379',
      KAFKA_BROKERS: 'localhost:29092',
      SCHEMA_REGISTRY_URL: 'http://localhost:8081',
      TEMPORAL_ADDRESS: 'localhost:7233',
    });
    const { loadConfig, getConfig } = await import('../index.js');
    loadConfig();
    const config = getConfig();
    expect(config).toBeDefined();
    expect(config.DATABASE_URL).toContain('postgresql');
  });
});
