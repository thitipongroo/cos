// Setup for the render project.

/* eslint-disable @typescript-eslint/no-require-imports */

// ── 1. globalThis.expo ───────────────────────────────────────────────────────────────────────────
//
// expo-modules-core reads `globalThis.expo` AT IMPORT TIME (EventEmitter.ts:22 and friends), so
// every expo package that touches it throws "Cannot read properties of undefined (reading
// 'EventEmitter')" off-device. expo ships the installer for exactly this case and jest-expo calls it
// the same way; using it beats hand-mocking each expo package one at a time.
const { installExpoGlobalPolyfill } = require('expo-modules-core/src/polyfill/dangerous-internal');
installExpoGlobalPolyfill();

// ── 2. Native modules ────────────────────────────────────────────────────────────────────────────
//
// `requireNativeModule(name)` looks the name up in `globalThis.expo.modules` and THROWS when it is
// absent — and the lookup happens at import time, at the top of a module, so one unregistered name
// takes down a whole suite before a single assertion runs. Importing one screen reached ExpoFetchModule
// (expo replaces globalThis.fetch with a lazy getter that requires it), then ExpoAsset, then more.
//
// Registering them one by one is a list that grows with every screen a test touches, and each entry
// says nothing. A Proxy answers ANY name with an inert module instead, so a screen loads and its
// behaviour can be asserted, while the capability itself stays absent — which is honest: this is a
// node process, there is no camera, no keystore and no audio session here.
//
// A test that needs a native module to DO something mocks that package itself (see
// src/__mocks__/expo-camera.tsx and the mapping in jest.render.config.ts) rather than relying on
// what this returns. Assignments still win: registerWebModule and per-spec setup write through.
const expoGlobal = globalThis as unknown as {
  expo: { modules: Record<string, unknown> };
};

const registered: Record<string, unknown> = {
  // Seeded explicitly because expo/fetch SUBCLASSES what it finds here (FetchResponse extends
  // NativeResponse), and a plain object is not a valid superclass — "Super expression must either be
  // null or a function". Reached without anyone calling fetch: expo replaces globalThis.fetch with a
  // lazy getter, so merely READING the global loads this module.
  ExpoFetchModule: {
    NativeRequest: class NativeRequest {},
    NativeResponse: class NativeResponse {},
  },
};

function inertNativeModule(name: string): Record<string, unknown> {
  return {
    __inert: name,
    addListener: () => ({ remove: () => undefined }),
    removeListeners: () => undefined,
    removeAllListeners: () => undefined,
  };
}

expoGlobal.expo.modules = new Proxy(registered, {
  get(target, property: string) {
    if (property in target) return target[property];
    if (typeof property !== 'string') return undefined;
    target[property] = inertNativeModule(property);
    return target[property];
  },
  set(target, property: string, value: unknown) {
    target[property] = value;
    return true;
  },
  has() {
    return true;
  },
});

// ── 3. __DEV__ ───────────────────────────────────────────────────────────────────────────────────
//
// FALSE, deliberately. expo/src/Expo.fx.tsx requires its dev-client message socket behind
// `if (__DEV__)`, and that reaches React Native's getDevServer(), which reads a packager URL that
// does not exist in a node process — "Cannot read properties of null (reading 'match')". Any screen
// importing expo-router hits it. No application code branches on __DEV__ (grep over src returns
// nothing), so the flag costs the suites nothing and keeps the dev-only tree out of them.
//
// Set HERE and not in the config's `globals`: @react-native/jest-preset's setup.js defines __DEV__
// with Object.defineProperty and runs after the config is read, so a `globals` entry is overwritten.
// This file is last in setupFiles for that reason.
Object.defineProperty(globalThis, '__DEV__', {
  configurable: true,
  enumerable: true,
  writable: true,
  value: false,
});

// ── 4. Resolve expo's lazy globals now, inside setup scope ───────────────────────────────────────
//
// expo/src/winter/runtime.native.ts replaces globalThis.fetch with a GETTER that requires expo/fetch
// on first read. Whoever reads it first pays that require — and when the first read lands BETWEEN
// tests (jest's own teardown touching globals), jest refuses outright: "You are trying to `require`
// a file outside of the scope of the test code", and the suite fails with no failing assertion.
//
// fetch is not the only one — runtime.native.ts installs nine of these. Importing expo here puts
// the getters in place, and reading each one resolves it to a plain value while we are still inside
// setup, so nothing later can be caught by them. The list is runtime.native.ts's own `install(...)`
// calls in order; if expo adds one and a suite starts failing this way, add it here.
require('expo');
const lazyExpoGlobals = [
  'TextDecoder',
  'TextDecoderStream',
  'TextEncoderStream',
  'URL',
  'URLSearchParams',
  'DOMException',
  '__ExpoImportMetaRegistry',
  'structuredClone',
  'fetch',
] as const;
for (const name of lazyExpoGlobals) {
  void (globalThis as unknown as Record<string, unknown>)[name];
}

// ── 5. react-native ──────────────────────────────────────────────────────────────────────────────
//
// src/__mocks__/react-native.ts is a 22-line stub (I18nManager / Platform / AppState) written for
// the logic suites. Jest applies a `__mocks__` file naming a NODE MODULE automatically — no
// jest.mock() call and no moduleNameMapper entry needed — for every such directory under `roots`, so
// this project inherited it and the first component to touch StyleSheet.create got `undefined`. A
// moduleNameMapper entry pointing at the real package does not win against it; only unmocking does.
jest.unmock('react-native');
