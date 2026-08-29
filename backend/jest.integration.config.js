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
  // Temporal *.workflow.spec.ts are EXCLUDED: jest.workflows.config.js owns them and runs them at
  // maxWorkers 1 because each starts its own time-skipping server. Matching them here too ran the
  // same file twice, the second time alongside container suites — the exact starvation its own
  // header warns about.
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '\\.workflow\\.spec\\.ts$'],
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  // Stub the Kafka/OpenSearch network clients for every integration spec (AppModule boots them).
  setupFilesAfterEnv: ['<rootDir>/test/helpers/integration-mocks.ts'],
  // Container startup + migrations + per-test app.init need generous time (applies to hooks too).
  testTimeout: 120_000,
  // One worker, recycled before it can hit Node's default ~2 GB heap cap.
  //
  // The sanctioned entry point is `pnpm run test:integration`, which passes
  // `--max-old-space-size=8192 --runInBand`. A direct `npx jest -c backend/jest.integration.config.js`
  // gets neither, and the whole estate in one worker reaches the default cap partway through:
  // "Jest worker ran out of memory and crashed / FATAL ERROR: Reached heap limit" at 2027 MB, on
  // whichever suite happened to be running. That is what the intermittent whole-suite failures were
  // — the suite was never the cause, only the victim, which is why none of them ever reproduced when
  // run on their own.
  //
  // workerIdleMemoryLimit restarts the worker between files once it crosses the limit, so the direct
  // invocation now survives too. It applies only to WORKERS, so it is inert under --runInBand — the
  // npm script's 8 GB heap is what covers that path, and the two do not conflict.
  maxWorkers: 1,
  workerIdleMemoryLimit: '1200MB',
  // No forceExit: every long-lived handle AppModule opens (Redis for throttler/OTP/MFA, the MFA
  // PrismaClient) is closed via onModuleDestroy on app.close(), and Testcontainers are stopped in
  // afterAll — so Jest exits on its own. If this ever hangs again, run with --detectOpenHandles to
  // find the NEW unclosed handle rather than masking it with forceExit.
};
