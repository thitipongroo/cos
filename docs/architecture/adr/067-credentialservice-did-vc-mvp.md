# 67. CredentialService (W3C DID/VC) promoted to MVP + design — prerequisite for contract signing

Date: 2026-07-20

## Status

Accepted

## Context

ADR-058 chose PKI / Verifiable-Credential signing for client contract signing (MVP). Verification during
implementation planning found that **`CredentialService` does not exist in code** (0 references in
`backend` / `services` / `packages`) and is spec'd only thinly (BG-001, `05 §5.3`): the W3C standard + one
interface line `CredentialService.issue(subjectDid, credentialType, claims)` + scoped as an **"opt-in
Enterprise module"** (i.e. post-MVP). Contract signing therefore has an unbuilt, under-specified,
post-MVP dependency.

The product owner decided (2026-07-20) to **promote CredentialService into MVP and build it first**, then
build contract signing on top. Because BG-001's build details were UNSPECIFIED, the design was resolved by
product-owner decision (no guessing, no stubbing per CLAUDE.md):

- **Scope:** Full BG-001 platform — DID/VC for worker licence verification, equipment certification, and
  worker safety-training records, **plus** the contract-signing signature use case.
- **Key strategy: separate roles** (the two contexts differ, so one strategy does not fit both):
  - **Issuer** (tenant issuing worker/equipment/training VCs) = **persistent** Ed25519 key held in Vault /
    AWS Secrets Manager (ADR-013), with a stable `did:web` — needed so "issued by Tenant X" is consistent
    and third-party-verifiable over time.
  - **Contract signer** = **ephemeral `did:key` per signing** — generate a keypair, sign the document hash,
    retain the public key + signature + VC, discard the private key. Self-contained + offline-verifiable.
- **Issuer DID method:** `did:web` (resolvable per tenant domain). **Signer DID method:** `did:key`
  (ephemeral, self-contained).
- **VC format / crypto:** W3C VC Data Integrity, **Ed25519Signature2020** (Ed25519 / EdDSA), JSON-LD.
- **Verification:** cryptographic / offline — no platform call at verify time (per BG-001).

## Decision

### Scope change

`05 §5.3` (BG-001) currently scopes DID/VC as an **opt-in Enterprise module**. This ADR **promotes it to
MVP** as a hard prerequisite of contract signing (ADR-058). `21-mvp-scope` and `DESIGN.md` §15 are updated
accordingly. Core authentication is unchanged — Keycloak OAuth2/OIDC remains the auth path (§5.4); DID/VC
is an additional credentialing capability, not an auth replacement.

### Design (all decided; standard defaults flagged ⚑ for confirmation at build-plan approval)

- **Issuer (persistent):** per-tenant `did:web` (e.g. `did:web:{tenant-domain}`); issuer Ed25519 key pair
  held in Vault / AWS Secrets Manager (ADR-013), rotated per §5.2 (⚑ default 180-day rotation with
  overlapping keys). Used to issue `LicenceVC` / `EquipmentCertVC` / `TrainingRecordVC`.
- **Signer (contract signing, ephemeral):** an **ephemeral `did:key`** generated per signing; the signature
  is a VC (Ed25519Signature2020) over the **SHA-256 hash of the signed document**, bound to that ephemeral
  `did:key`. The private key is discarded after signing; the VC embeds the public key, so it stays
  verifiable offline with no stored signer key.
- **VC data model:** W3C VC v2 + Data Integrity `Ed25519Signature2020`; credential types: `LicenceVC`,
  `EquipmentCertVC`, `TrainingRecordVC`, `ContractSignatureVC`.
- **Revocation:** ⚑ **W3C Bitstring Status List (Status List 2021)** — a per-tenant status-list credential;
  contract-signature VCs are effectively non-revocable (point-in-time), worker credentials are revocable.
- **Storage:** ⚑ new `credentials` schema (Postgres): `did_documents`, `verifiable_credentials`,
  `revocation_status_lists`; RLS by `tenant_id`.
- **Interface (spec-anchored):** `CredentialService.issue(subjectDid, credentialType, claims)` +
  `verify(vc)` + `revoke(vcId)` + `resolveDid(did)`.
- **Verification:** offline cryptographic (verifier checks the Data Integrity proof + Status List); no
  platform round-trip, per BG-001.

### Build order

CredentialService **first** (this ADR), then contract signing (ADR-058) is re-based onto it: the
`ContractSignature` records reference a `ContractSignatureVC` issued/verified by CredentialService.

## Consequences

### Positive

- Unblocks the PKI/VC contract-signing decision with a real capability, and delivers BG-001 worker/
  equipment/training credentials.
- Offline cryptographic verification matches BG-001's "no platform call at verify" requirement.

### Negative / open (⚑ = confirm at build-plan approval)

- **Large, security-critical crypto build** — requires a STRIDE review (§5.9), key-management hardening,
  and test vectors; it is a hard blocker in front of contract signing (serialises the two).
- ⚑ Revocation (Status List 2021), ⚑ storage schema, and ⚑ key-rotation policy are proposed as W3C /
  §5.2 standard defaults — confirm or override at build-plan approval.
- `did:web` requires a resolvable per-tenant domain/well-known path — a deployment/DNS dependency to
  confirm for on-prem tenants.
- ADR-058 must be updated to re-base contract signing onto CredentialService (signer = **ephemeral
  `did:key`** per signing; the persistent issuer capability serves worker/equipment/training VCs).

### Neutral

- Keycloak OIDC auth is unchanged; DID/VC is additive.

## References

- ADR-058 (contract signing — the driver; to be re-based onto this) · ADR-013 (Vault / AWS SM key storage)
- `docs/specifications/05-security-compliance.md` §5.3 (BG-001 — scope changed here to MVP) · §5.2 (key rotation)
- W3C DID v1.1, VC Data Integrity (Ed25519Signature2020), Bitstring Status List
