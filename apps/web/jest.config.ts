import type { Config } from 'jest';

/**
 * Unit-test config for apps/web — §35.13 ESC-25.
 *
 * apps/web shipped with no `test` script and zero test files; CI ran only lint, type-check, build
 * and Lighthouse, so none of its business logic was covered by QM-1.
 *
 * SCOPE (mirrors apps/mobile/jest.config.ts, the repo's existing precedent for a UI workspace):
 * the 100% gate covers unit-testable business logic, not React render trees. Excluded by omission,
 * each for a stated reason:
 *
 *   - `src/app/**`          Next.js App Router pages and layouts. Server Components that read
 *                           cookies/headers and await data; they are exercised by the 11 Playwright
 *                           journeys in tests/e2e (§30.5), not by unit tests.
 *   - `src/components/**`   React components needing a render host. No @testing-library/react is
 *                           installed yet; adding it is tracked separately (see §35.13 ESC-25).
 *   - `src/lib/api/queries.ts`  TanStack Query hooks — they only run inside a QueryClientProvider,
 *                           so they need the same render host as components.
 *   - `src/lib/api/types.ts`    Type-only module: no executable statement to cover.
 *   - `src/lib/auth/options.ts` NextAuth configuration object wired to live providers.
 *   - `src/lib/auth/useReadOnly.ts` React hook — render host again.
 *   - `src/lib/pwa/**`, `src/lib/idb/**`  Browser-only APIs (service worker registration,
 *                           IndexedDB); they belong to the PWA E2E path.
 *   - `src/lib/api/client.ts`   Its `apiFetch`/`ApiError` ARE unit-tested (see
 *                           src/lib/api/__tests__/client.spec.ts), but the file also exports the
 *                           `useApi`/`useUpload` hooks, which call `useSession` and `useCallback`
 *                           and so need a render host. The file is therefore tested but not gated;
 *                           it joins the gate together with the components once
 *                           @testing-library/react lands (§35.13 ESC-25).
 *
 * What remains is the pure logic every screen depends on: formatting, country/dial-code handling,
 * navigation permissions and role landing routes.
 */
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.spec.ts', '**/__tests__/**/*.spec.tsx'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@cos/types$': '<rootDir>/../../packages/@cos/types/src/index.ts',
    '^@cos/types/(.*)$': '<rootDir>/../../packages/@cos/types/src/$1',
  },
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/lib/format.ts',
    'src/lib/countries.ts',
    'src/lib/nav.ts',
    'src/lib/auth/roles.ts',
  ],
  coverageThreshold: {
    global: { lines: 100, branches: 100, functions: 100, statements: 100 },
  },
};

export default config;
