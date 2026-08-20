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
  // Same day, 37 specs — reset-password, user-profile, finance and permits, the four screens whose
  // rules are about consequence rather than layout: which reset method an account may have, what a
  // profile carries into it, the difference between an empty portfolio and a request that failed,
  // and the tier rule that lets a safety officer refuse a safety permit but not grant one:
  //   statements 43.68  branches 37.82  functions 39.15  lines 44.69
  //
  // Same day, 41 specs — Avatar and the two sync pills (the two components today's product-owner
  // decisions landed in and neither had a test), plus report and invite-user:
  //   statements 46.69  branches 41.10  functions 41.96  lines 47.72
  //
  // Same day, 44 specs — FetchListScreen (two thin screens are almost entirely this file),
  // BiometricLock and SelectProjectSheet. Lines crossed 50%:
  //   statements 49.29  branches 43.39  functions 44.57  lines 50.12
  //
  // Same day, 47 specs — the navigation shell (TopBar, NavigationDrawer) and DateField. Statements
  // crossed 50%:
  //   statements 50.97  branches 45.01  functions 46.23  lines 51.74
  //
  // MobileNav was deliberately SKIPPED rather than missed: it renders Expo Router's <Tabs>, and the
  // role-to-tab rule it exists for is lib/roleTabs.ts, which is already at 100% in the logic suite.
  // A render test there would mostly be testing the navigator.
  //
  // Same day, 50 specs — Breadcrumb (the other half of the back-chevron pair), permit-request and
  // data-export:
  //   statements 53.37  branches 47.79  functions 48.15  lines 54.29
  //
  // Same day, 53 specs — AccountSettings, account-security and role-permissions, the three surfaces
  // where what is drawn IS a security claim:
  //   statements 57.34  branches 50.40  functions 51.72  lines 58.13
  //
  // Same day, 55 specs — NotificationSettings and network-reattest:
  //   statements 58.68  branches 51.10  functions 53.31  lines 59.40
  //
  // Same day, 58 specs — notification-preferences, device-details and TransparencyKit. Statements
  // past 60%:
  //   statements 61.53  branches 52.92  functions 55.67  lines 62.36
  //
  // Same day, 61 specs — PrivacyDetailScreen (the shell six notices are drawn in), system-settings
  // and roles-selection:
  //   statements 63.99  branches 54.86  functions 57.90  lines 64.86
  //
  // Same day, 64 specs — privacy-contact, terms-of-use and apps-services:
  //   statements 65.94  branches 56.52  functions 59.94  lines 66.91
  //
  // Same day, 67 specs — support, the transparency hub and the More tab:
  //   statements 68.28  branches 58.31  functions 62.69  lines 69.26
  //
  // Same day, 70 specs — procurement, vendors and the two tenant-admin confirmations. Statements
  // past 70%:
  //   statements 71.75  branches 60.60  functions 65.81  lines 72.80
  //
  // Same day, 73 specs — the two reset receipts, the erasure screen and the permit receipt:
  //   statements 72.76  branches 61.39  functions 66.83  lines 73.88
  //
  // Same day, 74 specs — the root layout, which had been the highest-risk untested logic left: the
  // launch gate and the auth gate:
  //   statements 73.61  branches 62.02  functions 67.53  lines 74.77
  //
  // Same day, 77 specs — the '/' entry redirect, system-integration and the two pre-auth receipts:
  //   statements 74.53  branches 62.69  functions 68.49  lines 75.75
  //
  // Same day, 80 specs — the app shell, the two FetchListScreen wrappers and the identity page.
  // Functions past 70%:
  //   statements 76.10  branches 63.91  functions 70.40  lines 77.30
  //
  // 22 of the 145 files are still at zero — counted, not subtracted, because a screen's spec also
  // exercises the components it renders. That is the work this ratchet exists to pull along.
  //
  // Counted separately from the logic suite rather than merged with it: the two instrument
  // differently (ts-jest vs babel-jest) and merging their reports made files the logic suite covers
  // fully report as low as 80%.
  collectCoverage: false,
  collectCoverageFrom: ['src/components/**/*.tsx', 'src/app/**/*.tsx'],
  coverageThreshold: {
    global: {
      statements: 76,
      branches: 63,
      functions: 70,
      lines: 77,
    },
  },
};

export default config;
