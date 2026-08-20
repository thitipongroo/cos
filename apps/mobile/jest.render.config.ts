// Render-test project — the second half of jest.config.ts's `projects` list.
//
// Why a second config rather than a change to the existing one: jest.config.ts runs the 88 logic
// suites under ts-jest in a node environment with 'react-native' replaced by a 22-line stub
// (I18nManager / Platform / AppState). Rendering a real component needs the real react-native and a
// babel transform — the opposite requirement — so the two cannot share one config.
//
// Why not jest-expo: measured, not assumed. jest-expo@56.0.5's preset dies under this project's
// jest 30.4.2 with `this._moduleMocker.clearMocksOnScope is not a function` (jest-runtime@30 driving
// jest-environment-node@29, which the preset pins).
//
// Why @react-native/jest-preset and not a hand-rolled transform: a hand-rolled one got as far as
// `Invariant Violation: __fbBatchedBridgeConfig is not set, cannot invoke native modules` — the
// native-module bridge that this preset's setup.js stubs. Reproducing that by hand means
// re-implementing a file that changes with every React Native release.

import type { Config } from 'jest';
import { createRequire } from 'node:module';

// The config file is loaded as an ES module, so __filename is unavailable; anchor the resolver on
// the package directory instead.
const require_ = createRequire(`${process.cwd()}/`);
const rnPreset = require_('@react-native/jest-preset') as {
  moduleNameMapper: Record<string, string>;
  setupFiles: string[];
};

const config: Config = {
  displayName: 'render',
  preset: '@react-native/jest-preset',

  // The preset ships its own testEnvironment (jest/react-native-env.js), which extends
  // jest-environment-node@29 — the exact thing jest-runtime@30 cannot drive:
  //   TypeError: this._moduleMocker.clearMocksOnScope is not a function
  // jest 30's own node environment is used instead; what the preset environment adds beyond it is
  // the RN global scope, which its setup.js (still used, via the preset's setupFiles) installs.
  testEnvironment: 'node',

  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.spec.tsx'],

  // The preset's own patterns cover react-native and @react-native only; the Expo packages this app
  // imports (expo-router, @expo/vector-icons, …) also publish untranspiled sources.
  // The preset's own patterns cover react-native and @react-native only. Everything added here
  // publishes untranspiled ESM/flow and is reached from a screen: the expo packages, the Google
  // Fonts packages, and `standard-navigation` — which is not an expo package by name but is what
  // expo-router's standard-navigation entry point resolves to.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo|expo-.*|@expo|@expo-google-fonts|standard-navigation|react-clone-referenced-element|@testing-library)/)',
  ],

  moduleNameMapper: {
    // Keep the preset's react-native mapping — dropping it re-exposes src/__mocks__/react-native.ts,
    // which jest applies to the node module automatically for any __mocks__ dir under roots.
    ...rnPreset.moduleNameMapper,

    '^@formatjs/(intl-getcanonicallocales|intl-locale|intl-pluralrules)/(polyfill|locale-data).*$':
      '<rootDir>/src/__mocks__/noop.ts',

    // Native modules with no off-device JS implementation keep their existing mocks.
    '^expo-sqlite$': '<rootDir>/src/__mocks__/expo-sqlite.ts',
    '^expo-file-system(/legacy)?$': '<rootDir>/src/__mocks__/expo-file-system.ts',
    '^expo-background-fetch$': '<rootDir>/src/__mocks__/expo-background-fetch.ts',
    '^expo-task-manager$': '<rootDir>/src/__mocks__/expo-task-manager.ts',
    '^expo-battery$': '<rootDir>/src/__mocks__/expo-battery.ts',
    '^expo-secure-store$': '<rootDir>/src/__mocks__/expo-secure-store.ts',
    '^expo-crypto$': '<rootDir>/src/__mocks__/expo-crypto.ts',
    '^@expo/app-integrity$': '<rootDir>/src/__mocks__/expo-app-integrity.ts',
    '^react-native-secure-sign$': '<rootDir>/src/__mocks__/react-native-secure-sign.ts',
    '^expo-camera$': '<rootDir>/src/__mocks__/expo-camera.tsx',
    '^expo-audio$': '<rootDir>/src/__mocks__/expo-audio.ts',
    '^@shopify/react-native-skia$': '<rootDir>/src/__mocks__/react-native-skia.tsx',
    '^@react-native-community/netinfo$': '<rootDir>/src/__mocks__/netinfo.ts',
    '^@expo/vector-icons$': '<rootDir>/src/__mocks__/expo-vector-icons.tsx',

    // The @cos/* sources live OUTSIDE apps/mobile, so the @babel/runtime helpers that
    // babel-preset-expo injects into them cannot be resolved from their own directory — only
    // apps/mobile has that package installed. Pin the helpers to this package's copy.
    '^@babel/runtime/(.*)$': '<rootDir>/node_modules/@babel/runtime/$1',

    '^@cos/types$': '<rootDir>/../../packages/@cos/types/src/index.ts',
    '^@cos/types/(.*)$': '<rootDir>/../../packages/@cos/types/src/$1',
    '^@cos/ui-logic$': '<rootDir>/../../packages/@cos/ui-logic/src/index.ts',
    '^@cos/ui-logic/(.*)$': '<rootDir>/../../packages/@cos/ui-logic/src/$1',
    '^@cos/financial$': '<rootDir>/../../packages/@cos/financial/src/index.ts',
    '^@cos/financial/(.*)$': '<rootDir>/../../packages/@cos/financial/src/$1',
  },

  // The preset's own setup (the native-module bridge stubs) MUST stay — naming setupFiles in a
  // config replaces the preset's list rather than extending it. The two library setups after it are
  // react-native-gesture-handler's own published setup — it calls TurboModuleRegistry.getEnforcing
  // at import time and throws without it (PhotoAnnotation reaches it). Skia publishes an equivalent
  // but it needs global.CanvasKit from its jestEnv environment, which is on the jest 29 line; it is
  // mocked as a module instead (src/__mocks__/react-native-skia.tsx).
  setupFiles: [
    ...rnPreset.setupFiles,
    'react-native-gesture-handler/jestSetup',
    '<rootDir>/jest.render.setup.ts',
  ],

  // ── Coverage: a RATCHET over src/components and src/app ────────────────────
  //
  // The logic suite (jest.config.ts) holds 100% lines and branches, but only over the directories
  // it names — sync, store, lib, i18n, two api modules and four hooks. src/components and src/app,
  // which are 145 files and most of the product, sat outside every coverage gate until this.
  //
  // 100% IS NOT THE LINE HERE, and pretending it is would only mean deleting the gate on the first
  // red build. These floors are what the render specs actually reach, rounded down to the whole
  // percent. Same shape as the repo's jscpd and a11y ratchets: RAISE them in the change that adds
  // the specs. Never lower one to make a build pass — a screen that lost its test is the thing this
  // exists to catch.
  //
  // 2026-08-20, 25 specs, at the moment these directories entered a coverage gate at all:
  //   statements 27.75  branches 21.15  functions 24.93  lines 28.66
  // Same day, 29 specs — users, sync-queue, incidents and login, the four largest screens with no
  // test, three of which had just had behaviour changed under them (the avatar fallback, the
  // severity picker, the shared FAB):
  //   statements 33.33  branches 27.33  functions 29.97  lines 34.25
  //
  // Same day, 33 specs — inspections, edit-permission, material-request and mfa-enrollment joined
  // them. Chosen because each had had behaviour changed under it that week and none had a test: the
  // severity picker's per-screen accent, the radio/checkbox split on the role editor, the submit
  // gate on the request form, and the four answers Keycloak can give an enrolment:
  //   statements 38.91  branches 32.11  functions 35.26  lines 39.81
  //
  // 74 of the 145 files are still at zero — counted, not subtracted: five specs closed ten files,
  // because a screen's spec also exercises the components it renders. That is the work this ratchet
  // exists to pull along.
  //
  // Counted separately from the logic suite rather than merged with it: the two instrument
  // differently (ts-jest vs babel-jest) and merging their reports made files the logic suite covers
  // fully report as low as 80%.
  collectCoverage: false,
  collectCoverageFrom: ['src/components/**/*.tsx', 'src/app/**/*.tsx'],
  coverageThreshold: {
    global: {
      statements: 38,
      branches: 32,
      functions: 35,
      lines: 39,
    },
  },
};

export default config;
