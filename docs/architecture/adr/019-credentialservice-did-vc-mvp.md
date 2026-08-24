# 19. CredentialService (W3C DID/VC) promoted to MVP + design — prerequisite for contract signing

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

- **Issuer (persistent):** per-tenant `did:web` (e.g. `did:web:{tenant-domain}`); the issuer Ed25519
  **private key is AES-256-GCM encrypted (ADR-035) and stored at rest in
  `credentials.did_documents.encrypted_private_key`** — the AES master key is env-injected
  (`APP_SECRET_ENCRYPTION_KEY`, sourced from AWS SM / Vault, ADR-013), rotated per §5.2 (⚑ 180-day).
  **Correction (verified during CS-3):** the repo has **no runtime Vault/SM client** for per-tenant dynamic
  secrets (secrets are env-injected and static), so a per-tenant issuer key generated at onboarding is
  encrypted-at-rest per ADR-035 — the same pattern as TOTP MFA seeds — **not** written to a Vault path.
  Used to issue `LicenceVC` / `EquipmentCertVC` / `TrainingRecordVC`.
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

### Service placement (updated 2026-07-20)

CredentialService is a **separate ESM microservice** at `services/credential-service/` (Fastify + raw `pg`,
like `file-service`), **not** a backend NestJS module. The backend calls it over REST (same pattern as
`file-service`). Reason (verified during CS-2): the `@digitalbazaar` W3C DID/VC stack is **ESM-only** and
does not load in the backend's Jest/CommonJS test runner (`SyntaxError: Unexpected token 'export'`; no
`transformIgnorePatterns` configured, and changing the shared config risks the 133 green suites). A
dedicated ESM service (`"type": "module"`) runs the stack natively and isolates the security-critical
crypto surface. It is the **first ESM service** in the repo.

- **Crypto dependencies** (`@digitalbazaar/*`, `jsonld`) live in `services/credential-service/`, not the
  backend (the backend added them during CS-0 and they are moved here).
- **Tests:** Jest in ESM mode (`node --experimental-vm-modules`, `extensionsToTreatAsEsm`, ts-jest
  `useESM`) to keep the QM-1 100% coverage gate on the same tool. ⚑ This establishes the repo's first
  ESM-service test pattern — confirm at review.
- The `credentials` schema (CS-1, migration `20260720000002`) stays in the shared Postgres; the service
  connects with `SET LOCAL app.current_tenant_id` RLS, same as every domain service.

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
- ⚑ Revocation (Status List 2021) and ⚑ storage schema are **built and verified** (CS-6, see
  implementation status below); ⚑ key-rotation policy is still a proposed §5.2 standard default —
  confirm or override at build-plan approval.
- `did:web` requires a resolvable per-tenant domain/well-known path — a deployment/DNS dependency to
  confirm for on-prem tenants.
- ADR-058 must be updated to re-base contract signing onto CredentialService (signer = **ephemeral
  `did:key`** per signing; the persistent issuer capability serves worker/equipment/training VCs).

### Neutral

- Keycloak OIDC auth is unchanged; DID/VC is additive.

### Implementation status (CS-9, verified 2026-07-21)

- **did:web resolution added.** The document loader now routes `did:` URLs to the did:key driver
  (offline) or the did:web driver (`createDidResolver`, `vc-service.ts`); before CS-9 only did:key
  resolved, so worker/issuer VC verification was non-functional. The dispatch is unit-tested to the
  QM-1 100% gate; the real HTTPS resolution path is covered by integration.
- **did:web mandates HTTPS.** `@digitalbazaar/did-method-web@1.0.1` builds an `https://` origin and
  rejects `http:` (`assertions.js`). Plain-HTTP verification is therefore impossible; the integration
  test (`did-web-verify.integration.spec.ts`) stubs **only** the transport (`@digitalbazaar/http-client`)
  to serve the issuer DID document, exercising the real driver + real Ed25519 crypto. Deployment must
  serve `/tenants/:id/did.json` over TLS (already noted below as a DNS/deployment dependency).
- **Real-DB RLS proof.** `rls-isolation.integration.spec.ts` runs the `credentials` migration on a
  Testcontainers Postgres 16 as the non-superuser `app_user` and asserts tenant B cannot read or revoke
  tenant A's issuer/VC rows. Integration specs run via `pnpm test:integration` (separate ESM Jest config,
  coverage not collected); the unit run stays offline + 100%.
- **Crypto test vectors.** `crypto-vectors.spec.ts` locks Ed25519 (RFC 8032) key derivation + signature
  bytes for a fixed seed, tamper rejection, and a full issue→verify round-trip.

### Implementation status (CS-6 — revocation wired, verified 2026-07-21)

- **Status List 2021 is now live end-to-end**, closing the gap where `status-list.ts` and
  `revocation_status_lists` existed but nothing used them: issued VCs carried no `credentialStatus`, so
  offline revocation checking did not work. Worker VCs now claim a bit at issuance, revocation flips and
  re-signs it, and both commit in the transaction that changes the VC row.
- **`credentialStatus` needs its JSON-LD context registered offline.** `@digitalbazaar/security-document-loader`
  does **not** ship `https://w3id.org/vc/status-list/2021/v1`; without it, signing a revocable VC or the
  list credential fails JSON-LD safe mode. Served statically from `@digitalbazaar/vc-status-list-context`
  (added as a direct dependency, Rule 26) — still no outbound fetch at issue or verify time.
- **`checkStatus` is mandatory, not optional.** `@digitalbazaar/vc` refuses to verify any credential
  carrying `credentialStatus` unless a `checkStatus` function is supplied, so revocable VCs would have
  failed verification outright. `verify` now supplies a checker that reads the bit from the caller
  tenant's own row — no fetch of the attacker-supplied `statusListCredential` URL, so no second SSRF
  path — and fails closed on any status entry it cannot resolve to one of our lists.
- **Verify semantics.** Per §Verification above, verification = proof **and** status: the endpoint
  returns `{ verified, revoked }`, and a revoked credential is never `verified`. `revoked` is reported
  separately so a caller can tell "was valid, now revoked" from "bad proof".
- **New public surface.** The signed list is published unauthenticated at
  `/tenants/:tenantId/status-lists/:statusListId` (mirroring `did.json`; both added to the auth plugin's
  public-path allowlist). STRIDE rows added in §5.9.8 — herd privacy, tamper/rollback, spoofed status
  list, cross-tenant read.
- **Coverage.** Unit 100/100/100/100 (79 tests); `status-list.integration.spec.ts` proves
  issue → publish → verify(true) → revoke → verify(revoked) plus per-tenant RLS on a real Postgres.

### Implementation status (DP-1..DP-6 — deployment wiring, verified 2026-07-21)

The service was fully built and tested but had **no deployment artifacts whatsoever** — no Dockerfile,
docker-compose entry, Helm chart, Kong route, TLS certificate, DNS record or CI job. It could not run
in any environment, and three of the four open §5.9.8 `[verify]` items were unverifiable for that
reason. Now wired end to end:

- **Public host resolved** (the "deployment/DNS dependency to confirm" noted above):
  `credentials.construction-os.io` (staging `credentials-staging.construction-os.io`). Single-label
  form deliberately — the existing `*.construction-os.io` wildcard certificate does not cover a second
  label, and did:web is HTTPS-only, so an uncovered host would make every credential unverifiable.
- **Edge:** a Kong service exposing _only_ the two unauthenticated GETs (regex-anchored), with
  IP rate limiting and `request-transformer.remove` stripping client-supplied identity headers.
  issue/verify/revoke are deliberately unrouted — mesh-only. Validated with `kong config parse` (3.9).
- **TLS/DNS:** cert-manager `cos-credentials-tls` + a Cloudflare CNAME, behind `ssl = strict` /
  TLS 1.3.
- **Runtime:** Dockerfile (root context, port 3009, non-root, read-only rootfs), a Helm chart mirroring
  cos-file-service minus the metrics port (the service exposes none), an ArgoCD Application, and an
  ExternalSecret. Image build + container run verified: `/health` 200, public path not 401,
  authenticated path 401 without headers, container log empty.
- **RLS invariant made explicit:** the service's `DATABASE_URL` is fed from `APP_DATABASE_URL`
  (`app_user`), never the privileged `cos` role — a superuser connection silently bypasses every RLS
  policy the credentials schema depends on. Compose uses `app_user` for the same reason.
- **CI:** unit + coverage, Testcontainers integration, docker build, security scan, ECR push and the
  GitOps tag bump now include the service (previously none did).

**DP-8 — structured logging.** The service previously emitted nothing at all, leaving issuance and
revocation invisible outside the audit table. It now logs `credential.issued` / `.revoked` /
`.verified` with tenant, actor and trace ids. It uses a local pino instance rather than `@cos/logger`:
that package is CommonJS and `tsconfig.base.json` maps `@cos/*` to source, so importing it from this
ESM service would force `rootDir: "../.."` on the package and change the emitted dist layout (and the
Dockerfile entrypoint). The pino options mirror `@cos/logger` exactly, so the log shape is unchanged
across services. `logging.spec.ts` pins what may be logged — an allowlist of id/enum/boolean fields —
and asserts no proof, key material, claim or credential body reaches a log line.

Still open: metrics and traces. No Prometheus scrape job was added because there is no metrics endpoint
to scrape (the same reason the existing `file-service:9464` target can never come up — see §5.9.8).

## References

- ADR-058 (contract signing — the driver; to be re-based onto this) · ADR-013 (Vault / AWS SM key storage)
- `docs/specifications/05-security-compliance.md` §5.3 (BG-001 — scope changed here to MVP) · §5.2 (key rotation)
- W3C DID v1.1, VC Data Integrity (Ed25519Signature2020), Bitstring Status List
