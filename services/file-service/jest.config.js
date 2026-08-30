/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  globals: {
    'ts-jest': {
      diagnostics: { ignoreCodes: [151002] }, // suppress Node16 module warning
      isolatedModules: true,
    },
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/cleanup/worker.ts',
    '!src/cleanup/workflows/file-cleanup.workflow.ts', // Temporal workflow — requires TestWorkflowEnvironment
    '!src/extraction/worker.ts', // bootstrap
    '!src/extraction/extraction-client.ts', // Temporal client bootstrap
    '!src/extraction/workflows/zip-extraction.workflow.ts', // Temporal workflow — requires TestWorkflowEnvironment
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      lines: 100,
      branches: 100,
    },
  },
  moduleNameMapper: {
    '^@cos/kafka$': '<rootDir>/../../packages/@cos/kafka/src/index.ts',
    '^@cos/shared$': '<rootDir>/../../packages/@cos/shared/src/index.ts',
    '^@cos/logger$': '<rootDir>/../../packages/@cos/logger/src/index.ts',
    '^@cos/types$': '<rootDir>/../../packages/@cos/types/src/index.ts',
    // @cos/tracing maps to src like its siblings. Without it the import falls through to the
    // package's `main`, which is dist/index.js — and dist is gitignored and not built by the unit
    // test job, so metrics.plugin.spec.ts failed in CI with "Cannot find module '@cos/tracing'"
    // while passing locally off a stale dist. That took metrics.ts to 0% and the whole run below
    // the 100% gate.
    '^@cos/tracing$': '<rootDir>/../../packages/@cos/tracing/src/index.ts',
  },
};
