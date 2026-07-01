# ADR-046: Expo SDK 56 mobile upgrade (WatermelonDB plugin swap)

**Date:** 2026-07-01
**Status:** Accepted
**Deciders:** Product owner / engineering lead
**Tags:** mobile, architecture

---

## Context

apps/mobile was pinned to Expo SDK 51 (RN 0.74, React 18). context.md / spec locked this SDK
explicitly because the WatermelonDB Expo config plugin `@skam22/watermelondb-expo-plugin` is
SDK-version-specific and is abandoned at SDK 51 (published versions: 49, 50, 51 only — nothing for
52–56). Expo SDK 56 ships React Native 0.85 + React 19 and defaults to the New Architecture; RN
still supports the legacy architecture via `newArchEnabled: false`, which this app already sets.

## Decision

Upgrade apps/mobile to Expo SDK 56, keeping WatermelonDB on the legacy architecture:

- **WatermelonDB plugin:** `@skam22/watermelondb-expo-plugin@^51` → `@morrowdigital/watermelondb-expo-plugin@^2.3.3`
  (actively maintained; auto-configures `@nozbe/watermelondb` + `simdjson`).
- Expo 51 → ~56, and align every `expo-*` / `react-native*` package to the SDK 56 versions from
  Expo's `bundledNativeModules.json` (RN 0.85.3, React 19.2.3, etc.). `expo install --fix` could not
  be used (a hoisted-lockfile `LRUCache` CLI error) so versions were pinned from bundledNativeModules
  directly.
- Exclude `@nozbe/simdjson` from RN autolinking (`expo.autolinking.exclude`) — otherwise it is added
  both by autolinking and by the WatermelonDB plugin, giving CocoaPods duplicate-source conflict.
- Remove `expo-av` (deprecated + removed in SDK 54; unused in app code — 0 imports; its SDK-51 pod
  fails to compile against SDK 56 ExpoModulesCore).
- Keep `newArchEnabled: false` — WatermelonDB 0.28 is untested on the New Architecture, but compiles,
  links and runs on the legacy architecture under RN 0.85.

Verified on this machine (Xcode 26.5, iPhone 17 Pro simulator): `expo prebuild` + `pod install`
(WatermelonDB + simdjson pods) + `xcodebuild` → **BUILD SUCCEEDED**; the app installs, launches and
stays running (no crash).

## Rationale

The SDK-51 lock existed because of the `@skam22` plugin, not a fundamental blocker; `@morrowdigital`
is the maintained successor and unblocks the SDK bump. Staying on the legacy architecture avoids
WatermelonDB's unverified New-Architecture support while still moving five SDKs forward.

## Consequences

### Positive

- Mobile SDK current (56); React 19; abandoned `@skam22` plugin replaced.

### Negative / Follow-up

- WatermelonDB remains on the legacy architecture; moving to the New Architecture is gated on
  upstream WatermelonDB New-Arch support (a later ADR).
- Detox e2e re-validation on the SDK 56 build is a follow-up (build + launch verified; full e2e not
  re-run here).

### Spec update

- The SDK-51-specific "Never" notes in context.md (WatermelonDB dev-client + `@skam22@^51`) must be
  updated to reference SDK 56 + `@morrowdigital`.

## References

- context.md mobile "Never" rules; spec §17.8, §30.7; Expo SDK 56 (RN 0.85) notes
