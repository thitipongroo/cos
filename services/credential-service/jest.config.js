// Credential-service is ESM ("type":"module"); Jest runs in ESM mode
// (`node --experimental-vm-modules`). ts-jest ESM preset + strip the NodeNext ".js" suffix from
// relative imports so Jest resolves the ".ts" source. @digitalbazaar/* + jsonld are ESM node_modules
// loaded natively by Jest's ESM loader (no transform needed). QM-1: 100% coverage.
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  // Integration specs (Testcontainers / network) run only via jest.integration.config.js — keep the
  // unit + coverage run fast, offline, and free of Docker.
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.spec\\.ts$'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { useESM: true, isolatedModules: true, diagnostics: { ignoreCodes: [151002] } },
    ],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/integration/**',
  ],
  coverageThreshold: { global: { lines: 100, branches: 100 } },
  testTimeout: 15000,
};
