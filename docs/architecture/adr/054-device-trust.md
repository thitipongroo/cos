# 054: Device trust via hardware-bound keypair + server-side registry (§20.6.1)

**Date:** 2026-07-16
**Status:** Accepted
**Deciders:** Product owner (thitipongroo), engineering
**Tags:** mobile, backend, security, identity

---

## Context

The OTP verification screen (`mockup/00_authen/mobile/02_login_otp_verification_mobile`) shows a
"SECURITY PROTOCOL — device recognized as trusted hardware" banner. In the app this was **static
text**: it always claimed the device was trusted, reflecting no real signal. The product owner asked
for a genuine trusted/untrusted state (green when trusted, red when not), designed against how
world-class auth systems solve device trust rather than a cosmetic toggle.

Findings from the research (see References): "trusted" must be a **server-side fact**, not a client
claim; Keycloak has no built-in "remember this device" (and our SMS-OTP path already lives outside
Keycloak); the mainstream pattern is **earned trust** — a device becomes trusted after a first
successful strong auth on it, then proves itself on later logins. The mobile app already runs a
**prebuilt** native project with New Architecture enabled, so hardware-backed key operations are
available without a workflow change.

## Decision

Implement **v1 device trust** as a hardware-bound keypair with a server-side registry, shared by the
auth flow and decided entirely in the NestJS backend.

- **Key material (mobile):** `react-native-secure-sign` generates a non-extractable **P-256** key in
  the Secure Enclave (iOS) / Android Keystore. A stable per-install id is kept in `expo-secure-store`.
  The library's contract, confirmed from its native source: SPKI-DER public key (base64url), ECDSA
  **P-256 / SHA-256** signature in **IEEE-P1363** encoding (base64url), non-interactive signing.
- **Registry (backend):** `platform.trusted_devices` stores the **public** key per (user, device),
  with a 30-day sliding expiry and soft revocation. Cross-tenant identity data, like `platform.users`.
- **Flow:** `/auth/otp/request` mints a single-use challenge (Redis) when a `deviceId` is sent; the
  device signs it; `/auth/otp/attest` verifies the signature against the registered key and returns
  `deviceTrusted` **before** the OTP step, so the trust banner shows a real state while the user types
  the code. Login (`/auth/otp/verify`) stays plain OTP and is never gated on trust. A device enrols its
  public key via `POST /auth/devices` after its first login; `GET`/`DELETE /auth/devices` list and
  revoke ("your devices").
- **Earned trust:** a new device is **untrusted (red)** on first login — the OTP is the authenticator,
  never the device key — and trusted (green) from the next login on that device.

## Rationale

- **Proof-of-possession of a hardware key** beats a bearer secret/cookie: it survives secret-export
  and replay (FFIEC deems a plain enrollment cookie insufficient alone). Verified end-to-end with a
  live smoke test (untrusted → enrol → trusted → tamper-rejected → revoke → untrusted).
- **Server-decided, additive, non-blocking:** `deviceId`/`signature` are optional; existing OTP login
  (and all Detox specs that send neither) is unchanged and simply reads `deviceTrusted: false`. A
  failed trust check can never block a legitimate login.
- **In NestJS, not Keycloak:** Keycloak has no device-trust primitive and the SMS-OTP path is already
  custom; a Keycloak SPI would be more surface for no gain. Passkeys (Keycloak 26.4) remain a possible
  later story for the office/OIDC path.
- **Crypto pinned from source, not guessed:** the exact curve/hash/encoding were read from the
  library's Kotlin/Swift, and `node:crypto` verifies IEEE-P1363 via `dsaEncoding: 'ieee-p1363'`.

Alternatives rejected: **static green** (the mockup's single state, but no real signal — dishonest);
**tie to backend `/health/live`** (that is "server reachable", not "device trusted" — a category
error); **bearer secret in secure-store** (managed-only, weaker — exportable/replayable).

## Consequences

### Positive

- The OTP banner reflects a real, cryptographically-verified trust state.
- A reusable `trusted_devices` registry + "your devices" endpoints for future step-up / revocation UX.

### Negative

- One native module (`react-native-secure-sign`) → a dev-client / EAS rebuild; iOS Secure Enclave is
  unavailable on the Simulator (real device needed there). Android emulator keystore works.

### Neutral

- v2 (deferred): platform attestation — Play Integrity (Android) / App Attest (iOS) via
  `@expo/app-integrity` — to prove the device+app are genuine, layered on this registry.

## References

- `backend/src/modules/identity/device-trust/device-trust.service.ts`, `identity.controller.ts`
- `backend/prisma/migrations/20260716000003_device_trust/`, `docs/api/auth.openapi.yaml`
- `apps/mobile/src/lib/deviceTrust.ts`, `apps/mobile/src/api/devices.ts`
- react-native-secure-sign (native source: `SecureSignSign.kt` `SHA256withECDSA`→P1363;
  `SecureSignSign.swift` `ecdsaSignatureMessageX962SHA256`)
- ADR-050 (mobile Path B login), ADR-051 (expo-crypto UUID); spec §20.6.1, §5.4
