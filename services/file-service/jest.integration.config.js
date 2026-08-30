/**
 * file-service integration config — §35.13 ESC-30.
 *
 * The base config (jest.config.js) matches only `src/**` so `test:cov` stays fast and offline and
 * its 100% gate keeps meaning what it says. This config re-includes `test/` and selects ONLY the
 * Testcontainers specs. Coverage is not collected here: these tests assert behaviour against real
 * MinIO, not lines of TypeScript.
 * @type {import('jest').Config}
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS jest config file
const base = require('./jest.config');

module.exports = {
  ...base,
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  collectCoverage: false,
  coverageThreshold: undefined,
  // Pulling and starting the MinIO image dominates the first run.
  testTimeout: 180_000,
};
