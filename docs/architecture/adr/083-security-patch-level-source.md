# 083: Where the Security Patch Level row gets its value — ADR-082 assumed a capability neither platform provides

**Date:** 2026-08-05
**Status:** Accepted — **Option B** (product owner, 2026-08-05)
**Deciders:** Product owner (thitipongroo), engineering
**Tags:** security, mobile, identity

---

## Context

ADR-082 accepted platform attestation and specified four nullable columns on
`platform.trusted_devices`: attestation verdict, the time it was obtained, **OS version**, and
**security patch level**. It then constrained where those last two may come from:

> **Root/jailbreak and patch level are read from the attestation verdict**, not from a client-side
> heuristic. Client-side root detection is trivially defeated by the very condition it detects.

That constraint is sound. The problem is the premise: **no attestation verdict on either platform
contains a security patch level.** This was verified against the platform documentation on
2026-08-05, after `@expo/app-integrity` was installed and its actual API read.

### What the platforms actually return

| Source                          | Patch level?                                                                                                                                                                                                                      | Evidence                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Play Integrity verdict**      | **No.** `deviceAttributes` carries `sdkVersion` and nothing else.                                                                                                                                                                 | Google is moving the other way: the December 2024 rework "reduce[d] the device signals that need to be collected and evaluated on Google servers by ~90%", explicitly for privacy.                                                                                                                                                             |
| **Play Integrity — indirectly** | As a **tier**, not a date. `MEETS_STRONG_INTEGRITY` on Android 13+ requires "a security update within the last year".                                                                                                             | The patch fact is _encoded into the verdict_ rather than exposed as a value.                                                                                                                                                                                                                                                                   |
| **iOS App Attest**              | **No — and no device data at all.** An assertion yields `authenticatorData` (app-ID hash + a monotonic counter) and a signature.                                                                                                  | App Attest attests the **app**, not the device. Apple exposes no OS version, no patch level and no jailbreak verdict through it.                                                                                                                                                                                                               |
| **Android Key Attestation**     | **Yes**, and server-verifiable.                                                                                                                                                                                                   | A different mechanism in the same package: `getAttestationCertificateChainAsync()` returns an X.509 chain whose extension `1.3.6.1.4.1.11129.2.1.17` carries `osPatchLevel` (tag 706, INTEGER, **`YYYYMM`** — e.g. `201808`) and `osVersion` (tag 705, six-digit, `080100` = 8.1.0), in both a software-enforced and a hardware-enforced list. |
| **`expo-device`**               | Client-side only. `osVersion`, `osBuildFingerprint`, `platformApiLevel`, and `isRootedExperimentalAsync()` — whose own documentation says it "is not completely reliable because there exist solutions to bypass root-detection". | Exactly what ADR-082 forbids.                                                                                                                                                                                                                                                                                                                  |

Two further facts that bear on the decision:

- The `@expo/app-integrity` API is **challenge-response**, not a single token, and on Android it wraps
  **two independent mechanisms**: Play Integrity (`prepareIntegrityTokenProviderAsync` +
  `requestIntegrityCheckAsync`) and Key Attestation (`generateHardwareAttestedKeyAsync` +
  `getAttestationCertificateChainAsync`). Using Key Attestation is therefore an _additional_
  mechanism to stand up, not a flag on the one already chosen.
- Key Attestation mints its own hardware-backed key. This platform already has one —
  `react-native-secure-sign`'s P-256 key from ADR-054 — so this would be a **second** key per device,
  with its own alias, lifecycle and failure modes.

### What comparable products do

Displaying a device's patch date is an **MDM / device-posture** capability, not a line-of-business app
one. Intune reads an Android security-patch-level property per device; Samsung Knox and Android
Enterprise Device Trust evaluate patch level as part of a compliance posture. Those platforms hold
device-management privileges that an ordinary app does not, which is precisely why the app-facing
attestation APIs return a _tier_ instead of a fingerprint.

So the honest summary of industry practice is: **attestation APIs give you a verdict; MDM gives you a
patch date.** The mockup's row is an MDM-shaped affordance on an app-shaped API surface.

## Decision

**Option B — render the integrity tier the platforms actually produce; do not render a patch date.**
(Product owner, 2026-08-05.)

ADR-082's instruction ("read the patch level from the attestation verdict") cannot be followed as
written, because the value it names does not exist in either verdict. Of the options below, B is
taken; A and C are recorded as rejected with their reasons.

### What this means concretely

- The screen shows a **device-integrity tier**, not a date. On Android 13+ the strongest tier already
  _means_ "patched within the last year", so the security question the row exists to answer is
  answered — the mockup asked for the evidence when what the reader needs is the conclusion.
- `platform.trusted_devices.security_patch_level` **is removed**. Under this decision nothing can
  ever write it, and a permanently-NULL column on a security table invites a future reader to
  populate it from the one source this platform has rejected. Migration `20260805000001` is revised
  rather than superseded: it is uncommitted and has never been applied anywhere.
- A `integrity_level` column is added for the tier (`STRONG | DEVICE | BASIC`), nullable — Play
  Integrity produces it, App Attest has no equivalent, so it is NULL on iOS.
- `os_version` is kept, with its source narrowed: the only server-verified OS signal available is
  Play Integrity's `deviceAttributes.sdkVersion` (an Android API level). NULL on iOS.
- `attestation_verdict` keeps its existing meaning — whether an answer was obtained at all
  (`PASSED | FAILED | UNAVAILABLE`), which is orthogonal to how strong that answer was.

### Why B over A

Option A is defensible and honours ADR-082 literally, but it buys one Android-only field for a
disproportionate amount of security-critical machinery: an ASN.1/X.509 parser, Google root-chain
verification and revocation checking on a backend that has none of it today, plus a **second**
hardware-backed key per device alongside ADR-054's. Each of those is a place to get cryptography
subtly wrong, and the result would still be blank on iOS. The tier answers the same question with
code both platforms already produce.

### Why not C

An unverifiable value on a security screen is worse than an absent one. A caption saying "not
verified" does not repair it: the reader cannot tell that the number is exactly as trustworthy as the
device that reported it, which on a compromised device is not at all — and a compromised device is
precisely the case the row exists to detect.

### Option A — Android Key Attestation; iOS renders "not available"

Add Key Attestation alongside Play Integrity. The server verifies the returned X.509 chain against
Google's attestation root and reads `osPatchLevel` from the **hardware-enforced** list (the
software-enforced copy is attacker-influenced on a rooted device and must not be trusted).

- Honours ADR-082's constraint exactly: the value is signed by Google, never self-reported.
- Google's own guidance prefers `osPatchLevel` over `vendorPatchLevel` / `bootPatchLevel` for
  "has this device been patched recently".
- Cost: an ASN.1/X.509 parser and root-chain verification on the server (the backend has neither
  today); a second hardware key per device; revocation-list checking; and the format is `YYYYMM`, so
  the screen shows a month, not the `YYYY-MM-DD` the mockup renders.
- iOS gets nothing — the row is Android-only and must say so rather than showing a blank.

### Option B — follow the platforms: show the integrity tier, drop the date

Render what the verdict actually establishes. On Android 13+, `MEETS_STRONG_INTEGRITY` already
_means_ "patched within the last year", so the security question the row exists to answer is answered
— without a date, and without a second attestation mechanism.

- Cross-platform: iOS and Android both produce a tier, so the screen is consistent.
- Aligned with where both vendors are deliberately heading.
- Cost: the mockup's `2023-10-05 (Current)` row is replaced by a tier, which is a visible product
  change and not merely an implementation detail.

### Option C — client-reported, labelled as unverified

Show `expo-device.osVersion` / build fingerprint with an explicit "reported by this device — not
verified" caption.

- Cheapest, and cross-platform for OS version.
- **Directly contradicts ADR-082**, and on a security screen an unverifiable value is worse than an
  absent one: the reader cannot tell that the number is exactly as trustworthy as the device it came
  from, which on a compromised device is not at all.

## Consequences

Whichever is chosen, two things follow regardless:

- **ADR-082 must be amended.** Its "read from the attestation verdict" sentence is factually wrong
  about both platforms and will mislead the next reader.
- **Migration `20260805000001`'s comment is wrong about the format.** It documents
  `security_patch_level` as "Android's `ro.build.version.security_patch`, YYYY-MM-DD" — that is the
  _system property_ format. Key Attestation returns `YYYYMM`. The column is `VARCHAR(32)`, so it
  holds either, but the comment must say which one is actually written.

## References

- `docs/architecture/adr/082-device-attestation-v2-accepted.md` (the assumption this corrects)
- `docs/architecture/adr/054-device-trust.md` (the existing P-256 key a second key would sit beside)
- `docs/architecture/adr/081-device-trust-model.md` (the score these signals feed)
- [Android key attestation schema](https://source.android.com/docs/security/features/keystore/attestation#schema)
  · [Key attestation guide](https://developer.android.com/privacy-and-security/security-key-attestation)
- [Play Integrity verdicts](https://developer.android.com/google/play/integrity/verdicts)
  · [Making the Play Integrity API faster, more resilient, and more private](https://android-developers.googleblog.com/2024/12/making-play-integrity-api-faster-resilient-private.html)
- [Mitigate fraud with App Attest and DeviceCheck (WWDC21)](https://developer.apple.com/videos/play/wwdc2021/10244/)
- `mockup/mobile/01_authen/05_privacy_policy/01_data_collection/03_03_device_id_details`
- **That drawing was withdrawn on 2026-08-15**, with the whole `01_data_collection/**` set (~114
  screens). This decision and the screen it shipped are unaffected — ADR-085.
