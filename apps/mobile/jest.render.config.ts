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

  collectCoverage: false,
};

export default config;
