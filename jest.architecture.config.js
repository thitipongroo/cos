/**
 * Repo-wide architecture invariants (§35.13 ESC-27) — rules that span workspaces and therefore
 * belong to no single package's jest config. Mirrors jest.contract.config.js.
 * @type {import('jest').Config}
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/architecture/**/*.spec.ts'],
  transform: {
    '^.+\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tests/architecture/tsconfig.json' }],
  },
  testTimeout: 60000,
};
