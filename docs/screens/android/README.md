---
title: Construction OS — Android Screen Capture
last_updated: 2026-07-05
---

# Construction OS — Android App Screens

> Part of [`docs/screens/`](../README.md) · platform: **Android**.

⏳ **Pending capture.** No Android screenshots have been captured yet.

Planned: the same 21-flow set as [iOS](../ios/README.md) (`00-login` … `20-profile`), captured on an
Android emulator via the Detox `android.emu.release` configuration
([`apps/mobile/.detoxrc.js`](../../../apps/mobile/.detoxrc.js)) with the same deep-link + screenshot
approach as `e2e/capture.spec.ts`. Screenshots land here as `00-login.png` … `20-profile.png`.

> Blocked locally by the JDK-17 toolchain requirement (this workstation has only JDK 25); run on a
> JDK-17 environment / CI runner. See spec `17 §17.10` native-rebuild note.
