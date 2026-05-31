// @cos/shared jest.config.js — Phase 1 deliverable
// Excludes: event interface files (pure TypeScript types, no executable code)

/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: {
          strict: true,
          isolatedModules: true,
        },
      },
    ],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    // Exclude pure TypeScript interface files — no executable code
    '!src/events/**',
    '!src/index.ts',
    '!src/**/*.interface.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: {
      lines: 80,
      branches: 70,
    },
  },
  testEnvironment: 'node',
  // testcontainers Kafka/Redis containers take time to stop — force exit after all tests pass.
  forceExit: true,
  moduleNameMapper: {
    '^@cos/logger$': '<rootDir>/../logger/src/index.ts',
    '^@cos/logger/(.*)$': '<rootDir>/../logger/src/$1',
    '^@cos/types$': '<rootDir>/../types/src/index.ts',
    '^@cos/types/(.*)$': '<rootDir>/../types/src/$1',
  },
};
