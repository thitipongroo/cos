# 082: Device attestation v2 (Play Integrity / App Attest) accepted — ADR-054's deferred v2 pulled forward

**Date:** 2026-08-04
**Status:** Accepted
**Deciders:** Product owner (thitipongroo), engineering
**Tags:** security, mobile, identity

---

## Context

ADR-054 established device trust as a hardware-bound P-256 keypair with a server-side registry
(`platform.trusted_devices`), and closed by naming a **v2 it deliberately deferred**:

> v2 (deferred): platform attestation — Play Integrity (Android) / App Attest (iOS) via
> `@expo/app-integrity` — to prove the device+app are genuine, layered on this registry.

`docs/specifications/20-ux-flow.md` §20.6.1 mirrors that wording ("a hardened v2 … is deferred").

Two things changed on 2026-08-04. The mockup `03_03_device_id_details` requires a **Security Patch
Level** row and a **Root / Jailbreak Check** row — neither is derivable from a keypair, because a
signing key proves possession of a key, not the integrity of the platform holding it. And ADR-081
makes attestation the strongest input to the device trust score: without it, the score would be
computed from recency and revocation history alone, which is close to no signal at all.

So v2 is no longer a hardening nice-to-have; it is the data source two accepted decisions depend on.

## Decision

Accept ADR-054's v2. Implement platform attestation via **`@expo/app-integrity`** — Play Integrity on
Android, App Attest on iOS — verified **server-side** and layered on the existing registry.

- **Verification is server-side.** The app obtains an attestation token; the backend validates it
  against Google's / Apple's verification path. A client-reported verdict is a claim, not evidence —
  the same reasoning that made "trusted" a server-side fact in ADR-054.
- **Registry columns are added nullable** (QM-9 backward-compatible migrations): attestation verdict,
  the time it was obtained, OS version, and security patch level. Nullable because every device
  <!-- ADR-083: `security_patch_level` was dropped — it has no source on either platform. The
       columns as built are attestation_verdict, integrity_level, attested_at and os_version. -->
  already enrolled predates the field, and because attestation can legitimately fail to be obtained
  (no Play Services, an OS the API does not cover) — absent is a distinct state from failed.
- **Attestation stays additive and non-blocking**, exactly as ADR-054 made trust additive: a failed
  or absent attestation lowers the trust score and shows a state on screen. It never blocks a login.
  The OTP remains the authenticator.
- **Root/jailbreak and patch level are read from the attestation verdict**, not from a client-side
  heuristic. Client-side root detection is trivially defeated by the very condition it detects.
  > **Corrected 2026-08-05 — see ADR-083.** The constraint stands; the premise was wrong. **No
  > attestation verdict on either platform carries a security patch level.** Play Integrity's
  > `deviceAttributes` exposes `sdkVersion` alone, and App Attest returns no device data whatsoever —
  > it attests the app, not the device. The root/jailbreak half of this sentence is correct and
  > unchanged: the integrity verdict is exactly the right source for it. The patch-level half is not
  > implementable as written, and ADR-083 replaces the date with the **integrity tier**, which on
  > Android 13+ already encodes "patched within the last year".
- **Feature flag** `s1.identity.device-attestation` — kill-switch, permanent. It gates the
  verification path so a platform-side outage at Google or Apple cannot degrade sign-in.

## Rationale

- **Two accepted decisions now depend on it.** ADR-081's score and the mockup's two integrity rows
  have no other honest source. The alternative is rendering both as Planned indefinitely.
- **Deferral was correct when written and is not now.** ADR-054 deferred v2 because the keypair alone
  delivered the trust banner it was solving. The scope has moved.
- **Server-side verification is the whole point.** An attestation checked on the device is worth
  nothing on a rooted device.
- **Nullable + non-blocking preserves ADR-054's safety property.** A trust check must never be able
  to lock out a legitimate field worker, and that property is worth more than a stricter gate.

Alternatives rejected: **client-side root/jailbreak heuristics** (defeated by the condition they
detect; a false sense of assurance on a security screen is worse than an honest gap);
**keep v2 deferred and render the rows as Planned** (blocks ADR-081 and leaves the mockup unbuilt —
the product owner chose to build them); **block login on failed attestation** (reverses ADR-054's
non-blocking guarantee and makes a Google/Apple outage an authentication outage).

## Consequences

### Positive

- Real integrity signal for the trust score, and honest values for the two integrity rows.
- Closes the gap ADR-054 named as its own future work.

### Negative

- A new native module → dev-client / EAS rebuild. ADR-054 already records that **iOS Secure Enclave
  is unavailable on the Simulator**, so a real device is required to test this path; Play Integrity
  likewise needs Play Services, so a bare emulator image will not exercise it.
- A dependency on Google and Apple availability at verification time — mitigated by the kill-switch
  and by treating absent attestation as a distinct, non-fatal state.
- Migration on `platform.trusted_devices` (nullable columns only).

### Neutral

- `docs/specifications/20-ux-flow.md` §20.6.1 and ADR-054's Neutral section both describe v2 as
  deferred and must be updated to point here.

## Implementation notes (2026-08-05)

Two refinements made while building this, recorded so the ADR does not drift from the code:

- **Three verdict states, not two.** This ADR's text folds "could not be obtained" into a NULL
  column. The implementation splits them: `platform."AttestationVerdict"` is
  `PASSED | FAILED | UNAVAILABLE`, and NULL is reserved for **never attempted** (an enrolment
  predating migration `20260805000001`). The distinction matters to ADR-081's scorer — "we asked and
  the platform could not answer" is a current fact about a device, while "this enrolled in July
  before we asked anyone" is not, and collapsing them would score an old-but-honest device the same
  as one whose integrity is unknown for a live reason. The ADR's actual requirement, that absent be
  distinct from failed, is strengthened rather than weakened.
- **The verifier is a port, and the fallback is §32.9 Type B.** Any claim with no registered verifier
  — a platform string neither adapter claims — resolves to `UnconfiguredAttestationVerifier`, which
  returns `UNAVAILABLE` rather than throwing. That is **Type B** (safe defaults), the _opposite_ of
  ADR-040's SmsSender port, because this ADR forbids attestation blocking a login: a throw here would
  fail enrolment for a field worker whose only fault is having no Play Services.

- **The client is challenge-response, and the two platforms hash in different places.** `attestKeyAsync`
  and `requestIntegrityCheckAsync` take what looks like the same argument but do not: on iOS the raw
  challenge travels and the native layer computes `SHA256(utf8(challenge))` as Apple's
  `clientDataHash`; on Android `setRequestHash` is a pass-through and the client computes the digest.
  Reversing either produces a token the server cannot match — and the failure reads as "attestation
  unavailable" rather than an error, so it would survive a release. The server issues the nonce from
  `POST /auth/devices/attestation-challenge` and **consumes it before comparing**, so a captured token
  cannot be replayed.

The invariant the tests defend is that **no path produces `PASSED` by accident**: unconfigured
verifier, unknown platform, thrown exception and third-party timeout all resolve to `UNAVAILABLE`.
Failing open would turn an outage at Google into a fleet-wide clean bill of health.

### Both platforms are implemented (2026-08-05)

**`PlayIntegrityVerifier` is live.** Standard Play Integrity requests **must** be decrypted by Google
— local decryption with response encryption keys is a _classic_-request feature — so the adapter is a
service-account-authenticated `POST …:decodeIntegrityToken`, not a crypto routine. No new dependency
was needed: the JWT-bearer assertion is RS256, which `node:crypto` signs natively.

Three checks run **in order**, matching Google's guidance to "always verify requestDetails first":

1. `requestDetails.requestHash` equals `SHA256(challenge|deviceId)` — the token answers _our_ nonce.
   Skipping it accepts a token minted for any other request on the same device.
2. `requestDetails.requestPackageName` equals ours — skipping it accepts a valid token from a
   different app entirely.
3. only then, `deviceIntegrity.deviceRecognitionVerdict`.

An **empty verdict array maps to `FAILED`, not `UNAVAILABLE`**: Google omits the field when the device
"shows signs of attack (API hooking, rooting), system compromise, or [is] not running on a physical
device", which is exactly what this feature exists to detect. Filing it under "we could not tell"
would discard a positive detection. `MEETS_VIRTUAL_INTEGRITY` (a genuine emulator with Play services)
likewise fails — legitimate for Google Play Games on PC, not for a site handset.

**`AppAttestVerifier` is live too, and is a completely different shape.** There is no service to ask:
Apple's object is self-contained, so the backend does the cryptography against a **pinned** root CA
(`apple-app-attest-root.ts` — downloaded once, fingerprint asserted in the test suite so the trust
anchor cannot be swapped silently). Fetching a trust anchor at verification time would mean whatever
answered the request decides what to trust.

All nine of Apple's steps are implemented. The load-bearing one is **step 5**: the nonce
`SHA256(authData ‖ SHA256(challenge))` must appear inside the credCert extension
`1.2.840.113635.100.8.2`. Without it the object is replayable forever _and every other check still
passes_ — a verifier missing only that step looks perfectly healthy.

Three dependencies were added rather than a turnkey App Attest package: `@peculiar/x509` (9.6M
weekly), `@peculiar/asn1-schema` (15.5M) and `cbor-x` (1.6M). The turnkey options draw 32.7K and
**22** weekly downloads; for a security protocol the risk is not malice but a step quietly
implemented wrong, and adoption is the only proxy available for how many people have looked.

**What the tests do and do not prove.** Every step has a positive case and a negative case built from
a synthetic chain with a throwaway root — only the anchor is substituted, so the real chain-walking
code executes. That proves each step is implemented and load-bearing. It does **not** prove a genuine
attestation from real hardware satisfies them; per this ADR's own Negative section, that is only
verifiable on a device.

Configuration — none of the iOS values are secrets:

|         | backend                                                                    | client                                      |
| ------- | -------------------------------------------------------------------------- | ------------------------------------------- |
| Android | `PLAY_INTEGRITY_PACKAGE_NAME`, `PLAY_INTEGRITY_SERVICE_ACCOUNT` (⚠ secret) | `EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER` |
| iOS     | `APP_ATTEST_TEAM_ID`, `APP_ATTEST_BUNDLE_ID`, `APP_ATTEST_ENV`             | —                                           |

Anything unset means no verdict is recorded — never a failed one. `APP_ATTEST_ENV` defaults to
production on purpose: development builds attest with a different `aaguid`, and an unset variable
must not be the permissive choice.

## References

- ADR-054 (device trust v1, and the v2 this supersedes the deferral of)
- ADR-081 (DeviceTrustModel — the primary consumer of these signals)
- `docs/specifications/20-ux-flow.md` §20.6.1 · `docs/specifications/05-security-compliance.md` §5.4
- `backend/prisma/migrations/20260716000003_device_trust/`,
  `backend/src/modules/identity/device-trust/device-trust.service.ts`
- `mockup/mobile/01_authen/05_privacy_policy/01_data_collection/03_03_device_id_details`
- **That drawing was withdrawn on 2026-08-15**, with the whole `01_data_collection/**` set (~114
  screens). This decision and the screen it shipped are unaffected — ADR-085.
