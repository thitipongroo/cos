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
