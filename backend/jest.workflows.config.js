// backend jest.workflows.config.js — runs the Temporal *.workflow.spec.ts SERIALLY.
//
// Each spec starts its own TestWorkflowEnvironment time-skipping server; running them across
// parallel jest workers starves the servers (flaky hook timeouts + "Workflow execution timed out").
// jest.config.js excludes these specs from the parallel unit run; this config runs only them with
// maxWorkers: 1 so a single Temporal server is alive at a time. Behaviour-only (no coverage gate):
// the source they touch is either excluded from coverage (*.workflow.ts) or covered by other specs.

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS jest config file
const baseConfig = require('./jest.config');
// Drop testRegex (mutually exclusive with testMatch) and the unit run's path/coverage exclusions.
const { testRegex: _testRegex, testPathIgnorePatterns: _ignore, ...base } = baseConfig;

module.exports = {
  ...base,
  testMatch: ['<rootDir>/**/*.workflow.spec.ts'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/'],
  maxWorkers: 1, // one Temporal test server at a time
  testTimeout: 60000, // time-skipping server startup + workflow execution
  collectCoverage: false,
  coverageThreshold: undefined,
};
