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
    // Workspace package aliases
    '^@cos/types$': '<rootDir>/../../packages/@cos/types/src/index.ts',
    '^@cos/types/(.*)$': '<rootDir>/../../packages/@cos/types/src/$1',
    '^@cos/ui-logic$': '<rootDir>/../../packages/@cos/ui-logic/src/index.ts',
    '^@cos/ui-logic/(.*)$': '<rootDir>/../../packages/@cos/ui-logic/src/$1',
  },
  collectCoverage: true,
  coverageDirectory: 'coverage',
  // Scope the 100% gate to unit-testable business logic. Excluded by omission: UI screens
  // (src/app/**), RN components (src/components/**), the i18n React provider (src/i18n/index.tsx —
  // its logic lives in the fully covered src/i18n/*.ts modules), the axios instance + interceptors
  // (src/api/client.ts), WatermelonDB runtime wiring (src/db/database|schema|migrations + models),
  // and React data hooks that require a render host (useNetworkStatus, useCollection). These are
  // covered by the Detox E2E suite / integration, not unit tests.
  collectCoverageFrom: [
    'src/sync/**/*.ts',
    'src/store/*.ts',
    'src/lib/**/*.ts',
    'src/i18n/**/*.ts',
    'src/api/auth.ts',
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
