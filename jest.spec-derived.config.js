/**
 * Spec-derived test suite (TDD rewrite, product-owner decision 2026-08-21).
 *
 * These tests are authored from `context/00_master_construction_os.md` and
 * `docs/specifications/` ONLY — never from the implementation. They run in
 * PARALLEL with the existing suites (backend/, packages/, apps/) which are left
 * untouched, so a disagreement between the two is a finding, not a regression.
 *
 * Root-only script, deliberately NOT a turbo task: turbo tasks execute per
 * workspace package, and this suite is repo-wide. Same convention as the
 * existing `test:contract` / `jest.contract.config.js` pair (Rule 27).
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: __dirname,
  testMatch: ['<rootDir>/tests/spec-derived/**/*.spec.ts'],
  // *.integration.spec.ts belong to jest.spec-derived-integration.config.js — they boot the
  // NestJS app against Testcontainers. Without this exclusion the offline run matches them too
  // and silently starts a second set of containers alongside the integration run.
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.spec\\.ts$'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tests/spec-derived/tsconfig.json' }],
  },
  // Phase 2 asserts against @cos/rbac's real exports (CosRole, ROLE_PERMISSIONS, the decorators
  // and their metadata keys). Map the workspace packages to SOURCE, never dist — a stale dist
  // would let the suite pass against code that is no longer there (master:1721).
  moduleNameMapper: {
    '^@cos/([^/]+)$': '<rootDir>/packages/@cos/$1/src/index.ts',
    '^@cos/([^/]+)/(.*)$': '<rootDir>/packages/@cos/$1/src/$2',
  },
  testTimeout: 30000,
};
