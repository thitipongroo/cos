// backend jest.integration.config.js — runs the Testcontainers integration specs in test/.
// The base config (jest.config.js) deliberately ignores test/ so the unit run (test:cov) stays
// fast and offline; this config re-includes test/ and selects ONLY those specs. Coverage is not
// collected here — integration tests assert behaviour against real infra, not line coverage.

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS jest config file
const baseConfig = require('./jest.config');
// Drop testRegex (mutually exclusive with the testMatch below) — keep everything else.
const { testRegex: _testRegex, ...base } = baseConfig;

module.exports = {
  ...base,
  // Re-include test/ (base ignores it for the unit run) and match only the integration specs.
  testPathIgnorePatterns: ['<rootDir>/node_modules/'],
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  // Stub the Kafka/OpenSearch network clients for every integration spec (AppModule boots them).
  setupFilesAfterEnv: ['<rootDir>/test/helpers/integration-mocks.ts'],
  // Container startup + migrations + per-test app.init need generous time (applies to hooks too).
  testTimeout: 120_000,
  // No forceExit: every long-lived handle AppModule opens (Redis for throttler/OTP/MFA, the MFA
  // PrismaClient) is closed via onModuleDestroy on app.close(), and Testcontainers are stopped in
  // afterAll — so Jest exits on its own. If this ever hangs again, run with --detectOpenHandles to
  // find the NEW unclosed handle rather than masking it with forceExit.
};
