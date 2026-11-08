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
  // decode-uri-component is ESM-only from 0.4.0, and pnpm-workspace.yaml overrides it to 0.5.1
  // (GHSA-qr28-fpjm-wq7f). minio requires it through query-string, and Jest's CommonJS runtime
  // cannot load an untransformed `export` — any spec that loads the real minio failed with
  // "Unexpected token 'export'". So that one package is compiled to CommonJS; every other
  // node_modules file is still left alone. The pattern lets both pnpm paths through:
  // node_modules/.pnpm/decode-uri-component@0.5.1/node_modules/decode-uri-component/index.js.
  // It replaces Jest's default list, which also skips Yarn PnP's `.pnp.*` files; pnpm has none.
  transform: {
    '/decode-uri-component/index\\.js$': [
      'ts-jest',
      { tsconfig: { allowJs: true, isolatedModules: true } },
    ],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!\\.pnpm/decode-uri-component@|decode-uri-component/)',
  ],
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
    '^@cos/service-identity$': '<rootDir>/../../packages/@cos/service-identity/src/index.ts',
  },
};
