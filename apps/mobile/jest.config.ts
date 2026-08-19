import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.spec.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  moduleNameMapper: {
    // @formatjs ICU polyfills — NO-OP under jest, on purpose.
    //
    // They exist for Hermes, which ships a partial Intl without PluralRules or Locale. Node (and
    // therefore jest) has full ICU, so they have nothing to do here — and their published files are
    // ESM that this CommonJS ts-jest setup cannot parse, so importing them for real only breaks the
    // run. Stubbing does not weaken any assertion: what guarantees the imports survive is
    // `src/i18n/__tests__/pluralPolyfill.spec.ts`, which reads translate.ts as source precisely
    // because no test process can reproduce the runtime that needs them.
    // Scoped to the POLYFILL entry points only. A blanket `^@formatjs/.*` also stubbed
    // icu-messageformat-parser / ecma402-abstract / fast-memoize — which intl-messageformat itself
    // depends on — and silently broke every formatting test.
    '^@formatjs/(intl-getcanonicallocales|intl-locale|intl-pluralrules)/(polyfill|locale-data).*$':
      '<rootDir>/src/__mocks__/noop.ts',
    // Native module mocks
    '^expo-sqlite$': '<rootDir>/src/__mocks__/expo-sqlite.ts',
    // expo-file-system + its SDK-54+ `/legacy` subpath (uploadAsync / FileSystemUploadType) → same mock
    '^expo-file-system(/legacy)?$': '<rootDir>/src/__mocks__/expo-file-system.ts',
    '^expo-background-fetch$': '<rootDir>/src/__mocks__/expo-background-fetch.ts',
    '^expo-task-manager$': '<rootDir>/src/__mocks__/expo-task-manager.ts',
    '^expo-battery$': '<rootDir>/src/__mocks__/expo-battery.ts',
    '^react-native$': '<rootDir>/src/__mocks__/react-native.ts',
    '^@react-native-community/netinfo$': '<rootDir>/src/__mocks__/netinfo.ts',
    '^@nozbe/watermelondb$': '<rootDir>/src/__mocks__/watermelondb.ts',
    '^@nozbe/watermelondb/(.*)$': '<rootDir>/src/__mocks__/watermelondb.ts',
    // Workspace package aliases.
    //
    // Every one of these points at the package's SOURCE, mirroring the `paths` in tsconfig.json.
    // That is not a convenience: apps/mobile is a standalone workspace consuming these as `file:`
    // dependencies, whose package.json `main` is dist/index.js — and the Mobile Tests CI job only
    // installs, it never builds the packages. Resolving through node_modules therefore finds a
    // package whose entry point does not exist. That is exactly how @cos/financial broke: it was in
    // tsconfig paths (so type-check passed) but missing here, so four suites died with "Cannot find
    // module '@cos/financial'" in CI while passing locally, where a previous `pnpm run build` had
    // left a dist/ behind. Add BOTH lines for any new @cos package used from mobile.
    '^@cos/types$': '<rootDir>/../../packages/@cos/types/src/index.ts',
    '^@cos/types/(.*)$': '<rootDir>/../../packages/@cos/types/src/$1',
    '^@cos/ui-logic$': '<rootDir>/../../packages/@cos/ui-logic/src/index.ts',
    '^@cos/ui-logic/(.*)$': '<rootDir>/../../packages/@cos/ui-logic/src/$1',
    '^@cos/financial$': '<rootDir>/../../packages/@cos/financial/src/index.ts',
    '^@cos/financial/(.*)$': '<rootDir>/../../packages/@cos/financial/src/$1',
  },
  collectCoverage: true,
  coverageDirectory: 'coverage',
  // WHAT THIS LIST IS FOR, after 2026-08-19. The gate below is 100%/100%, and it was 100%/100% on the
  // day a review found seven data-losing defects in the sync engine — because every one of them lived
  // in the WIRING between two covered modules rather than inside either: `requeueFailed` and
  // `resetStale` had no caller, so a failed mutation was never retried; `registerBackgroundSyncTask`
  // had no caller, so the background job never existed; nothing ever wrote `syncStore.pendingCount`,
  // so the only sync indicator in the product read "synced" to a device holding an unsent shift.
  // Unit coverage of a module cannot see that nobody calls it.
  //
  // Two things changed in response. First and most of all, the WIRING WAS MOVED INTO THE GATED TREE
  // rather than the gate being stretched over the wiring: sync/syncRunner.ts (the single entry point
  // every trigger now uses), sync/queueObserver.ts (queue depth → the store the pill reads),
  // sync/resolutionTargets.ts (server verdict → the local row) and sync/httpFailure.ts each exist
  // because the logic they hold used to sit inline in a screen or a layout, where nothing could reach
  // it. A test can now assert that the connection is made, which is the class of bug that got through.
  //
  // Second, `src/api/client.ts` joins the list — the 401-refresh interceptor and the offline-queue
  // fallback are where the app meets the server, and the refresh queue leaked pending promises there
  // for months. The remaining src/api modules are thin request wrappers, and src/db is runtime
  // SQLite wiring.
  //
  // ON src/app AND src/components (rewritten 2026-08-19). This used to read "need a render host this
  // project does not install (no react-test-renderer / @testing-library/react-native) and stay with
  // Detox". Both halves were wrong by then. A render host IS installed now — see
  // jest.render.config.ts and `pnpm test:render`. And "stay with Detox" meant "stay unverified":
  // `grep -rniE 'detox' .github/workflows/` returns NOTHING, so no pull request has ever run a
  // mobile E2E test.
  //
  // They stay out of THIS list on purpose even so. The render suite is run by its own command, not
  // merged into this coverage report: the two projects instrument differently (ts-jest here,
  // babel-jest there) and merging them made files this suite covers fully report as low as 80%.
  // A line percentage over a UI tree measures little anyway; what those trees now have is
  // behavioural render tests.
  collectCoverageFrom: [
    'src/sync/**/*.ts',
    'src/store/*.ts',
    'src/lib/**/*.ts',
    'src/i18n/**/*.ts',
    'src/api/auth.ts',
    'src/api/client.ts',
    'src/hooks/useSyncStatus.ts',
    'src/hooks/usePendingCount.ts',
    'src/hooks/useConflicts.ts',
    '!src/**/*.spec.ts',
  ],
  coveragePathIgnorePatterns: ['/node_modules/', '/src/__mocks__/', '\\.spec\\.ts$'],
  coverageThreshold: {
    global: { lines: 100, branches: 100 },
  },
};

export default config;
