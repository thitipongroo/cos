// Integration config (CS-9) — runs ONLY *.integration.spec.ts. These assert behaviour against real
// infra (Testcontainers Postgres for RLS; the real did:web driver with the HTTPS transport stubbed),
// so coverage is NOT collected here. The unit config (jest.config.js) ignores these specs.
//
// ESM, like the unit config: `pnpm test:integration` runs jest under `node --experimental-vm-modules`.
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.integration.spec.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { useESM: true, isolatedModules: true, diagnostics: { ignoreCodes: [151002] } },
    ],
  },
  // Container startup + image pull + migration can be slow; hooks share this budget.
  testTimeout: 120000,
};
