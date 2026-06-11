// backend jest.config.js — Phase 1 deliverable (Decision 2: moved from Phase 18)
// Coverage thresholds: 100% lines / 100% branches per QM-1 (spec §30.3)

/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          emitDecoratorMetadata: true,
          experimentalDecorators: true,
          types: ['jest', 'node'],
        },
      },
    ],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    // Exclude files with no testable logic
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/**/*.dto.ts',
    '!src/**/*.payload.ts',
    '!src/**/index.ts',
    '!src/**/*.interface.ts',
    '!src/**/*.enum.ts',
    // EP stubs — placeholder implementations, not business logic; tested when real adapter ships
    '!src/**/*.stub.ts',
    // Phase 16 deliverable — tests written in Phase 16 (Security hardening)
    '!src/shared/middleware/cloudflare-waf.middleware.ts',
    // Temporal workflow files run inside a V8 worker isolate (Temporal SDK sandbox).
    // Jest/V8 coverage cannot instrument code executing in the isolate.
    // Tests exist and pass via TestWorkflowEnvironment — this is a tooling limitation.
    '!src/**/*.workflow.ts',
    // Temporal worker bootstrap: registers task queues and connects to Temporal server.
    // Requires a live Temporal server; not unit-testable.
    '!src/**/*.worker.ts',
    '!src/**/worker.ts',
    // Phase 25 deliverable: enterprise-provisioning activities provision real infrastructure
    // (dedicated RDS, VPC peering, Route 53). Tested in Phase 25 integration tests.
    '!src/**/enterprise-provisioning.activities.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: {
      lines: 100,
      branches: 100,
    },
  },
  testEnvironment: 'node',
  // Temporal TestWorkflowEnvironment embeds a test server per process.
  // At high worker counts concurrent servers conflict and cause flaky timeouts.
  // maxWorkers: 2 keeps at most 2 test servers alive simultaneously.
  maxWorkers: 2,
  // Integration tests (test/) require real infra (Redis, Keycloak, DB).
  // They run via test:integration; exclude from unit test:cov.
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/test/'],
  moduleNameMapper: {
    '^@keycloak/keycloak-admin-client$': '<rootDir>/src/__mocks__/keycloak-admin-client.js',
    '^@cos/shared$': '<rootDir>/../packages/@cos/shared/src/index.ts',
    '^@cos/shared/(.*)$': '<rootDir>/../packages/@cos/shared/src/$1',
    '^@cos/rbac$': '<rootDir>/../packages/@cos/rbac/src/index.ts',
    '^@cos/rbac/(.*)$': '<rootDir>/../packages/@cos/rbac/src/$1',
    '^@cos/logger$': '<rootDir>/../packages/@cos/logger/src/index.ts',
    '^@cos/logger/(.*)$': '<rootDir>/../packages/@cos/logger/src/$1',
    '^@cos/tracing$': '<rootDir>/../packages/@cos/tracing/src/index.ts',
    '^@cos/tracing/(.*)$': '<rootDir>/../packages/@cos/tracing/src/$1',
    '^@cos/financial$': '<rootDir>/../packages/@cos/financial/src/index.ts',
    '^@cos/financial/(.*)$': '<rootDir>/../packages/@cos/financial/src/$1',
    '^@cos/types$': '<rootDir>/../packages/@cos/types/src/index.ts',
    '^@cos/types/(.*)$': '<rootDir>/../packages/@cos/types/src/$1',
    '^@cos/config$': '<rootDir>/../packages/@cos/config/src/index.ts',
    '^@cos/config/(.*)$': '<rootDir>/../packages/@cos/config/src/$1',
    '^@cos/validation$': '<rootDir>/../packages/@cos/validation/src/index.ts',
    '^@cos/validation/(.*)$': '<rootDir>/../packages/@cos/validation/src/$1',
    '^@cos/database$': '<rootDir>/../packages/@cos/database/src/index.ts',
    '^@cos/database/(.*)$': '<rootDir>/../packages/@cos/database/src/$1',
  },
};
