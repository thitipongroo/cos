# 58. Client contract signing mechanism (PKI/VC e-signature, bilateral, Finance service)

Date: 2026-07-20

## Status

Accepted — **re-based onto ADR-067 (2026-07-20).** Implementation-planning verification found
`CredentialService` was not built and was spec'd as post-MVP/Enterprise, so PKI/VC could not be built as
stated. Per ADR-067, CredentialService (W3C DID/VC) is promoted to MVP and built **first**; contract
signing then consumes it. The signer uses an **ephemeral `did:key` per signing** (not a persistent key);
the persistent issuer capability serves worker/equipment/training VCs. All other decisions in this ADR
stand (bilateral, Finance service, upload-or-generate, magic-link client, direct contractor authority).

## Context

ADR-057 placed **client contract signing** in MVP scope but left the signing **mechanism** as a pending
pre-build design decision (it must not be stubbed before the product owner decides). The `Contract` entity,
its `status` (`draft → signed → active → terminated`), and the `ContractSigned` event (§16.2) already exist;
`Contract` is owned by the **`finance` service** (`finance.contracts`, `/api/v1/finance/contracts`,
create = `PROJECT_MANAGER`/`TENANT_ADMIN` — ADR-024, §14). What was missing is the actual signing capability.

The product owner decided the mechanism (2026-07-20) from options grounded in existing platform primitives:

- **E-signature method:** **PKI / digital certificate** using the existing **`CredentialService`**
  (W3C Verifiable Credential / DID — §5.4, `CredentialService.issue(subjectDid, credentialType, claims)`).
- **Contract document source:** **Both** — upload an external PDF to the File Service **and** generate a
  contract document in-app from `Contract` + BOQ + terms.
- **Client (external) signer identity:** **Magic-link passwordless**, reusing the Vendor Portal external
  access pattern (ADR-030) — no platform account required.
- **Contractor-side authority:** **Authorized role signs directly** — no approval chain.

## Decision

Build client contract signing as an extension of the **`finance` service**, bilateral (contractor +
client), using existing primitives only. No new external dependency.

### Signing flow

1. `Contract` in `draft`.
2. **Attach document** → `signed_document_id` (FK → File Service): either **upload** a prepared PDF or
   **generate** one in-app from `Contract` + BOQ + terms. Both paths store to the `cos-files` MinIO bucket
   (SSE-KMS, §5).
3. **Contractor signs directly** — an authorized role (`TENANT_ADMIN`, `EXECUTIVE`, `PROJECT_MANAGER`)
   signs; no approval chain. A `ContractSignature(party = INTERNAL)` is recorded.
4. **Client signs via magic-link** — the system issues a single-use, cryptographically-signed, HTTPS-only,
   short-expiry token (ADR-030 pattern) to the client; the client signs without an account. A
   `ContractSignature(party = CLIENT)` is recorded.
5. Each signature is a **PKI/VC signature**: `CredentialService.issue(...)` binds the signer's DID to the
   **SHA-256 hash of the signed document**; the credential reference, document hash, signer identity,
   `signed_at`, and IP are written to the **immutable/WORM audit log** (§5, §9.299).
6. When **both** required signatures are recorded and verified → `status = signed` → emit **`ContractSigned`**
   (existing, §16.2) → downstream transition to `active` (billing milestones + retention run against
   `active`, unchanged).

### Data model (canonical in §11)

New entity **`ContractSignature`** (in the `finance` schema):

- `signature_id` (UUID PK), `tenant_id`, `contract_id` (FK → Contract)
- `signer_party` ENUM (`INTERNAL` / `CLIENT`)
- `signer_identity` — `user_id` for INTERNAL; captured name + email/phone for CLIENT
- `credential_ref` — VC / DID reference returned by `CredentialService`
- `document_hash` — SHA-256 of the signed document at signing time
- `signed_at`, `ip_address`
- `magic_link_token_id` (nullable — populated for CLIENT)
- `verification_status` ENUM (`VERIFIED` / `PENDING` / `FAILED`)

`Contract` gains `signed_document_id` (nullable FK → File). The existing `status` values are unchanged;
`signed` is reached only when both signatures exist and verify.

### API (canonical in §14, under `/api/v1/finance/contracts`)

- `POST /{id}/document` — attach document (mode: `upload` | `generate`) → sets `signed_document_id`
- `POST /{id}/sign` — internal authorized-role signature (`TENANT_ADMIN`/`EXECUTIVE`/`PROJECT_MANAGER`)
- `POST /{id}/sign-links` — issue a client magic-link (same roles)
- `POST /contracts/sign/{token}` — **external** client signing via magic-link; tenant-middleware-excluded
  and resolved from the signed token (ADR-030 pattern)
- `GET /{id}/signatures` — signature audit trail

### Events (§15/§16)

- Emit a `ContractSigned` event when the contract becomes fully signed.
- Add `ContractDocumentAttached` and `ContractSignatureRecorded` for the intermediate steps.

**Correction (CT-7, verified 2026-07-21):** the "reuse `ContractSigned`" premise was wrong — the only
existing event is `platform.enterprise.contract_signed.v1` (`EnterpriseContractSignedEvent`), which is the
**enterprise tenant-provisioning** domain (§34/§15.7), not finance contract signing. §16.2 lists
`ContractSigned` under CRM but no schema existed. So three **new finance-domain** events were created and
registered in the topic-catalog: `finance.contract.document_attached.v1` (attach, CT-2),
`finance.contract.signature_recorded.v1` (each signature, CT-3/CT-5), and `finance.contract.signed.v1`
(the draft→signed transition, emitted when both a VERIFIED INTERNAL and a VERIFIED CLIENT signature exist).
Contract status is a free `VARCHAR` (`DRAFT`→`SIGNED`→`ACTIVE`→`TERMINATED`); new contracts now default to
`DRAFT`. `signed→active`/`terminated` remain existing/manual states — not driven by signing.

### RBAC (§6)

- Sign / issue-link / attach-document: `TENANT_ADMIN`, `EXECUTIVE`, `PROJECT_MANAGER`.
- External client: no platform role — authorized solely by the single-use magic-link token.
- View signature audit: same as contract read (`FINANCE`, `PM`, `EXEC`, `PROC`, `ADMIN`).

## Consequences

### Positive

- Reuses `CredentialService`, File Service, WORM audit, and the magic-link pattern — no new external SaaS.
- Bilateral signing with a tamper-evident hash + VC gives a strong, verifiable audit trail.

### Negative / open

- **PKI/VC for an external client** requires issuing/holding a DID-bound credential for a non-account signer;
  the exact client-DID issuance flow (ephemeral vs persistent) is an implementation detail to settle in build.
- **Legal validity under Thai ETA / ETDA is a compliance follow-up** — this ADR fixes the technical
  mechanism, not a legal opinion; in-country counsel (per §28 legal-review pattern) confirms admissibility.
- In-app **document generation** adds a contract-template capability (templating from Contract + BOQ) — a
  build task, not yet templated.

### Neutral

- `Contract` stays in the `finance` service (ADR-024); this is additive. `signed → active` semantics
  (retention, billing milestones) are unchanged.

## References

- ADR-057 (scope: client contract signing = MVP, mechanism pending) — this ADR resolves that mechanism
- ADR-030 (Vendor Portal — magic-link external access pattern, reused for client signing)
- ADR-024 (AR billing — `Contract`/`Customer` live in the `finance` service)
- `docs/specifications/05-security-compliance.md` §5.4 — `CredentialService` (W3C VC / DID), WORM audit
- `docs/specifications/11-database-schema.md` — `Contract` entity (extended here)
- `docs/specifications/16-enterprise-event-flow.md` §16.2 — `ContractSigned` event (reused)
- `docs/specifications/09-data-architecture.md` §9 — WORM immutable audit storage
