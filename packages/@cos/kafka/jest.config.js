// @cos/kafka jest.config.js — Rule 35 (every package with executable logic has a 100/100 gate).
// Split out of @cos/shared 2026-08-22 (ADR-055): the Kafka SDK is Node-only and must not sit in a
// package that React Native/Metro bundles (Rule 34).

/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\.spec\.ts$',
  transform: {
    '^.+\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: {
          strict: true,
          isolatedModules: true,
        },
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: {
      lines: 100,
      branches: 100,
    },
  },
  testEnvironment: 'node',
  // test/ exclusion is handled per-script via --testPathPatterns='src/' (unit) and
  // --testPathPatterns='test/' (integration); testPathIgnorePatterns would override those.
  testPathIgnorePatterns: ['<rootDir>/node_modules/'],
  // testcontainers containers take time to stop — force exit after all tests pass.
  forceExit: true,
  moduleNameMapper: {
    '^@cos/logger$': '<rootDir>/../logger/src/index.ts',
    '^@cos/logger/(.*)$': '<rootDir>/../logger/src/$1',
    '^@cos/types$': '<rootDir>/../types/src/index.ts',
    '^@cos/types/(.*)$': '<rootDir>/../types/src/$1',
  },
};
