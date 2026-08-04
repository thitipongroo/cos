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
  already enrolled predates the field, and because attestation can legitimately fail to be obtained
  (no Play Services, an OS the API does not cover) — absent is a distinct state from failed.
- **Attestation stays additive and non-blocking**, exactly as ADR-054 made trust additive: a failed
  or absent attestation lowers the trust score and shows a state on screen. It never blocks a login.
  The OTP remains the authenticator.
- **Root/jailbreak and patch level are read from the attestation verdict**, not from a client-side
  heuristic. Client-side root detection is trivially defeated by the very condition it detects.
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

## References

- ADR-054 (device trust v1, and the v2 this supersedes the deferral of)
- ADR-081 (DeviceTrustModel — the primary consumer of these signals)
- `docs/specifications/20-ux-flow.md` §20.6.1 · `docs/specifications/05-security-compliance.md` §5.4
- `backend/prisma/migrations/20260716000003_device_trust/`,
  `backend/src/modules/identity/device-trust/device-trust.service.ts`
- `mockup/mobile/01_authen/05_privacy_policy/01_data_collection/03_03_device_id_details`
