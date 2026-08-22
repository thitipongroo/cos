/**
 * Spec-derived INTEGRATION suite (Phase 2+, T2).
 *
 * These boot the real NestJS AppModule against PostgreSQL + Redis Testcontainers, which is the
 * shape master:1963 prescribes for Phase 2 — "Testcontainers (PostgreSQL + Redis containers,
 * real DB)". Keycloak is NOT containerised; it is replaced at the DI boundary, the same way
 * backend/test/auth.integration.spec.ts does it.
 *
 * rootDir is backend/ so the module graph, the ts-jest decorator transform and the @cos/*
 * moduleNameMapper all resolve exactly as they do for the app's own integration run. The specs
 * themselves live outside it, under tests/spec-derived/, via `roots`.
 *
 * Coverage is not collected: these assert behaviour against real infra, not lines (same reasoning
 * as backend/jest.integration.config.js).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS jest config
const base = require('./backend/jest.config');

const {
  testRegex: _testRegex,
  testPathIgnorePatterns: _ignore,
  coverageThreshold: _threshold,
  ...rest
} = base;

module.exports = {
  ...rest,
  rootDir: './backend',
  // The specs live UNDER backend/ on purpose: they import AppModule, @nestjs/testing and
  // supertest, and pnpm's isolated node_modules only exposes those inside backend/. A copy kept
  // at tests/spec-derived/ could not resolve them (TS2307) — proven, not assumed.
  roots: ['<rootDir>/test/spec-derived'],
  testMatch: ['<rootDir>/test/spec-derived/**/*.integration.spec.ts'],
  // Stub the Kafka/OpenSearch network clients AppModule boots (same helper the app's own
  // integration run uses).
  setupFilesAfterEnv: ['<rootDir>/test/helpers/integration-mocks.ts'],
  // Container startup + `prisma migrate deploy` (89 migrations) + app.init. MEASURED on this
  // machine: the repo's own backend/test/auth.integration.spec.ts blew its hardcoded 180_000 hook
  // budget and reported "Exceeded timeout of 180000 ms for a hook" for all 8 tests, with the whole
  // run taking 513s. The cost is the migration deploy, not the assertions, so the budget here is
  // set from that measurement rather than from optimism.
  testTimeout: 900_000,
  // One container set at a time — parallel suites would each pull and start their own.
  maxWorkers: 1,
};
