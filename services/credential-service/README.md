# Construction OS — Credential Service (Fastify, ESM)

**Runtime:** Node 24 + Fastify 5.9.0 — the first native-ESM service in the repo (`"type": "module"`)
**Deployable:** Separate from the NestJS monolith
**Decisions:** [ADR-019](../../docs/architecture/adr/019-credentialservice-did-vc-mvp.md) ·
[ADR-058](../../docs/architecture/adr/058-client-contract-signing-mechanism.md) ·
spec [`05-security-compliance`](../../docs/specifications/05-security-compliance.md) §5.4

## Purpose

Issues, verifies and revokes **W3C Verifiable Credentials (VC)** under per-tenant **`did:web`**
issuer identities. It is the cryptographic half of client contract e-signature (ADR-058): the Finance
module calls this service to sign a contract as the contractor and to verify the client's
counter-signature, and both signature records are what flip a contract to `signed`.

It runs as its own deployable because the `@digitalbazaar` VC/JSON-LD stack is ESM-only and would not
load inside the CommonJS NestJS monolith.

## Public API

Routes are served at the **root path** — there is no `/api/v1` prefix here; Kong owns external
routing and CORS (`cors` is registered with `origin: false`).

| Method | Path                                            | Auth   | Purpose                                          |
| ------ | ----------------------------------------------- | ------ | ------------------------------------------------ |
| GET    | `/health`                                       | public | Liveness — `{ status, service }`                 |
| GET    | `/tenants/:tenantId/did.json`                   | public | `did:web` DID document resolution                |
| GET    | `/tenants/:tenantId/status-lists/:statusListId` | public | Status List 2021 bitstring for revocation checks |
| POST   | `/credentials/issue`                            | bearer | Issue a VC signed by the tenant's issuer key     |
| POST   | `/credentials/verify`                           | bearer | Verify a presented VC (proof + revocation)       |
| POST   | `/credentials/:vcId/revoke`                     | bearer | Revoke a VC by flipping its status-list bit      |

**Why three public paths.** A `did:web` document and a status list are fetched by _third-party
verifiers_ who hold only the credential and have no platform identity (BG-001). Everything else
requires a bearer token.

**Auth is verified twice on purpose.** Kong verifies the Keycloak JWT and injects identity headers at
ingress; this service _also_ verifies the bearer itself and derives `tenant_id` from the claim rather
than trusting a header (`src/plugins/auth.ts`, spec §5.9.4). It holds tenant issuer keys, so a
spoofed header must not be sufficient.

## Dependencies

- **VC/DID stack:** `@digitalbazaar/vc`, `ed25519-signature-2020`, `ed25519-verification-key-2020`,
  `did-method-key`, `did-method-web`, `did-io`, `vc-status-list`, `security-document-loader`, `jsonld`
- **HTTP:** `fastify`, `@fastify/helmet`, `@fastify/cors`
- **Identity:** `jsonwebtoken`, `jwks-rsa` (Keycloak JWKS)
- **Storage:** `pg` (PostgreSQL; tenant-scoped via `withTenant`)
- **Logging:** `pino`

## Configuration

| Variable                    | Default       | Purpose                                                       |
| --------------------------- | ------------- | ------------------------------------------------------------- |
| `PORT`                      | `3009`        | HTTP listen port                                              |
| `NODE_ENV`                  | `development` | Runtime mode                                                  |
| `DATABASE_URL`              | — (required)  | PostgreSQL connection (via PgBouncer — QM-18)                 |
| `DID_WEB_BASE_DOMAIN`       | — (required)  | Domain that `did:web:{domain}:tenants:{tenantId}` resolves to |
| `APP_SECRET_ENCRYPTION_KEY` | — (required)  | AES key wrapping issuer private keys at rest (QM-4)           |

Values come from the repo-root `.env` locally; from AWS Secrets Manager / Vault in staging and
production — never from a file.

## Usage example

```bash
# Run locally (ESM, no build step needed in dev)
pnpm --filter @cos/credential-service dev

# Resolve a tenant's DID document — no auth
curl http://localhost:3009/tenants/$TENANT_ID/did.json

# Issue a credential
curl -X POST http://localhost:3009/credentials/issue \
  -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -d '{"credentialSubject":{"id":"did:key:z6Mk...","contractId":"..."},"type":["ContractSignature"]}'
```

## Tests

```bash
pnpm --filter @cos/credential-service test:cov          # unit — 100% lines/branches (QM-1)
pnpm --filter @cos/credential-service test:integration  # Testcontainers PostgreSQL, --runInBand
```
