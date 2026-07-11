---
title: Construction OS — Android Screen Capture
last_updated: 2026-07-08
last_updated: 2026-07-08
---

# Construction OS — Android App Screens

> Part of [`docs/screens/`](../README.md) · platform: **Android**.

⏳ **Pending capture.** No Android screenshots have been captured yet.

Planned: the same 21-flow set as [iOS](../ios/README.md) (`00-login` … `20-profile`), captured on an
Android emulator via the Detox `android.emu.release` configuration
([`apps/mobile/.detoxrc.js`](../../../apps/mobile/.detoxrc.js)) with the same deep-link + screenshot
approach as `e2e/capture.spec.ts`. Screenshots land here as `00-login.png` … `20-profile.png`.

## Why not captured on this workstation (verified 2026-07-08)

Capture is deferred (product-owner decision) because the local Android capture chain is incomplete.
Verified state of this Windows workstation:

| Component | Status |
| --- | --- |
| Android SDK (`%LOCALAPPDATA%\Android\Sdk`) | ✅ present — `platform-tools` (adb), `emulator`, `platforms/android-36.1`, `build-tools` |
| JDK for the Gradle build | ✅ Android Studio JBR **21** at `C:\Program Files\Android\Android Studio\jbr` (system default is JDK 25; the earlier "JDK-17 only" note is outdated) |
| `cmdline-tools` (`sdkmanager` / `avdmanager`) | ❌ not installed |
| System image (e.g. `system-images/android-3x/google_apis/...`) | ❌ none installed |
| AVD (`emulator -list-avds`) | ❌ none created |
| Connected device (`adb devices`) | ❌ none |
| Expo web fallback (`react-native-web` + `react-dom`) | ❌ not in `apps/mobile/package.json` deps |

To actually capture, on this or a CI machine:

1. Install `cmdline-tools`, then `sdkmanager` a system image (~1–2 GB download).
2. `avdmanager create avd` (e.g. `Pixel_4_API_34`, matching
   [`apps/mobile/.detoxrc.js`](../../../apps/mobile/.detoxrc.js)); boot the emulator.
3. Build + install the app with the JBR-21 toolchain (`JAVA_HOME` → Android Studio `jbr`) — either
   `npm run build:e2e:android` (Detox release) or a debug `expo run:android`. First RN Gradle build is
   slow and failure-prone.
4. Run capture: adapt [`apps/mobile/e2e/capture.spec.ts`](../../../apps/mobile/e2e/capture.spec.ts) — swap
   its one iOS-only `xcrun simctl io booted screenshot` line for `adb exec-out screencap -p` (or
   `device.takeScreenshot`). It already logs in (Path A OTP bypass) and loops all 21 routes via
   `cos:///<route>` deep links.

Screenshots land here as `00-login.png` … `20-profile.png`, the same 21-flow set as
[iOS](../ios/README.md) (which is fully captured). See spec `17 §17.10` native-rebuild note.
