// @cos/database jest.config.js — Phase 1 deliverable

/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: { strict: true, isolatedModules: true },
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: {
      lines: 80,
      branches: 70,
    },
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@cos/types$': '<rootDir>/../types/src/index.ts',
    '^@cos/types/(.*)$': '<rootDir>/../types/src/$1',
  },
};
