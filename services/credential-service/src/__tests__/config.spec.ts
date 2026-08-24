import { loadConfig } from '../config.js';

describe('loadConfig', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('reads values from the environment', () => {
    process.env.PORT = '4000';
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgres://db';
    process.env.DID_WEB_BASE_DOMAIN = 'cos.example.com';
    expect(loadConfig()).toEqual({
      port: 4000,
      nodeEnv: 'production',
      database: { url: 'postgres://db' },
      issuer: { didWebBaseDomain: 'cos.example.com' },
    });
  });

  it('falls back to defaults when env is unset', () => {
    delete process.env.PORT;
    delete process.env.NODE_ENV;
    delete process.env.DATABASE_URL;
    delete process.env.DID_WEB_BASE_DOMAIN;
    const cfg = loadConfig();
    expect(cfg.port).toBe(3009);
    expect(cfg.nodeEnv).toBe('development');
    expect(cfg.database.url).toBe('');
    expect(cfg.issuer.didWebBaseDomain).toBe('');
  });
});
