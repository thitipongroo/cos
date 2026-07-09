---
title: Construction OS — Android Screen Capture
last_updated: 2026-07-08
---

# Construction OS — Android App Screens

> Part of [`docs/screens/`](../README.md) · platform: **Android** (`cos_test` emulator, API 36).

✅ **21 screens** — full authenticated flow, live backend + seeded `DEMO-001` data (Buddhist-era Thai UI).

| Device  | Android emulator `cos_test` (API 36), Detox **debug** `app-debug.apk` + Metro      |
| ------- | ---------------------------------------------------------------------------------- |
| Backend | NestJS monolith @ host `10.0.2.2:3000` (emulator loopback), E2E_AUTH_BYPASS + seed |
| User    | `+66800000002` — `PROJECT_MANAGER` (OTP `123456`, E2E bypass)                      |

Screens are the same 00–20 flow as [iOS](../ios/README.md) (`00-login` … `20-profile`), captured by
[`apps/mobile/e2e/capture-android.spec.ts`](../../../apps/mobile/e2e/capture-android.spec.ts).

## How the Android capture was unblocked (four verified fixes)

1. **Gradle 9.3.1 removed `JvmVendorSpec.IBM_SEMERU`** (referenced by the RN 0.85 gradle plugin) →
   pinned the wrapper to **Gradle 8.13** (`android/gradle/wrapper/gradle-wrapper.properties`).
2. **Only JDK 25 was registered** (forces Gradle 9) → build with **JDK 17** (`/opt/homebrew/opt/openjdk@17`).
3. **JVM Metaspace OOM** at packaging → `org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m`.
4. **Detox's native runtime was never wired into the app** — `@config-plugins/detox` was a dependency
   but **missing from `app.json` plugins**, so `expo prebuild` never injected the Detox
   `testInstrumentationRunner` / `com.wix:detox` / `DetoxTest.java`. Adding it to `app.json` and
   re-running `expo prebuild --clean` wired Detox in (then re-applied fixes 1–3, which prebuild resets,
   plus removing a stray `$kotlinVersion` classpath line prebuild injected and setting
   `android.kotlinVersion=2.1.20`).

## How these were captured

Detox on Android uses a **debug** app APK (its runtime is proguard-stripped from release), and a debug
app loads JS from **Metro** (no baked bundle). Detox's `launchActivity` also waits for the main thread
to idle — the app polls continuously, so the bundle must be **warm** before launch. Sequence:

```bash
# 1. build the Detox debug app (JDK 17 + Gradle 8.13, EXPO_PUBLIC_E2E baked at bundle time)
EXPO_PUBLIC_E2E=1 EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api/v1 \
  JAVA_HOME=/opt/homebrew/opt/openjdk@17 detox build -c android.emu.debug
# 2. boot emulator; start Metro with the same env; reverse the host ports
adb reverse tcp:8081 tcp:8081 && adb reverse tcp:3000 tcp:3000 && adb reverse tcp:8090 tcp:8090
EXPO_PUBLIC_E2E=1 EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api/v1 expo start --port 8081 &
# 3. warm the bundle (launch once so Metro builds it), then run the capture
detox test -c android.emu.debug e2e/capture-android.spec.ts
```

The login step taps the field-worker **OTP link** first (the login screen shows both the office
email/password button and the OTP link, ADR-050) before entering the phone/OTP.

Demo data: `backend/prisma/demo-seed.sql` (Postgres `DEMO-001` rows) + seeded ClickHouse
`analytics.*_daily` aggregates.
