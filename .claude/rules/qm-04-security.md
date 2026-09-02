---
paths:
  - "backend/src/modules/identity/**"
  - "backend/src/shared/middleware/**"
  - "backend/src/shared/guards/**"
  - "packages/@cos/rbac/**"
  - "packages/@cos/validation/**"
  - "infrastructure/terraform/**"
  - "infrastructure/kubernetes/**"
  - "infrastructure/keycloak/**"
  - ".github/workflows/**"
  - "**/*auth*.ts"
---

# QM-4 — Security

Indexed in: `context.md` §QUALITY MANDATES

- **No secrets in code or git history** — runtime secrets injected via **AWS Secrets Manager** (cloud/AWS EKS; External
  Secrets Operator syncs SM secrets → K8s Secret → pod env) or **HashiCorp Vault** (on-premise/hybrid; Vault Agent
  sidecar) per spec §5.2; ADR-013. Kubernetes Secret objects that must exist in git committed only as **SealedSecret**
  via `sealed-secrets` (kubeseal); never commit `.env` files; never commit `*.pem`, `*.key`, or `*.pfx` files;
  pre-commit hook must block secret patterns (`git-secrets` or `gitleaks`). Source of truth:
  `context/00_master_construction_os.md` §Phase 2 Secret Management
- **Secrets rotation** — all secrets must have a rotation schedule defined in
  `docs/policies/secrets-rotation-policy.md`; cloud: database credentials rotated via AWS SM automated rotation (Lambda
  rotation function per resource type); on-premise: database credentials rotated every 24h via **Vault database secrets
  engine** (dynamic secrets, lease TTL — see Vault secret rotation policy); JWT signing keys rotate every 180 days via
  JWKS endpoint rotation (zero-downtime); rotation tested in staging before each Stage transition
- **Authentication — TWO PATHS (Phase 2 authoritative):**
  - **Path B (email/password):** uses Keycloak OIDC — never implement custom email/password auth; JWT is RS256-signed by
    Keycloak
  - **Path A (SMS OTP):** OTP send/verify uses a **Custom lightweight NestJS module** within the identity module (NOT a
    Keycloak extension); after OTP verification succeeds, token issuance goes through **Keycloak Direct Grant**
    (`grant_type=password`, ephemeral credential) → RS256 JWT from Keycloak; SMS gateway: cloud = AWS SNS; on-premise =
    pluggable `SmsSender` provider (in-country aggregator / SMPP / customer gateway) per ADR-040
  - **Who may use which path — spec §5.4.4 (PO decisions 2026-08-21 + 2026-08-23):** role does not bind the path — any
    role may be PROVISIONED on either, EXCEPT `TENANT_ADMIN` and `FINANCE`, which are **Path B only**. Path A mints its
    token through Direct Grant, which Keycloak binds separately from the browser flow, so the ADR-067 MFA condition
    cannot run there — the Direct Grant flow denies those two roles at the IdP; and NIST SP 800-63B Rev 4 makes SMS a
    restricted authenticator that no longer satisfies AAL2
  - **ONE ACCOUNT, ONE PATH (2026-08-23, TDD OQ-14):** an account carries one identifier for its lifetime, and `POST
    /api/v1/users` rejecting both is the design, not a gap. Keycloak stores ONE password credential per user and Path A
    overwrites it on every OTP login, so an account on both paths loses its password to its own login — measured on
    26.6.4, irreversible (the hash cannot be read back). Token exchange cannot avoid it: standard V2 refuses
    `requested_subject`, and the legacy variant that accepts it is PREVIEW + deprecated. Moving someone between paths
    means a new account
  - **Path A asks for `scope=offline_access` (2026-08-23, TDD OQ-14)** so the refresh token does not expire and the
    handset survives a month offline, refreshing silently on reconnect with no new SMS. Without it `refresh_expires_in`
    was **1800 — thirty minutes**, not the 7 days `00_master` promised (that is `ssoSessionMaxLifespan`, a ceiling;
    `ssoSessionIdleTimeout` is what killed it). PATH A ONLY — a non-expiring refresh token belongs on a field handset,
    not an office browser. `enabled=false` still blocks an offline refresh, so deactivation and PDPA erasure keep
    working
  - Keycloak is the single source of truth for identity storage and JWT signing across both paths
  - **Keycloak Realm Model (spec §5, §7.6):**
    - SMB/mid-market (STARTER, PROFESSIONAL): shared realm `construction-os`
    - ENTERPRISE: dedicated realm `cos-{tenantCode}`, provisioned by Phase 25
      EnterpriseProvisioningWorkflow
    - `keycloak-jwt.strategy.ts` resolves the issuer PER TOKEN (2026-08-23, TDD OQ-51):
      the trusted-issuer allowlist is `SELECT keycloak_realm FROM platform.tenants WHERE
      is_active = true` (cached 60s), JWKS is fetched from `KEYCLOAK_URL` + that realm, and
      `validate()` REJECTS unless the realm in `iss` equals the tenant'''s `keycloak_realm`.
      It previously validated against a single `KEYCLOAK_REALM` env var, so a dedicated
      ENTERPRISE realm could not authenticate at all and the `tenant_id` claim was believed
      with nothing tying it to the issuer. `KEYCLOAK_REALM` still seeds the dev default and
      `KEYCLOAK_URL` still supplies the JWKS host (split horizon) — a token'''s `iss` host is
      never used to fetch keys.
- All inputs validated at the API layer — never trust client-supplied data; use **class-validator** (TypeScript/NestJS
  DTOs) or **Pydantic** (Python/FastAPI) for schema validation — never hand-written `if` checks alone (source: master
  API gateway + spec §30.3; `@cos/validation` uses class-validator)
- SQL queries via Prisma ORM only — never raw string interpolation in SQL
- **Schema-qualified SQL names MANDATORY** — all SQL (raw queries, migrations, multi-schema Prisma `@@schema` models)
  must reference tables by schema-qualified name (`procurement.vendors`, `finance.project_budgets`) — **never
  unqualified**; prevents `search_path` ambiguity across the multi-schema tenant model and keeps RLS/tenant isolation
  deterministic (spec §11.0 rule 2; pairs with the RLS mandate under "Skip RLS on domain tables")
- File uploads: validate MIME type server-side, scan with ClamAV (Phase 9+)
- OWASP Top 10 — every endpoint must be hardened against: injection, broken auth, IDOR, SSRF, XSS, security misconfiguration
- **Immutable audit logging (spec §5.1/§5.2 principle, §5.9 STRIDE)** — every state-changing endpoint (create / update /
  delete / state-transition) must emit an **immutable** (append-only — never updated or deleted) audit-log entry
  capturing actor identity, action, target entity_type/entity_id, `tenant_id`, and timestamp. **All SYSTEM_ADMIN /
  platform-admin actions** are additionally written to `platform.audit_logs` with the operator's user identity (spec
  §20.4 admin panel; spec §06 audit-access matrix — SYSTEM_ADMIN = FULL, tenant roles read-only). Audit-log retention
  per `docs/policies/data-retention-policy.md`
- **Security headers** — every HTTP response must include:
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Content-Security-Policy` — policy defined in `docs/policies/csp-policy.md`; never use `unsafe-inline` or
    `unsafe-eval` in production CSP
- **TLS policy** — TLS 1.3 minimum on all ingress endpoints (source: master §Phase 16 + spec §05 §5.2); TLS 1.0, TLS
  1.1, TLS 1.2 explicitly disabled on ingress; certificate rotation automated via cert-manager (Kubernetes) + AWS ACM
  (cloud)
- **mTLS** — required for all service-to-service communication that crosses VPC/node boundaries; internal calls within
  the same NestJS process are exempt; mTLS managed via **Istio 1.21+** service mesh (source: master tech stack — Istio
  handles mTLS certificate lifecycle via cert-manager integration; no separate AWS Private CA required)
- **WAF** — solution depends on deployment type (source: spec §05-security-compliance §5.5 + §08-enterprise-deployment §8.7):
  - **Cloud deployments** (Shared SaaS, Dedicated Tenant): **Cloudflare WAF**
    - Architecture: `Internet → Cloudflare Edge → AWS ALB → EKS Ingress → NestJS`
    - Plan: Cloudflare Pro minimum
    - Rule sets: Cloudflare Managed Ruleset + OWASP CRS (paranoia level 2) + Custom Construction OS rules
    - Rate limits (paths `/api/v*/...`): auth 10 req/min/IP · general API 100 req/min/user · file upload **20
      req/min/user** (spec §05 §5.5)
    - **Origin protection MANDATORY**: AWS ALB SG must allow port 443 from Cloudflare IPs only → `infrastructure/terraform/cloudflare/`
    - **App integration MANDATORY**: use `CF-Connecting-IP` as real IP; validate `CF-Ray` present; log `CF-Ray` → `backend/src/shared/middleware/cloudflare-waf.middleware.ts`
  - **On-premise deployments**: Cloudflare WAF is NOT applicable — Kong Gateway provides rate limiting;
    customer-provided WAF MUST meet OWASP CRS paranoia level 2 minimum (see spec §08-enterprise-deployment §8.7)
- **Data encryption at rest** — algorithm: **AES-256** minimum on all persistent storage (source: spec §5.2); all S3
  buckets + RDS/Aurora: SSE-KMS with **customer-managed key (CMK)**; all ElastiCache nodes: AWS-managed key
  (`at_rest_encryption_enabled`); one CMK per storage-type per env with alias `cos/{env}/rds|s3|elasticache`; **annual
  KMS rotation**; key policy grants use to the app service role + SYSTEM_ADMIN only; CMK definitions in
  `infrastructure/terraform/aws/kms.tf` (source: spec §5.2.1). On-prem = Vault Transit envelope encryption.
- **Penetration testing** — external pentest required before Stage 1→2 and Stage 2→3 transitions; findings tracked in
  `docs/registers/pentest-findings.md`; all HIGH/CRITICAL findings resolved before advancing stage
- SAST and code quality scan must pass in CI before merge — **CodeQL + Semgrep CE + jscpd** (ADR-011;
  spec §30.10, §30.12). Replaced SonarQube, which was specified but never deployed:
  - **CodeQL** (`.github/workflows/codeql.yml`) — semantic/taint SAST over JS-TS, Python and Go.
    Free because this repository is public; on a private repository it needs a GitHub Code Security
    licence billed per active committer. **Cannot run air-gapped** — it requires GitHub.
  - **Semgrep CE** (`.github/workflows/semgrep.yml`, rules in `.semgrep/`) — project-policy rules
    (BLOCKING) encoding the §Never prohibitions below, plus registry security rulesets (advisory,
    reported to code scanning). Runs fully offline, which is what covers on-premise/air-gapped.
  - **ruff** (`ruff check services mlops`, CI lint job, BLOCKING) — Python lint. Nothing linted
    Python before 2026-07-21, which is how 39 unused imports accumulated; the default E+F set
    was measured against this tree and passes clean. Runs offline (ADR-011).
  - **jscpd** (`.jscpd.json`, run in the CI lint job) — duplication. Threshold is a **ratchet at 1.3%**
    against a measured baseline of 1.12% (2026-07-21), not 0%: jscpd has no "new code" concept and
    the repo already carries duplication. ADR-021 removed the three largest clusters — the Go
    workers' copied `internal/coskafka` and `internal/otel` (23.01% of Go lines → **0.00%**, now the
    shared module `libs/go`), the budget grid rendered by two routes (tsx 2.18% → 1.33%), and the
    cursor codec copied into seven `modules/project/` repositories (typescript 1.50% → 1.20%).
    Total went 2.80% → 1.12%. What is left is NestJS controller/service boilerplate and list-page
    scaffolding in `apps/web`.
  - Coverage thresholds are enforced where they are measured — jest 100/100 (QM-1) and pytest
    `--cov-fail-under=99` per Python service — not by a separate quality-gate server.
    Why not SonarQube: its **Community** edition has no branch or pull-request analysis, so a
    "before merge, on new code" gate is impossible on it, and no taint analysis either; those start at
    Developer Edition (paid). See ADR-011 for the full comparison and the air-gapped caveat.
- Dependency vulnerability scan in CI (`npm audit --audit-level=high` / `pip-audit`) — no HIGH/CRITICAL unresolved
- Rate limiting required on all public-facing endpoints (see QM-7)
- CORS policy must be explicit — never use `*` in production; allowed origins defined in `docs/policies/cors-policy.md`
