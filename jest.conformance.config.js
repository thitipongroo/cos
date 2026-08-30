/**
 * CONFORMANCE suite — static checks against the repository's own source.
 *
 * These tests execute no product code. They read files as text and assert two things a running test
 * cannot: that artifacts which must agree DO agree even though nothing loads them together (a Python
 * consumer's topic pattern and the Go producer that builds the name; an Avro schema, the topic
 * catalogue and the publisher; an OpenAPI document and the routes it describes), and that things the
 * spec forbids are ABSENT (a passing test proves a path works; it never proves a forbidden path is
 * missing).
 *
 * Named for what the tests ARE, alongside tests/contract (Pact), tests/e2e and tests/load. The
 * previous name, `spec-derived`, described where the tests came from, which tells a reader nothing
 * about what they check.
 *
 * Root-only script, deliberately NOT a turbo task: turbo tasks execute per workspace package and
 * this suite is repo-wide. Same convention as the existing test:contract pair (Rule 27).
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: __dirname,
  testMatch: ['<rootDir>/tests/conformance/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  // apps/web/.next/standalone contains a COPY of the repo, so haste sees two @cos/web package.json
  // files and warns on every run. Ignoring the build output silences it without hiding real files.
  modulePathIgnorePatterns: ['<rootDir>/apps/web/.next/'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tests/conformance/tsconfig.json' }],
  },
  // Workspace packages map to SOURCE, never dist — a stale dist would let the suite pass against
  // code that is no longer there (master:1721).
  moduleNameMapper: {
    '^@cos/([^/]+)$': '<rootDir>/packages/@cos/$1/src/index.ts',
    '^@cos/([^/]+)/(.*)$': '<rootDir>/packages/@cos/$1/src/$2',
  },
  testTimeout: 30000,
};
