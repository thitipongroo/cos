// Unit-test config for apps/web (ADR-055).
//
// apps/web had no test runner before this: the app is covered by Playwright (tests/e2e/, Â§30.5) and
// Lighthouse CI (Â§30.9). This config adds a unit lane for pure logic modules only â€” it is
// deliberately NOT a component-testing setup: `testEnvironment: 'node'` with no jsdom and no
// @testing-library/react. React components stay Playwright's territory; logic that needs a 100%
// QM-1 gate is extracted to src/lib/ and tested here.
//
// Rule 32: this file is the single source of truth â€” do not add a "jest" key to package.json.

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.spec.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  // @cos/ui-logic (ADR-068) is consumed from source in tests so the runner needs no prior build,
  // matching the mobile jest mapping for @cos/types.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@cos/ui-logic$': '<rootDir>/../../packages/@cos/ui-logic/src/index.ts',
    '^@cos/ui-logic/(.*)$': '<rootDir>/../../packages/@cos/ui-logic/src/$1',
    '^@cos/types$': '<rootDir>/../../packages/@cos/types/src/index.ts',
    '^@cos/types/(.*)$': '<rootDir>/../../packages/@cos/types/src/$1',
  },
  collectCoverage: true,
  coverageDirectory: 'coverage',
  // Scoped to the modules that have unit tests — add a module here in the same PR that adds its
  // spec. src/lib/{countries,format,nav}.ts and src/lib/auth/roles.ts joined the gate on
  // 2026-08-23 (§35.13 ESC-25) when their specs were written; finding ESC-26 — landingFor()
  // resolving inherited Object members through `role in MAP` — came out of that work. What is
  // still excluded needs a render host or a browser: src/app/** (App Router Server Components),
  // src/components/**, the TanStack Query hooks in src/lib/api/queries.ts, NextAuth's
  // src/lib/auth/options.ts, and src/lib/{pwa,idb}/**. Those stay with Playwright (§30.5).
  // src/lib/api/client.ts is tested (src/lib/api/__tests__/client.spec.ts) but not gated: the
  // same file also exports useApi/useUpload, which need that render host.
  collectCoverageFrom: [
    'src/lib/loadingState.ts',
    // Formatting, country/dial-code handling, navigation permissions and role landing routes —
    // the pure logic every screen depends on (§35.13 ESC-25).
    'src/lib/format.ts',
    'src/lib/countries.ts',
    'src/lib/nav.ts',
    'src/lib/auth/roles.ts',
    // Risk-register heat-map banding + grid (ADR-065) â€” pure logic behind the RiskHeatMap component.
    'src/lib/riskHeatMap.ts',
    // Kubernetes probe endpoints â€” a regression here silently disables liveness/readiness.
    'src/app/health/**/route.ts',
    // Feature-flag resolution (QM-15). The React binding stays in src/lib/api/flags.ts; this is
    // the pure half, and it decides whether a flag reads as on â€” a wrong fallback here would
    // enable a feature that is still at 0% rollout.
    'src/lib/flags.ts',
    // Locale widening + document lang/dir (QM-3). A regression here is invisible on screen but
    // makes a screen reader announce Thai with an English voice, and would drop the Buddhist Era.
    'src/lib/locale.ts',
  ],
  coveragePathIgnorePatterns: ['/node_modules/', '\\.spec\\.ts$'],
  coverageThreshold: {
    global: { lines: 100, branches: 100 },
  },
};
