// Unit-test config for apps/web (ADR-055).
//
// apps/web had no test runner before this: the app is covered by Playwright (tests/e2e/, §30.5) and
// Lighthouse CI (§30.9). This config adds a unit lane for pure logic modules only — it is
// deliberately NOT a component-testing setup: `testEnvironment: 'node'` with no jsdom and no
// @testing-library/react. React components stay Playwright's territory; logic that needs a 100%
// QM-1 gate is extracted to src/lib/ and tested here.
//
// Rule 32: this file is the single source of truth — do not add a "jest" key to package.json.

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.spec.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  collectCoverage: true,
  coverageDirectory: 'coverage',
  // Scoped to the modules that have unit tests. src/lib/{countries,format,nav}.ts and the
  // api/auth/idb/pwa subtrees predate this runner and are covered by Playwright, not unit tests —
  // pulling them into the 100% gate would fail the build without adding a single assertion. Add a
  // module here in the same PR that adds its spec.
  collectCoverageFrom: ['src/lib/loadingState.ts'],
  coveragePathIgnorePatterns: ['/node_modules/', '\\.spec\\.ts$'],
  coverageThreshold: {
    global: { lines: 100, branches: 100 },
  },
};
