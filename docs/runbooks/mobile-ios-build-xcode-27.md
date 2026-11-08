---
title: Mobile iOS Build on Xcode 27
version: 1.0.0
last_updated: 2026-11-02
audience: Mobile engineers, anyone building apps/mobile for the iOS simulator
---

# Runbook — Building the mobile app for the iOS simulator on Xcode 27

ADR-046 verified the iOS build on **Xcode 26.5**. On **Xcode 27.1 / Swift 6.4** the same project failed in seven
separate places. Every one below was hit and resolved on 2026-11-02, ending in a Debug build that installs, signs
in and runs on the iPhone 17 simulator.

Items 1–3 are fixed in the repository. Items 4–7 are per-machine or tooling problems, and you have to deal
with them yourself — the steps are here.

## Fixed in the repository — nothing to do

### 1. `expo-modules-jsi` does not compile with Swift 6.4

```text
JavaScriptRuntime.swift:219:35: error: a C function pointer can only be formed from a reference to a 'func' or a literal closure
```

Fixed upstream in `expo-modules-jsi` **56.0.13** (expo PR #46736). The app is on `expo` **~56.0.24**, which brings
56.0.14; the other SDK-56 packages were aligned with `npx expo install --fix`. If you see this error, your
`node_modules` predates that bump: run `pnpm install` in `apps/mobile`, then `pod install`.

### 2. A pod declares an iOS deployment target Xcode 27 rejects

```text
The iOS Simulator deployment target 'IPHONEOS_DEPLOYMENT_TARGET' is set to 12.4, but the range of supported deployment target versions is 15.0 to 27.1.x. (in target 'RNSVG-RNSVGFilters' from project 'Pods')
```

`ios/Podfile` `post_install` now raises every pod below the app's minimum (`ios.deploymentTarget`, default 16.4) to
that minimum. The same block is re-applied on every `expo prebuild` by `plugins/withPodfileFixes.js` fix (4);
`src/lib/__tests__/podfileFixes.spec.ts` fails if the two drift apart. Run `pod install` after pulling.

### 3. Debug link fails on `Sealable` / `getDebugProps` symbols

```text
Undefined symbols for architecture arm64:
  "facebook::react::Sealable::Sealable()", "facebook::react::ShadowNode::getDebugName() const", …
Ld …/COS.app/COS.debug.dylib
```

The app was linking against the **prebuilt** React Native core (`Pods/React-Core-prebuilt/React.xcframework`), and
the copy installed was the Release flavour, which lacks the debug symbols that source-built new-architecture
libraries (react-native-svg, gesture-handler, reanimated) reference in a Debug build. React Native's own swap
phase only replaces it when `Pods/React-Core-prebuilt/.last_build_configuration` exists, so a fresh `pod install`
could leave the wrong flavour in place.

Since 2026-11-02 React Native is **built from source** on iOS: `app.json` → `expo-build-properties` →
`ios.buildReactNativeFromSource: true`, which `expo prebuild` writes into `ios/Podfile.properties.json` (also
committed there). `pod install` then reports `[ReactNativeCore] Building from source: true` and
`[ReactNativeDependencies] Building from source: true`, and React core is compiled with the same configuration as
the app, so Debug always links. Android is unaffected (the option is set under `ios` only).

The cost is build time — React Native and its C++ dependencies (RCT-Folly, boost, glog, fmt, DoubleConversion)
compile with the app. Switching an existing build tree to source on 2026-11-02 took **about 5½ minutes** on an
Apple M3 (8 cores), with the other pods already compiled; a build from an empty `build/` takes longer.
Incremental builds recompile only what changed. If a build still fails on these symbols, `pod install` was not
re-run after pulling.

## Per machine — do these once

### 4. `npx expo run:ios` treats the simulator as a physical device

```text
Unexpected devicectl JSON version output from devicectl. Connecting to physical Apple devices may not work as expected.
CommandError: No code signing certificates are available to use.
```

Expo CLI cannot parse Xcode 27's `devicectl` output, so it asks for a signing certificate even for a simulator — with
a UDID or with a device name. Build with `xcodebuild` and install with `simctl` instead (see
[Build and run](#build-and-run)).

### 5. `NODE_BINARY` points at a Node that no longer exists

```text
Script-….sh: line 9: /opt/homebrew/Cellar/node@24/24.18.0/bin/node: No such file or directory
Command PhaseScriptExecution failed with a nonzero exit code   (targets hermes-engine, ReactNativeDependencies)
```

`ios/.xcode.env.local` (git-ignored, per machine) pins a versioned Homebrew path that disappears on every Node
upgrade. Point it at the version-stable link:

```bash
echo 'export NODE_BINARY=/opt/homebrew/opt/node@24/bin/node' > apps/mobile/ios/.xcode.env.local
```

### 6. Detox framework cache is for another Xcode

```text
DetoxRuntimeError: …/Library/Detox/ios/framework/…/Detox.framework could not be found, this means either you changed a version of Xcode …
```

```bash
cd apps/mobile && npx detox build-framework-cache
```

### 7. Metro cannot resolve `@cos/ui-logic`

```text
the package …/node_modules/@cos/ui-logic/package.json was successfully found. However, this package itself specifies a `main` module field that could not be resolved (…/dist/index.js)
```

Metro bundles `@cos/ui-logic` from **`dist/`** of its copy in `apps/mobile/node_modules` (a `file:` dependency;
see the package README) — not from source, whatever `tsconfig.json` `paths` say. Build it, reinstall so the copy
picks it up, and restart Metro with a clean cache (`CI=1` Metro does not watch, so it keeps the old miss):

```bash
pnpm --filter @cos/ui-logic build
cd apps/mobile && pnpm install
npx expo start --clear
```

## Build and run

From `apps/mobile/ios`, after `pod install`:

```bash
xcodebuild -workspace COS.xcworkspace -scheme COS -configuration Debug \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath build CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO

xcrun simctl boot 'iPhone 17'          # if not booted
xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/COS.app
xcrun simctl launch booted com.constructionos.cos
```

and Metro in another terminal: `cd apps/mobile && npx expo start`.

**Sign ad hoc (`CODE_SIGN_IDENTITY=-`), never `CODE_SIGNING_ALLOWED=NO`.** An unsigned app carries no
entitlements, so the keychain is unavailable and `expo-secure-store` cannot save the session. Sign-in then appears
to fail with "Invalid or expired OTP" although the server accepted the code — nothing in the logs says why.
`codesign -dv build/Build/Products/Debug-iphonesimulator/COS.app` must report `Signature=adhoc`.

## Driving the simulator with Detox

`e2e/capture.spec.ts` shows the pattern (disable synchronisation, fixed delays, `xcrun simctl io booted
screenshot`). On the login screen, the phone-pad keyboard covers **SEND OTP**: tap outside the field (for example
the "FIELD WORKER ACCESS" heading) before tapping the button, or Detox reports it "not hittable".

`launchApp({ delete: true })` does not sign you out: the iOS keychain survives an uninstall, so the app opens
straight on Home with the previous session and a login step waiting for `phone-input` times out. Start from a
signed-out state with the E2E reset link (`cos://e2e/reset`, only when the bundle runs with `EXPO_PUBLIC_E2E=1`) or
erase the simulator (`xcrun simctl erase <device>`).

## Verification record

| Date       | Xcode / Swift | Simulator | Result                                                                                                                                           |
| ---------- | ------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-02 | 27.1 / 6.4    | iPhone 17 | Debug build signed ad hoc, installed, signed in (Path A against a local fixture API), trial banner and `+` verified in three subscription states |
| 2026-11-02 | 27.1 / 6.4    | iPhone 17 | Same, with React Native built from source (`ios.buildReactNativeFromSource`) — no prebuilt, links in Debug with no manual step                   |
