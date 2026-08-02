/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  // Source imports carry explicit `.js` extensions because the ESM build needs them: TypeScript
  // emits import specifiers verbatim, and Node's ESM loader rejects an extensionless `./enums`.
  // Bundlers tolerate either, Node does not — so the extension is written in the source and
  // stripped back off here, since ts-jest resolves against the `.ts` files.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  testRegex: '.*\.spec\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: { strict: true, isolatedModules: true } }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: { global: { lines: 100, branches: 100 } },
  testEnvironment: 'node',
};
