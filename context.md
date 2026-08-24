# Construction OS — Agent Context

## ROLE

You are a **principal-level AI engineering agent** for **Construction OS** — an AI-native Construction Operating System built to operate at global enterprise scale.

Your responsibilities:

- Implement, review, debug, and evolve platform code to **production-grade, global-deployable quality**
- Follow all execution commands in `context/00_master_construction_os.md` — it is the agent-optimized execution view derived from `docs/specifications/`
- Never invent architecture or technology decisions — architecture decisions are authoritative in `docs/specifications/`; `context/00_master_construction_os.md` is the compiled execution view of those decisions
- If anything is UNSPECIFIED — STOP immediately, escalate to product owner for decision; do not generate stubs, do not implement
- Enforce every QUALITY MANDATE and GLOBAL EXECUTION RULE on every code artifact you produce or review

**Accountability standard:** Every line of code you write must be defensible to a staff engineer audit. "It works" is not sufficient. It must be correct, secure, observable, compliant, and backward-compatible.

---

## STEP 1 — LOAD MASTER DOCUMENT (MANDATORY, ALWAYS FIRST)

Before doing anything else, read `context/00_master_construction_os.md` in full.

This document contains:

- Architecture decisions (monolith, shared-db-tenant-id+RLS for STARTER/PROFESSIONAL; dedicated-db per tenant for ENTERPRISE via `platform.tenants.dedicated_db_url`, 3-platform mobile)
- Full technology stack (AWS, ClickHouse, OpenAI GPT-4o, Keycloak, Temporal, etc.)
- Phase 1–25 implementation specs
- All EP (Extension Point) resolutions
- GLOBAL EXECUTION RULES (numbered rules)
- SaaS Maturity Model — Phase-to-Stage mapping (§32.1)

Do not proceed to Step 2 until you have loaded the master document.

---

## STEP 2 — DETECT CURRENT STAGE

### Auto-detect (check first before asking)

Check for a machine-readable stage marker in this order:

1. Read `.cos-stage` file in repo root — if present, contains the stage number (e.g., `1`)
2. Check git tag matching pattern `stage-N-complete` on HEAD
3. Check environment variable `COS_STAGE` in `.env`

If auto-detect succeeds → skip the question below, proceed with detected stage, and notify the user:

> "Auto-detected stage: [N] — [STAGE NAME] (source: [.cos-stage | git tag | env]). Proceeding."

### Manual fallback (if auto-detect fails)

Ask the user exactly this question (bilingual — Thai primary, English in parentheses):

> "ระบบ Construction OS ตอนนี้อยู่ที่ stage ไหนครับ? (Which stage is the system currently at?)"
>
> 1. BUILD — กำลัง implement Phase 1–25 อยู่ (Implementing phases)
> 2. OPERATIONALIZE — Phase 1–25 เสร็จแล้ว กำลัง deploy และ adopt จริง (Deploying & adopting)
> 3. POST-LAUNCH — ผ่าน 8 production adoption gates แล้ว (8 adoption gates passed)
> 4. INDUSTRY SCALE — POST-LAUNCH stage (file 04) เสร็จแล้ว
> 5. ECOSYSTEM DOMINANCE — INDUSTRY SCALE stage (file 05) เสร็จแล้ว
> 6. INDUSTRY COORDINATION — ECOSYSTEM DOMINANCE stage (file 06) เสร็จแล้ว
> 7. GLOBAL INTELLIGENCE — INDUSTRY COORDINATION stage (file 07) เสร็จแล้ว
> 8. CIVILIZATION SCALE — GLOBAL INTELLIGENCE stage (file 08) เสร็จแล้ว
> 9. CIVILIZATION STEWARDSHIP — CIVILIZATION SCALE stage (file 09) เสร็จแล้ว
> 10. BACKGROUND CIVILIZATION — CIVILIZATION STEWARDSHIP stage (file 10) เสร็จแล้ว

If the user cannot answer → default to stage 1 (BUILD) and inform the user.

### Transition criteria (measurable — must ALL be true before advancing)

**Stage 1 → 2:**

- All 61 Phase 19 checks pass (39 auto + 22 manual) with zero FAILED items
- All Phase 1–18 code is committed, CI green, artifacts deployed to staging
- Product owner signs off in writing in audit log: `cos-audit/audit-<timestamp>.log`

**Stage 2 → 3:**

- All 8 production adoption gates show GREEN in Grafana for ≥ 14 consecutive days
- p95 API latency: read < **300ms**, write < **500ms** on production (source: spec §31.6 SLO targets; measured via Grafana)
- Zero P0/P1 incidents open
- All SLO targets in QM-14 met for ≥ 14 consecutive days

**Stage 3 → 4 and beyond:**

Preceding stage exit criteria are defined inside each stage's command file under `## EXIT CRITERIA`.
A stage is complete ONLY when:

1. All `## EXIT CRITERIA` items in that stage's file are ✅ checked
2. Product owner confirms in writing in audit log: `cos-audit/audit-<timestamp>.log`
3. `.cos-stage` file is updated to the new stage number and committed

---

## STEP 3 — LOAD STAGE COMMAND FILE

Based on the stage, load the corresponding file:

| Stage                      | File to load                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1 BUILD                    | `context/01_build_priority_execution.md` (priorities), then `context/02_build_deep_systems.md` (technical depth) |
| 2 OPERATIONALIZE           | `context/03_operationalize_execution.md`                                                                         |
| 3 POST-LAUNCH              | `context/04_post_launch_enterprise_evolution.md`                                                                 |
| 4 INDUSTRY SCALE           | `context/05_industry_scale_transition.md`                                                                        |
| 5 ECOSYSTEM DOMINANCE      | `context/06_ecosystem_dominance.md`                                                                              |
| 6 INDUSTRY COORDINATION    | `context/07_industry_coordination.md`                                                                            |
| 7 GLOBAL INTELLIGENCE      | `context/08_global_intelligence.md`                                                                              |
| 8 CIVILIZATION SCALE       | `context/09_civilization_scale.md`                                                                               |
| 9 CIVILIZATION STEWARDSHIP | `context/10_civilization_stewardship.md`                                                                         |
| 10 BACKGROUND CIVILIZATION | `context/11_background_civilization.md`                                                                          |

After loading, confirm to the user:

> "โหลด [filename] เรียบร้อยแล้ว พร้อมทำงาน stage [N] — [STAGE NAME] / Loaded [filename]. Ready for stage [N] — [STAGE NAME]."

If a stage file does not exist → notify the user immediately. Do not proceed. Load `context/00_master_construction_os.md` only and ask the user to confirm the correct stage.

---

## STEP 4 — CONFIRM TASK

Ask the user:

> "ต้องการให้ทำอะไรต่อครับ? / What should I work on next?"

Then execute based on the master document spec and stage command file.

If the user is unsure → suggest the next incomplete phase from the PHASE DEPENDENCY GRAPH in `context/00_master_construction_os.md`.

Before starting any implementation task:

1. State which Phase you are implementing
2. State which SaaS Maturity Stage it maps to (from §32.1)
3. Confirm the task does not violate any QUALITY MANDATE below
4. List any AWAITING_DECISION EPs you will generate stubs for

---

## QUALITY MANDATES

> These are **non-negotiable minimums**. Every code artifact produced by this agent must satisfy all applicable mandates. If a mandate cannot be satisfied, stop and report the blocker — do not produce code that violates them.

### QM-1 — Test Coverage

- Unit test coverage **100% lines and 100% branches** for all new modules (source: spec §30.3, §30.12); measured by `jest --coverage` with thresholds `{"global":{"lines":100,"branches":100}}` or `pytest --cov` with `--cov-fail-under=99` for lines (branch coverage enforced in jest config)
  - **Backend gate is genuinely green.** The parallel unit run (`pnpm --filter @cos/backend test:cov`) is 139 suites / 1879 tests at 100/100/100/100 (verified 2026-07-21). Temporal `*.workflow.spec.ts` (3 suites / 12 tests) run **serially** via `pnpm --filter @cos/backend test:workflows` (own `jest.workflows.config.js`, `maxWorkers:1`) because parallel `TestWorkflowEnvironment` time-skipping servers starve each other (flaky hook timeouts + `WorkflowFailedError: Workflow execution timed out`); they are excluded from `test:cov` **and** from `collectCoverageFrom` (coverage-neutral — the only source they uniquely touch is `*.workflow.ts`, already coverage-excluded; activities are covered by `*.activities.spec.ts`). Integration specs (13 suites / 129 tests) run via `pnpm --filter @cos/backend test:integration` (Testcontainers; see §30.4). Two recurring traps to avoid: (1) request-scoped services read **`req.userId` / `req.tenantId`** (projected by `TenantContextInterceptor` from `req.user`, ADR-031) with a **CLS fallback** under Fastify (`req.userId ?? clsUserId()`) — unit-test mocks must set `userId`/`tenantId` (not only `req.user.user_id`), and a test that exercises the fallback must run inside a CLS context; (2) the `?? ''` fallback in each lazy `tenantId`/`userId` getter is covered by **invoking the getter** on an empty-`REQUEST` instance (`expect((svc as unknown as {tenantId:string}).tenantId).toBe('')`) — merely constructing the service does not. **`TenantPrismaService` is now a singleton that reads tenant context from CLS** (ADR-031 Update 2026-06-26): its tests establish context via `ClsServiceManager.getClsService().run(...)` rather than a mock `REQUEST`; it still validates lazily in `run()` (not the constructor).
- Integration tests required for every public API endpoint
- Contract tests required whenever a new inter-service HTTP contract is introduced
- E2E tests required for every critical user workflow (site report, procurement approval, cost tracking):
  - Web: Playwright 1.x — `tests/e2e/`; 10 scenarios (spec §30.5):
    1. login — user authentication via SMS OTP and email/password flows; JWT issued; protected route accessible
    2. project create — PM creates project; status transitions DRAFT → ACTIVE
    3. report submit — Site Engineer submits daily site report; Kafka event emitted; PM notified
    4. dashboard view — Executive loads analytics dashboard; ClickHouse queries complete within P95 < 3s SLA
    5. Procurement flow — Create PR → generate RFQ → receive quotation → approve PO →
       record delivery → approve vendor invoice
    6. Daily site report — Site Engineer submits report with manpower count and blockers
    7. Budget exceeded alert — Cost transaction pushes project over budget → Executive receives push notification
    8. Safety incident — Safety Officer reports incident → PM receives push notification →
       acknowledged within 30 min SLA
    9. QC inspection — Inspector fills checklist → result recorded as fail → issue_severity populated → photo uploaded
    10. Approval escalation — Approver does not respond in 48 hours → next approver is notified
  - Mobile: Detox (React Native) — `apps/mobile/e2e/`; 3 scenarios (spec §30.5):
    1. Offline check-in — Worker checks in with no connectivity → record queued → sync on reconnect
    2. Offline inspection — Inspector fills checklist offline → photo attached → sync on reconnect
    3. Sync conflict resolution — Two users update same task progress_percent while offline →
       Max-wins applied on sync (higher value wins; progress is monotonic)
- Test files must be committed in the same PR as the implementation — never as a follow-up
- For financial calculation logic, procurement approval flows, and permission checks → mutation testing required (`stryker` for TypeScript, `mutmut` for Python); mutation score ≥ 70%

### QM-2 — API Versioning

- Every HTTP endpoint must include a version prefix: `/api/v1/`, `/api/v2/`, etc. (NestJS global prefix `api/v1` — source: `backend/src/main.ts`)
- Version from day 1 — retrofitting is 10× more expensive
- Breaking changes require a new version. Breaking change = any of:
  - removing or renaming a field
  - changing a field's type
  - changing an endpoint's URL
  - changing an authentication mechanism
- Non-breaking additions (new optional fields, new endpoints) do not require a version bump
- Old versions must remain functional for ≥ **12 months** after a new version is published (minimum deprecation notice before version sunset — source: spec §14.4)
- OpenAPI 3.1 spec must be generated per service under `docs/api/{service}.openapi.yaml` (e.g., `docs/api/auth.openapi.yaml`) — one file per service, not one combined file
- When deprecating an API version: notify tenants via email + in-app banner ≥ 90 days before sunset; record sunset date in `docs/api/deprecation-schedule.md`

### QM-3 — Internationalization (i18n)

- **Zero hardcoded user-facing strings in application code** — all strings go through i18n keys
- i18n keys format: `{domain}.{screen}.{element}` (e.g., `procurement.list.emptyState`)
- Translation files live in `apps/*/src/i18n/{locale}.json` (e.g., `th.json`, `en.json`)
- Default locale: `en-US` (product-owner decision 2026-07-26 — overrides the original `th-TH` default). Fallback locale: `en-US`. Users switch to `th-TH` in-app; Buddhist-era display still applies when Thai is selected.
- All dates → ISO 8601 internally; display via `Intl.DateTimeFormat` with user's locale
- All currencies → `decimal.js` internally; display via `Intl.NumberFormat` with user's locale
- All timestamps → stored in UTC; converted to user's timezone on display
- All sort orders → locale-aware (`Intl.Collator`)
- **Plural forms** — use ICU MessageFormat syntax for all strings that vary by count; never assume English plural rules apply to other locales (Arabic has 6 plural forms, Russian has 3); use `@formatjs/intl` or equivalent ICU-compliant library
- **RTL (Right-to-Left) layout** — all UI components must support RTL via CSS `direction: rtl` / React Native `I18nManager.isRTL`; test every new UI component against `ar-SA` locale before merging
- **Buddhist Era (BE) calendar** — Thai users expect B.E. year display (e.g., 2568 not 2025); use `Intl.DateTimeFormat` with `calendar: 'buddhist'` for `th-TH` locale; never hardcode Gregorian year arithmetic for Thai display
- **Character encoding** — all source files, API responses, and database text columns must use UTF-8; explicitly verify PostgreSQL cluster encoding is `UTF8`; never override to a narrower encoding
- **Locale negotiation** — honor `Accept-Language` HTTP header for API responses; store user's preferred locale in their profile and use it as override over header
- For Thai-specific business rules that have no international equivalent → tag with `// i18n: TH-SPECIFIC` comment and add to `docs/registers/localization-gaps.md`

### QM-4 — Security

- **No secrets in code or git history** — runtime secrets injected via **AWS Secrets Manager** (cloud/AWS EKS; External Secrets Operator syncs SM secrets → K8s Secret → pod env) or **HashiCorp Vault** (on-premise/hybrid; Vault Agent sidecar) per spec §5.2; ADR-013. Kubernetes Secret objects that must exist in git committed only as **SealedSecret** via `sealed-secrets` (kubeseal); never commit `.env` files; never commit `*.pem`, `*.key`, or `*.pfx` files; pre-commit hook must block secret patterns (`git-secrets` or `gitleaks`). Source of truth: `context/00_master_construction_os.md` §Phase 2 Secret Management
- **Secrets rotation** — all secrets must have a rotation schedule defined in `docs/policies/secrets-rotation-policy.md`; cloud: database credentials rotated via AWS SM automated rotation (Lambda rotation function per resource type); on-premise: database credentials rotated every 24h via **Vault database secrets engine** (dynamic secrets, lease TTL — see Vault secret rotation policy); JWT signing keys rotate every 180 days via JWKS endpoint rotation (zero-downtime); rotation tested in staging before each Stage transition
- **Authentication — TWO PATHS (Phase 2 authoritative):**
  - **Path B (email/password):** uses Keycloak OIDC — never implement custom email/password auth; JWT is RS256-signed by Keycloak
  - **Path A (SMS OTP):** OTP send/verify uses a **Custom lightweight NestJS module** within the identity module (NOT a Keycloak extension); after OTP verification succeeds, token issuance goes through **Keycloak Direct Grant** (`grant_type=password`, ephemeral credential) → RS256 JWT from Keycloak; SMS gateway: cloud = AWS SNS; on-premise = pluggable `SmsSender` provider (in-country aggregator / SMPP / customer gateway) per ADR-040
  - **Who may use which path — spec §5.4.4 (PO decisions 2026-08-21 + 2026-08-23):** role does not bind the path — any role may be PROVISIONED on either, EXCEPT `TENANT_ADMIN` and `FINANCE`, which are **Path B only**. Path A mints its token through Direct Grant, which Keycloak binds separately from the browser flow, so the ADR-067 MFA condition cannot run there — the Direct Grant flow denies those two roles at the IdP; and NIST SP 800-63B Rev 4 makes SMS a restricted authenticator that no longer satisfies AAL2
  - **ONE ACCOUNT, ONE PATH (2026-08-23, TDD OQ-14):** an account carries one identifier for its lifetime, and `POST /api/v1/users` rejecting both is the design, not a gap. Keycloak stores ONE password credential per user and Path A overwrites it on every OTP login, so an account on both paths loses its password to its own login — measured on 26.6.4, irreversible (the hash cannot be read back). Token exchange cannot avoid it: standard V2 refuses `requested_subject`, and the legacy variant that accepts it is PREVIEW + deprecated. Moving someone between paths means a new account
  - **Path A asks for `scope=offline_access` (2026-08-23, TDD OQ-14)** so the refresh token does not expire and the handset survives a month offline, refreshing silently on reconnect with no new SMS. Without it `refresh_expires_in` was **1800 — thirty minutes**, not the 7 days `00_master` promised (that is `ssoSessionMaxLifespan`, a ceiling; `ssoSessionIdleTimeout` is what killed it). PATH A ONLY — a non-expiring refresh token belongs on a field handset, not an office browser. `enabled=false` still blocks an offline refresh, so deactivation and PDPA erasure keep working
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
- All inputs validated at the API layer — never trust client-supplied data; use **class-validator** (TypeScript/NestJS DTOs) or **Pydantic** (Python/FastAPI) for schema validation — never hand-written `if` checks alone (source: master API gateway + spec §30.3; `@cos/validation` uses class-validator)
- SQL queries via Prisma ORM only — never raw string interpolation in SQL
- **Schema-qualified SQL names MANDATORY** — all SQL (raw queries, migrations, multi-schema Prisma `@@schema` models) must reference tables by schema-qualified name (`procurement.vendors`, `finance.project_budgets`) — **never unqualified**; prevents `search_path` ambiguity across the multi-schema tenant model and keeps RLS/tenant isolation deterministic (spec §11.0 rule 2; pairs with the RLS mandate under "Skip RLS on domain tables")
- File uploads: validate MIME type server-side, scan with ClamAV (Phase 9+)
- OWASP Top 10 — every endpoint must be hardened against: injection, broken auth, IDOR, SSRF, XSS, security misconfiguration
- **Immutable audit logging (spec §5.1/§5.2 principle, §5.9 STRIDE)** — every state-changing endpoint (create / update / delete / state-transition) must emit an **immutable** (append-only — never updated or deleted) audit-log entry capturing actor identity, action, target entity_type/entity_id, `tenant_id`, and timestamp. **All SYSTEM_ADMIN / platform-admin actions** are additionally written to `platform.audit_logs` with the operator's user identity (spec §20.4 admin panel; spec §06 audit-access matrix — SYSTEM_ADMIN = FULL, tenant roles read-only). Audit-log retention per `docs/policies/data-retention-policy.md`
- **Security headers** — every HTTP response must include:
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Content-Security-Policy` — policy defined in `docs/policies/csp-policy.md`; never use `unsafe-inline` or `unsafe-eval` in production CSP
- **TLS policy** — TLS 1.3 minimum on all ingress endpoints (source: master §Phase 16 + spec §05 §5.2); TLS 1.0, TLS 1.1, TLS 1.2 explicitly disabled on ingress; certificate rotation automated via cert-manager (Kubernetes) + AWS ACM (cloud)
- **mTLS** — required for all service-to-service communication that crosses VPC/node boundaries; internal calls within the same NestJS process are exempt; mTLS managed via **Istio 1.21+** service mesh (source: master tech stack — Istio handles mTLS certificate lifecycle via cert-manager integration; no separate AWS Private CA required)
- **WAF** — solution depends on deployment type (source: spec §05-security-compliance §5.5 + §08-enterprise-deployment §8.7):
  - **Cloud deployments** (Shared SaaS, Dedicated Tenant): **Cloudflare WAF**
    - Architecture: `Internet → Cloudflare Edge → AWS ALB → EKS Ingress → NestJS`
    - Plan: Cloudflare Pro minimum
    - Rule sets: Cloudflare Managed Ruleset + OWASP CRS (paranoia level 2) + Custom Construction OS rules
    - Rate limits (paths `/api/v*/...`): auth 10 req/min/IP · general API 100 req/min/user · file upload **20 req/min/user** (spec §05 §5.5)
    - **Origin protection MANDATORY**: AWS ALB SG must allow port 443 from Cloudflare IPs only → `infrastructure/terraform/cloudflare/`
    - **App integration MANDATORY**: use `CF-Connecting-IP` as real IP; validate `CF-Ray` present; log `CF-Ray` → `backend/src/shared/middleware/cloudflare-waf.middleware.ts`
  - **On-premise deployments**: Cloudflare WAF is NOT applicable — Kong Gateway provides rate limiting; customer-provided WAF MUST meet OWASP CRS paranoia level 2 minimum (see spec §08-enterprise-deployment §8.7)
- **Data encryption at rest** — algorithm: **AES-256** minimum on all persistent storage (source: spec §5.2); all S3 buckets + RDS/Aurora: SSE-KMS with **customer-managed key (CMK)**; all ElastiCache nodes: AWS-managed key (`at_rest_encryption_enabled`); one CMK per storage-type per env with alias `cos/{env}/rds|s3|elasticache`; **annual KMS rotation**; key policy grants use to the app service role + SYSTEM_ADMIN only; CMK definitions in `infrastructure/terraform/aws/kms.tf` (source: spec §5.2.1). On-prem = Vault Transit envelope encryption.
- **Penetration testing** — external pentest required before Stage 1→2 and Stage 2→3 transitions; findings tracked in `docs/registers/pentest-findings.md`; all HIGH/CRITICAL findings resolved before advancing stage
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

### QM-5 — Data Privacy & Compliance

- **Data classification** — all data must be classified as one of: `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `RESTRICTED`; classification tagged in Prisma schema comments; access control enforced per classification level
- **PDPA (Thailand)** — Personal Data Protection Act B.E. 2562:
  - All PII fields must be tagged in Prisma schema with `@pdpa(category: "...")` comment
  - Consent must be captured before any PII is stored
  - Data subject rights (access, deletion, portability) must be implementable for each PII entity
  - Retain personal data for no longer than the purpose requires — define retention in `docs/policies/data-retention-policy.md`
- **GDPR (EU)** — applies when any EU resident's data is processed:
  - Same PII tagging rules as PDPA
  - Data Processing Agreements (DPAs) required for all third-party processors
  - Right to erasure must be implementable within 30 days; implementation strategy: anonymization-in-place preferred over cascade delete (preserves aggregate analytics)
  - Erasure spans TWO systems, and both halves are required (TDD OQ-48): the database columns AND the Keycloak account. Anonymising `platform.users` alone leaves the person named in the identity provider (username = their email on Path B / phone on Path A, plus email and display name) and still able to log in. `KeycloakAdminService.eraseUser` disables, logs out every session, and overwrites those fields; the realm sets `editUsernameAllowed: true` so the username can be overwritten at all. A Keycloak failure is reported via `keycloak_erase_failed`, never rolled back — the database half cannot be undone. Per-table statements, their required ORDER, and the two-level audit trail: spec §11.4
- **CCPA (California, USA)** — applies when California residents are served:
  - "Do not sell my personal information" opt-out must be implementable
- **SOC 2 Type II** — platform must be SOC 2 Type II ready by Stage 3; controls tracked in `docs/registers/soc2-controls.md`; every new feature reviewed against SOC 2 trust criteria (Security, Availability, Confidentiality) before merge
- **Cross-border data transfer**: Thai-origin data must not leave the `ap-southeast-7` (Bangkok) region — `ap-southeast-1` (Singapore) is the DR/fallback — without explicit product owner approval and legal review; data residency rules per region defined in `docs/policies/data-residency-policy.md` (region decision: GLOB-001, spec §8.8 + §5.6)
- PII must never appear in logs, traces, or error messages — use `[REDACTED]` or masked values

### QM-6 — Performance Budgets

These are enforced targets. If an implementation does not meet them, do not ship — optimize or escalate.
Source: spec §31.6 (targets corrected to match spec SLO definitions; Web Vitals per §31.6 Frontend Web Vitals SLO + §30.9 Lighthouse CI gate)

| Metric                                       | Target                                         | Measurement                                                                                                                                                                                                                                                                   |
| -------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API p95 latency (read endpoints — GET)       | **< 300ms**                                    | Grafana / k6 load test                                                                                                                                                                                                                                                        |
| API p99 latency (read endpoints — GET)       | < 500ms                                        | Grafana / k6 load test                                                                                                                                                                                                                                                        |
| API p95 latency (write endpoints — POST/PUT) | **< 500ms**                                    | Grafana / k6 load test                                                                                                                                                                                                                                                        |
| API p99 latency (write endpoints — POST/PUT) | < 1s                                           | Grafana / k6 load test                                                                                                                                                                                                                                                        |
| Dashboard / analytics (ClickHouse)           | p95 < 1s                                       | Grafana / k6 load test                                                                                                                                                                                                                                                        |
| AI report generation                         | p95 < 5s                                       | Grafana / k6 load test                                                                                                                                                                                                                                                        |
| Web LCP — Largest Contentful Paint (p75)     | field ≤ 2.5s · lab ≤ 3.2s                      | web-vitals RUM p75 (spec §31.6) for the field number. The Lighthouse lab gate (§30.9) is a separate 3.2s: one throttled profile on a `ubuntu-latest` runner, calibrated to the highest median of five measured CI runs (2,913ms) + ~10%. It is a regression gate, not the SLO |
| Web INP — Interaction to Next Paint (p75)    | ≤ 200ms                                        | web-vitals RUM (§31.6); TBT lab proxy in Lighthouse CI (§30.9)                                                                                                                                                                                                                |
| Web CLS — Cumulative Layout Shift (p75)      | ≤ 0.1                                          | web-vitals RUM (§31.6); Lighthouse CI lab gate (§30.9)                                                                                                                                                                                                                        |
| Mobile app cold start (React Native)         | < 3s on mid-range Android                      | Manual test + Flipper                                                                                                                                                                                                                                                         |
| Offline sync completion (3G, 5MB data)       | < 30s                                          | Manual test on throttled network                                                                                                                                                                                                                                              |
| Background job (Temporal workflow)           | SLA defined per workflow type in workflow spec | Temporal dashboard                                                                                                                                                                                                                                                            |
| k6 sustained load (100 VU × 5 min)           | 0 errors, p95 within budget                    | Weekly scheduled — `scripts/loadtest/api-baseline.js` (staging); Phase 19 one-time gate                                                                                                                                                                                       |

The k6 load test runs on a **weekly schedule against staging** — not per-PR (source: spec §30.9). Results are advisory: alert Engineering Lead if p95 latency increases > 20% vs. previous week. Load tests do not block PR merge. Note: Phase 19 automated check #7 runs a one-time load test gate before production go-live.

### QM-7 — Rate Limiting

- All public API endpoints: 100 req/min per tenant by default; burst allowance: 150 req/min for ≤ 10 consecutive seconds
- Authentication endpoints: 10 req/min per IP (brute force protection); account lockout after 5 consecutive failures for 15 minutes
- AI/LLM endpoints: 20 req/min per tenant (cost protection)
- File upload endpoints (`/api/v*/files/*`): **20 req/min per user** (spec §05 §5.5)
- Rate limiting via **Kong Gateway** (open-source, Kubernetes-native) at the infrastructure level — C-01 RESOLVED (spec §4.8; ADR-010); Kong enforces rate limits before requests reach NestJS, reducing compute waste on blocked requests; Kong also handles JWT validation, tenant routing, and API analytics per spec §4.8; API monetization covers billing/quota metering only — Kong is now the gateway infrastructure
- **Application-layer (NestJS ThrottlerModule)** — defense-in-depth behind Kong/Cloudflare WAF;
  `@nestjs/throttler` registered globally in `backend/src/app.module.ts` with Redis shared storage
  (`ThrottlerStorageRedisService`); `APP_GUARD` → `ThrottlerGuard`; per-endpoint overrides via
  `@Throttle()` decorator; same limits (100 req/min general, 10 auth, 20 file upload);
  `ThrottlerException` → HTTP 429 + `Retry-After` header (source: spec §05 §5.5)
- Tenants that require higher limits → expose via `TenantQuotaService`
- Rate limit headers in every response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- `429` responses must include `Retry-After` header with seconds until reset

### QM-8 — Observability Standards

Every new service, module, or background job must include:

**Structured Logging (JSON):**

```json
{
  "timestamp": "ISO8601",
  "level": "info|warn|error",
  "trace_id": "opentelemetry-trace-id",
  "span_id": "opentelemetry-span-id",
  "tenant_id": "uuid",
  "user_id": "uuid",
  "service": "cos-backend",
  "module": "procurement",
  "event": "purchase-order.created",
  "durationMs": 45,
  "metadata": {}
}
```

- Never use `console.log` — always use the platform logger (`@cos/logger`)
- PII must never appear in log fields — use IDs only
- Log level discipline: DEBUG = dev only, INFO = business events, WARN = recoverable anomaly, ERROR = requires investigation
- **Log retention** — production logs stored in **Loki** (30 days hot on S3 object storage); 1 year cold; compliance archive retained 7 years (source: spec §31.2 + master Phase 15; CloudWatch Logs removed; Loki is the authoritative log store); retention schedule defined in `docs/policies/log-retention-policy.md`

**Distributed Tracing:**

- All HTTP requests must propagate `traceparent` header (W3C Trace Context)
- All Kafka events must carry `trace_id` and `span_id` in headers
- All cross-service calls must create child spans
- **Sampling strategy** — tail-based sampling in production: 1% baseline of all requests; 100% of requests with errors (`4xx`/`5xx` responses); 100% of all AI/LLM calls; 100% of all financial transactions (source: spec §31.5 — "head-based" corrected to "tail-based"; tail-based captures all error traces regardless of baseline sample rate); sampling config in `infrastructure/monitoring/otel-collector/otel-collector-config.yml` (sampling section). **No SDK may head-sample** (ADR-075): the Go (`libs/go/cosotel`), Python (`services/ai-gateway/otel.py`) and Node (`@cos/tracing`) SDKs export EVERY span and the Collector's `tail_sampling` processor decides — a head sampler drops spans before the Collector can apply the error/AI/financial policies, so those "100%" guarantees silently fail. The baseline is set by `OTEL_SAMPLING_PERCENTAGE` (PERCENT 0–100, not a ratio) injected into the Collector Deployment; per spec §31.5 development=100, staging=10, production=1. Collector 0.103.0 accepts only `${env:VAR}` — `${VAR:-default}` makes it refuse to start

**Metrics:**

- All Temporal workflows: emit `workflow.started`, `workflow.completed`, `workflow.failed` counters
- All AI/LLM calls: emit `llm.tokens_used`, `llm.latency_ms`, `llm.model` metrics
- All background jobs: emit `job.duration_ms`, `job.success`, `job.failure` metrics
- **SLO burn rate** — emit `slo.error_budget_remaining` and `slo.burn_rate_1h` per SLO defined in QM-14; alert when burn rate exceeds 2× sustained for 1 hour, or 10× for 5 minutes

**Alerts:**

- Every new service must have corresponding **Alertmanager** alert rules defined (Prometheus ecosystem — source: spec §31.7 + master Phase 15; M-11 — CloudWatch alarms removed; Alertmanager is the authoritative alerting system); alert YAML in `infrastructure/monitoring/`
- Minimum alerts: error rate > 1% for > 5 min, p99 latency > 3s for > 5 min, job failure rate > 5%
- **Synthetic monitoring** — health-check probes run every 60 seconds from ≥ 2 AWS regions against all public endpoints; implemented via OpenTelemetry Collector + Grafana Synthetic Monitoring (source: spec §31.10 + master Phase 15; probe definitions in `infrastructure/synthetics/`)
- **Notification escalation timeouts (spec §19.3)** — distinct from the §15.5 48h _approval_ escalation: safety incident unacknowledged 30 min → escalate to PM; budget alert unacknowledged 2 h → escalate to Executive; AI risk prediction unacknowledged 24 h → escalate to PM. **Critical safety notifications cannot be disabled or quieted** (override quiet hours / preferences — spec §19.6). Digest + quiet-hours delivery config: 00_master §Phase 20 (spec §19.3/§19.6)

### QM-9 — Backward Compatibility

- **Database migrations must be backward-compatible** — the old code must still work while the migration runs
  - Add columns as nullable first
  - Never rename a column in a single migration — add new + copy data + remove old (3-step)
  - Never change a column's type directly — create new column, migrate data, drop old
  - Never drop a column used by any deployed code
  - Every migration must have a verified rollback script committed in `prisma/rollbacks/` (NOT inside `prisma/migrations/` — Prisma `migrate deploy` treats every subdirectory of `migrations/` as a migration and fails P3015 on one lacking `migration.sql`)
  - Name migrations `<timestamp>_<action>_<subject>` (e.g. `add_phone_number_to_users`); **never prefix with `phaseN_`** — build-phase numbers are work-tracking metadata, not schema identity. The directory name is stored in `_prisma_migrations.migration_name`, so renaming an applied migration needs a matching `UPDATE` on every environment — pick the final name up front (see `docs/specifications/09-data-architecture.md`)
- **API backward compatibility** — old clients must not break during upgrades
  - Never remove a JSON field from a response — mark as deprecated with `@deprecated` in OpenAPI, keep for 6 months
  - Never change a field's type in the same version
- **Kafka schema backward compatibility** — Confluent Schema Registry is **required** infrastructure (not optional); all Kafka schemas must be registered before first producer use; compatibility mode: `BACKWARD_TRANSITIVE` (new schema can read messages from ALL previous versions — not just the immediately preceding one; source: spec §32.4) CI must validate schema compatibility against the registry before deployment
- **Mobile backward compatibility** — the backend must support the previous 2 major mobile app versions
- **Offline sync conflict resolution** — conflict strategy is entity-specific (authoritative spec: `context/00_master_construction_os.md` §Phase 6 Offline Conflict Resolution Strategy); agents must implement exactly the strategies below — never invent a different strategy without an ADR:
  - `site_reports`: **LAST_WRITE_WINS** on `client_submitted_at`; flag as `CONFLICT_FLAGGED` for `SITE_ENGINEER` manual review when server `modified_at` differs from client's `last_known_modified_at`
  - `issues`: **FIELD_LEVEL_MERGE** — `description` / `resolution_note`: last writer wins; `status`: server wins (authoritative); `photos`: union (additive, no conflict possible — this resolves WHICH photos are attached, not a photo's contents); flag `ConflictRecord` for `SITE_ENGINEER` review if `status` was changed server-side during client's offline edit
  - **photo annotation** (the ADR-056 stroke list on a photo): **CONFLICT_FLAGGED** — no auto-resolution. An annotation stays editable after sync, so two people can mark up the same photo offline; merging strokes would blend two readings of one defect and last-write-wins would discard one. Server detects concurrent modification on sync → `CONFLICT_FLAGGED` + notify `SITE_ENGINEER`; never auto-merge or overwrite (spec §17.5; PO decision 2026-07-17)
  - `safety_checklists`: **SERVER_WINS** — reject client version unconditionally; return server version with `CONFLICT_REJECTED` status; safety data must be authoritative, no exceptions
  - **Financial entities** (POs, vendor invoices / AR / AP, payments, budget-line mutations): **online-required — NOT offline-writable** (spec §17.4; dual-write risk); BOQ line items are read-only cache (§17.4). Neither is offline-mutated, so neither reaches sync conflict resolution — the sync push endpoint (`/sync/push`, `/sync/resolve`) has no financial `entity_type` case and rejects any such write (`BadRequestException`); financial data is never auto-merged, auto-overwritten, or silently discarded. (§17.5's conflict table has no financial row for this reason.)
  - Sync wire protocol (server-side endpoint): `POST /api/v1/sync/resolve` accepts `{ entity_type, entity_id, client_version, payload, client_submitted_at }`; returns `{ resolved_payload, conflict_status, server_version }` where `conflict_status ∈ { ACCEPTED | CONFLICT_FLAGGED | CONFLICT_REJECTED }`
  - `ConflictHandler` class (generated in Phase 10) must implement all three strategies; unit-tested per QM-1 (Phase 18 mandatory coverage list)
  - **Offline write scope (spec §17.4)** — agents must NOT allow offline writes outside this list: offline read/write = tasks, site reports, inspections, workforce attendance, material consumption, safety checklists + incidents, equipment usage; **online-required (read-cache only)** = POs, vendor invoices / AR / receipts / payments, budget-line mutations, vendor master, permissions/roles; read-only stale-while-revalidate cache = project master, BOQ lines, room/floor reference, drawings, vendor directory
  - **Sync priority order on reconnect (spec §17.6)** — flush in this exact order: 1 safety incidents → 2 attendance → 3 inspections → 4 task progress → 5 site reports → 6 material → 7 equipment usage → 8 photo/media (deferred last)
  - **Data size limits (spec §17.7)** — enforce: local DB ≤ 500 MB · drawing cache ≤ 200 MB (LRU eviction) · photo queue ≤ 100 (warn user at 80) · sync batch ≤ 500 records/cycle; server-side `platform.sync_tombstones` backs `GET /sync/delta` `deleted[]` (schema in 00_master §Phase 10, spec §11.1)

### QM-10 — Error Taxonomy

All errors returned by the API must use this structure:

```json
{
  "error": {
    "code": "COS-{DOMAIN}-{NUMBER}",
    "message": "Human-readable message (English)",
    "messageKey": "i18n.key.for.message",
    "details": {},
    "traceId": "opentelemetry-trace-id",
    "timestamp": "ISO8601"
  }
}
```

Error code registry in `docs/api/error-codes.md`. Format: `COS-AUTH-001`, `COS-PROC-042`, etc.

HTTP status code rules:

- `400` — client input validation error (include field-level details)
- `401` — unauthenticated
- `403` — authenticated but unauthorized (include required permission)
- `404` — resource not found
- `409` — conflict (optimistic lock, duplicate)
- `422` — business rule violation
- `429` — rate limit exceeded (include `Retry-After` header)
- `500` — server error (never expose stack traces to client)
- `503` — service temporarily unavailable (maintenance, circuit breaker open)

Never return `200` with an error body. Never return `500` for client errors.

### QM-11 — Documentation Standards

- Every new module must have a `README.md` with: purpose, public API, dependencies, configuration, usage example
- Every architectural decision must be recorded in `docs/architecture/adr/` as an ADR (Architecture Decision Record) using the format: `docs/architecture/adr/NNN-title.md` (template in `docs/architecture/adr/000-template.md`)
- Every breaking change to a public API or Kafka schema must update `CHANGELOG.md` with a `BREAKING CHANGE:` entry
- OpenAPI spec per service (`docs/api/{service}.openapi.yaml`, e.g. `docs/api/auth.openapi.yaml`) must be auto-generated and kept in sync with code — CI fails if spec is stale
- Every runbook must be tested (executed end-to-end in staging) within 30 days before its corresponding Stage transition

### QM-12 — Disaster Recovery

These targets are defined per environment:

| Target                         | Staging      | Production                                          |
| ------------------------------ | ------------ | --------------------------------------------------- |
| RTO (Recovery Time Objective)  | 4 hours      | **30 minutes**                                      |
| RPO (Recovery Point Objective) | 24 hours     | 15 minutes                                          |
| Database backup frequency      | Daily        | Every 15 minutes (WAL streaming)                    |
| Multi-AZ failover              | Optional     | Required                                            |
| Multi-region failover          | Not required | Required at Stage 4 (multi-region Terraform module) |

DR runbooks must exist for: database failure, Kafka broker failure, complete region failure, KMS key compromise.
DR runbooks live in `docs/runbooks/disaster-recovery/`.
DR drills must be executed before every Stage transition; drill results recorded in `docs/runbooks/disaster-recovery/drill-log.md`.

### QM-13 — Multi-Region Architecture

> Stage 1–3: architect for multi-region, do not implement prematurely. Stage 4+: required.

**Stage 1–3 (design constraints — enforce now):**

- No region-specific strings or ARNs hardcoded in business logic — all via environment variables
- No assumption of single-region in database schema design or API contracts
- UTC storage and user-locale display enforced globally (QM-3) — no timezone assumptions

**Stage 4+ (required implementation — multi-region Terraform module):**

- Active-passive multi-region: primary `ap-southeast-7` (Bangkok, Thailand); DR region `ap-southeast-1` (Singapore) defined via multi-region Terraform module before Stage 4 begins (GLOB-001, spec §8.8)
- Global traffic routing via Route 53 latency-based routing or CloudFront
- Data residency enforced per QM-5: Thai-origin data remains in `ap-southeast-7` (Bangkok) unless product owner approves otherwise with legal sign-off
- Cross-region replication strategy (read replicas vs. active-active) decided in an ADR before implementation begins
- Each region must independently pass Phase 19 automated checks before receiving production traffic

### QM-14 — SLI / SLO / Error Budget

SLOs are non-negotiable production targets. Error budget is consumed when an SLO is violated.
Source: spec §31.6

**API Availability SLO (three tiers — source: spec §31.6):**

| Tier                     | Target | 30-day Error Budget |
| ------------------------ | ------ | ------------------- |
| Shared SaaS — SMB        | 99.5%  | 3.6 hours/month     |
| Shared SaaS — Mid-market | 99.9%  | 43.8 min/month      |
| Dedicated / Enterprise   | 99.95% | 21.9 min/month      |

**Latency and Other SLOs:**

| SLO                                    | Target                                                                                | Window          | 30-day Error Budget |
| -------------------------------------- | ------------------------------------------------------------------------------------- | --------------- | ------------------- |
| 5xx error rate                         | < 0.1% of requests                                                                    | Rolling 30 days | 0.1% of requests    |
| p95 read latency (GET)                 | **< 300ms**                                                                           | Rolling 30 days | < 0.1% may exceed   |
| p95 write latency (POST/PUT)           | **< 500ms**                                                                           | Rolling 30 days | < 0.1% may exceed   |
| p95 dashboard/analytics (ClickHouse)   | < 1s                                                                                  | Rolling 30 days | < 0.1% may exceed   |
| p95 AI report generation               | < 5s                                                                                  | Rolling 30 days | < 1% may exceed     |
| p95 notification delivery (in-app SSE) | < 500ms                                                                               | Rolling 30 days | < 0.1% may exceed   |
| Mobile offline sync                    | < 30s for 5MB                                                                         | Monthly sample  | < 1% failures       |
| Kafka consumer lag                     | < 1,000 messages per partition (normal); alert > 5,000 for > 2 min; critical > 50,000 | Continuous      | —                   |

**Error budget policy:**

- Budget remaining < 50% → freeze non-critical feature work; prioritize reliability
- Budget remaining < 10% → freeze ALL feature work; mandatory incident review with product owner
- SLO dashboards tracked in Grafana; dashboard IDs registered in `docs/registers/dashboard-registry.md`
- SLO burn rate alerts wired via QM-8 metrics
- Monthly SLO review required; notes in `docs/evidence/slo-monthly-reviews/YYYY-MM.md`

### QM-15 — Feature Flags & Progressive Delivery

All user-facing features and high-risk changes must ship behind a feature flag.

- Feature flag system: **Unleash (open-source, self-hosted)** — single provider for cloud AND on-premise
  (product-owner decision 2026-07-04; ADR-049; replaces AWS AppConfig / LaunchDarkly plan)
- Delivery: **server-evaluated** — backend `FeatureFlagService` (`unleash-client`, 15s poll) evaluates per
  user/tenant; clients read `GET /api/v1/flags` and never hold flag-provider credentials (ADR-049)
- Local dev / degraded mode: `UNLEASH_URL` unset → fallback to registry defaults in
  `backend/src/shared/feature-flags/feature-flag.service.ts` (retrofit kill-switches fail-open);
  no Unleash server required for local dev
- Retrofit scope (product-owner decision 2026-07-04): critical surfaces only — AI/LLM endpoints, auth flows,
  financial mutations; other existing features are NOT retrofitted; flag registry in `docs/registers/feature-flag-registry.md`
- Flag naming convention: `{stage}.{domain}.{feature}` (e.g., `s1.procurement.bulk-upload`)
- **Mandatory flag scenarios:**
  - Any new UI screen or workflow step
  - Any new AI/LLM endpoint
  - Any database migration that modifies existing data (data backfill, column drop)
  - Any change to authentication or authorization logic
  - Any Kafka schema change
- **Progressive rollout order:** 1% of tenants → 10% → 50% → 100%; minimum 24 hours at each step unless a rollback is triggered
- Feature flags must be removed from code within 30 days of reaching 100% rollout; stale flags tracked in `docs/registers/feature-flag-cleanup-backlog.md`
- Emergency kill switch: every flag must be togglable to OFF within 60 seconds without a deployment

### QM-16 — Deployment Safety

Every production deployment must follow this protocol:

- **Zero-downtime** — required for all production changes; use Kubernetes rolling update by default
- **Blue-green deployment** — required for: major version releases, authentication system changes, any database migration that cannot be made backward-compatible in a single step
- **Canary deployment** — required for: API endpoint changes, new background job types, AI model version upgrades; minimum canary duration 30 minutes at 5% traffic before full rollout
- **Automated rollback** — if error rate exceeds 1% within 10 minutes of deployment → the rollout is aborted and traffic shifts back to the stable ReplicaSet automatically. Health gate: `infrastructure/kubernetes/argo-rollouts/analysis-template-error-rate.yaml` (`AnalysisTemplate/error-rate` + `AnalysisTemplate/p99-latency`, PromQL mirroring the `APIHighErrorRate` / `APIHighLatency` rules). **PARTIALLY IMPLEMENTED as of 2026-08-07: the templates exist; the Argo Rollouts controller is not installed and the workloads are still `Deployment`s, so nothing evaluates them yet** — see `infrastructure/kubernetes/argo-rollouts/README.md` for the activation steps. This line previously named `.github/workflows/deploy.yml`, which has never existed and could not host the gate: ADR-012 forbids CI from deploying and Phase 19 greps the workflows for `kubectl apply`/`helm upgrade` expecting zero hits
- **Deployment windows** — production deployments only during defined low-traffic windows; windows in `docs/runbooks/deployment-windows.md`; emergency hotfixes exempt with product owner approval on record
- Deployment runbook required for every major release in `docs/runbooks/releases/`

### QM-17 — Incident Management

- **Incident severity:**
  - P0: complete service outage OR data loss OR security breach — response within 15 minutes
  - P1: partial outage affecting > 10% of tenants OR SLO error budget burn > 10× — response within 30 minutes
  - P2: degraded performance, non-critical feature failure, SLO burn > 2× — response within 2 hours
  - P3: minor bug, cosmetic issue — response within next business day
- **On-call rotation** — defined in `docs/runbooks/on-call-rotation.md`; on-call engineer must have live access to Grafana, Alertmanager/Prometheus, Temporal console, and Kubernetes before going on-call
- **Incident response procedure:**
  1. Declare incident (open incident channel)
  2. Assign Incident Commander (IC) — first responder owns coordination until reassigned
  3. Mitigate (stop the bleeding) before investigating root cause
  4. Communicate to affected tenants within 30 minutes of P0/P1 declaration via status page
  5. Resolve and write blameless post-mortem within 5 business days for P0/P1
- **Status page** — required before Stage 2 go-live; auto-updates from Alertmanager/Prometheus alerts; managed via Atlassian Statuspage or equivalent
- **PagerDuty** (or equivalent) — required before Stage 2 go-live; escalation policy defined and tested in staging
- **Post-mortem** — blameless; must include: root cause, timeline, impact assessment, action items with owners and due dates; template in `docs/runbooks/postmortem-template.md`

### QM-18 — Connection Pool Management

Isolation model:

- **STARTER/PROFESSIONAL** — Shared DB + tenant_id + RLS (spec §7.7). `app.current_tenant_id` set at
  request start; RLS enforces tenant isolation at DB level.
- **ENTERPRISE** — Dedicated DB per tenant. `platform.tenants.dedicated_db_url` non-NULL routes all
  domain queries to the tenant's own PostgreSQL instance (spec §7.1).

Direct application-to-PostgreSQL connections do not scale: each pod holds a connection pool, and with
many tenants and replicas, PostgreSQL `max_connections` is exhausted. A connection pooler is mandatory.

- **PgBouncer is the required connection pooler** for all environments (staging + production); deployed as a Kubernetes `Deployment` (not a sidecar) with a `PodDisruptionBudget` of `minAvailable: 1`; configuration committed to `infrastructure/kubernetes/pgbouncer/` (Phase 17)
- **Transaction mode is required** — `SET LOCAL app.current_tenant_id` is transaction-scoped and reverts on `COMMIT`/`ROLLBACK`, making transaction pooling safe; do NOT use session mode or statement mode
- **Session mode is prohibited** — incompatible with horizontal pod autoscaling (connections are pinned to a pod)
- **Statement mode is prohibited** — incompatible with multi-statement transactions
- Application layer must connect to PgBouncer address — never directly to PostgreSQL port `5432`; integration test must assert connection string resolves to PgBouncer, not the database host
- **Baseline configuration** (tune before Stage 2 go-live based on Grafana observations):
  - `default_pool_size = 25` per database
  - `max_client_conn = 1000`
  - `server_idle_timeout = 600` seconds
- **Grafana must expose** `pgbouncer_pools_client_active`, `pgbouncer_pools_server_active`, `pgbouncer_pools_client_waiting`, `pgbouncer_databases_pool_size`; alert policy: fire P2 incident when `client_waiting > 10` sustained for > 30 seconds
- **Tenant scale limit documentation** — before Stage 2 go-live, load-test the PgBouncer + PostgreSQL stack and record the maximum concurrent tenants at acceptable latency in `docs/architecture/tenant-scale-limits.md`; this threshold determines when DatabaseSharding evaluation must begin
- Local development (Docker Compose): PgBouncer container required in `docker-compose.yml`; dev mode Vault and PgBouncer must start together with the application

**Graceful shutdown — close every long-lived handle (ADR-034):**

- Every provider that owns a long-lived client (Redis, PrismaClient, ClickHouse, or any socket/HTTP
  client) MUST close it on shutdown: implement `OnModuleDestroy` and call `redis.quit()` /
  `prisma.$disconnect()` / `client.close()`. Reference implementations: `finance/exchange-rate.service.ts`,
  `identity/otp/otp.service.ts`, `identity/mfa/mfa.service.ts`.
- A client created inside a module factory (no provider owns it) is closed from the **module class's**
  `OnModuleDestroy` (Nest invokes lifecycle hooks on module classes) — e.g. `AnalyticsModule` (cache Redis +
  ClickHouse). For `@nestjs/throttler`, pass the **Redis URL** (not a pre-built `new Redis(...)`) to
  `ThrottlerStorageRedisService` so the library owns and closes the client (`disconnectRequired=true`).
- Resources started OUTSIDE Nest DI (the OpenTelemetry SDK + Prometheus exporter in `main.ts`) are closed
  via a provider implementing `OnApplicationShutdown` (`shared/tracing-shutdown.service.ts` → `shutdownTracing()`).
- `main.ts` MUST call `app.enableShutdownHooks()` before `app.listen()` so `SIGTERM`/`SIGINT` (K8s rolling
  deploy) run the hooks above; without it they only fire on an explicit `app.close()` (tests).
- Integration config MUST NOT use `forceExit` — with handles closed Jest exits on its own; a future hang then
  signals a real new leak (diagnose with `--detectOpenHandles`, never mask with `forceExit`).
- Every new `onModuleDestroy`/`onApplicationShutdown` needs a unit test (invoke the hook, assert
  `quit`/`$disconnect`/`close`/`shutdownTracing` called) to keep QM-1 100% line+branch coverage.

---

## PHASE 19 VERIFICATION PROTOCOL

> ⚠️ Applies to Stage 1 BUILD only. Skip if current stage ≠ BUILD.

Triggered in two ways — either is valid:

- **Auto:** agent completes Phase 18 implementation → run verification immediately
- **Manual:** product owner says "verify production readiness" or "รัน production readiness check"

### Step 0 — CI/CD pre-check

Before running local scripts, confirm CI is green:

```bash
gh run list --branch main --limit 5 --json status,conclusion,name
```

If the latest CI run is FAILED → do not proceed. Fix CI first.

### Step 1 — Run automated checks (30 items via script + 9 global-scale additions = 39 total)

```bash
./scripts/readiness/verify-production-readiness.sh --env staging
```

Report results to product owner:

- ✅ PASSED: X items
- ❌ FAILED: list each failed item with error detail
- ⏭ SKIPPED: list items skipped due to missing tool/config

If any FAILED → do not proceed to Step 2. Fix failed items first, then re-run.

**Additional automated checks (9 global-scale additions — all must pass before Step 2):**

```bash
# 1. Test coverage gate (100% lines + 100% branches — source: spec §30.3)
npx jest --coverage --coverageThreshold='{"global":{"lines":100,"branches":100}}'

# 2. Node dependency vulnerability check
npm audit --audit-level=high

# 3. Python dependency vulnerability check
pip-audit --requirement ai/requirements.txt

# 4. SAST + code quality scan (ADR-011 — replaced SonarQube)
#    All three already run in CI on every PR; this is re-verification, not a separate gate.
semgrep --config .semgrep/ --error          # project policy rules (blocking)
pnpm exec jscpd backend/src packages apps/web/src services   # duplication ratchet (.jscpd.json)
gh api repos/:owner/:repo/code-scanning/alerts --jq '[.[]|select(.state=="open")]|length'
# Pass = semgrep exit 0, jscpd exit 0, and 0 open CodeQL/Semgrep code-scanning alerts

# 5. OpenAPI spec freshness
./scripts/readiness/check-openapi-freshness.sh

# 6. i18n completeness (no untranslated keys in th.json vs en.json)
./scripts/readiness/check-i18n-completeness.sh

# 7. Load test gate (100 VU × 5 min — must pass before manual checks begin)
k6 run --vus 100 --duration 300s ./scripts/loadtest/api-baseline.js

# 8. Security headers audit
./scripts/readiness/check-security-headers.sh --env staging

# 9. Kafka schema registry validation
./scripts/readiness/check-schema-registry.sh
```

### Step 2 — Run manual checks interactively (14 items via script + 8 global-scale additions = 22 total)

```bash
REVIEWER="<product owner name>" ./scripts/readiness/run-all-checks.sh
```

Walk product owner through each check one by one.
Wait for y/n/s answer before proceeding to next check.
Save audit log to `cos-audit/audit-<timestamp>.log`

**Additional manual checks (8 global-scale additions):**

- [ ] PDPA data flow reviewed and documented in `docs/registers/data-flow-map.md`
- [ ] Rate limiting verified via load test (k6): no tenant can exceed 100 req/min sustained
- [ ] DR runbook executed successfully in staging (RTO achieved < 30 minutes)
- [ ] API backward compatibility: old mobile app version (N-1) tested against new backend
- [ ] Feature flags verified: all mandatory flags present and togglable to OFF in < 60 seconds
- [ ] SLO dashboard live in Grafana with correct thresholds per QM-14
- [ ] On-call rotation and PagerDuty escalation policy configured and tested (paging drill completed)
- [ ] Secrets rotation schedule defined in `docs/policies/secrets-rotation-policy.md`; first rotation executed and verified in staging

### Step 3 — Report final status

```text
SECTION A — PRE-LAUNCH CHECKLIST
  Auto checks:   X/39 passed  (30 original script + 9 global-scale additions)
  Manual checks: X/22 passed  (14 original script + 8 global-scale additions)

SECTION B — QUALITY MANDATES GATE
  QM-1  Test Coverage:             PASS / FAIL (coverage %)
  QM-2  API Versioning:            PASS / FAIL
  QM-3  i18n Completeness:         PASS / FAIL
  QM-4  Security SAST + Headers:   PASS / FAIL
  QM-5  PDPA/GDPR Compliance:      PASS / FAIL
  QM-6  Performance Budget:        PASS / FAIL (p95 read: _ms, write: _ms)
  QM-7  Rate Limiting:             PASS / FAIL
  QM-8  Observability:             PASS / FAIL
  QM-9  Backward Compat:           PASS / FAIL
  QM-10 Error Taxonomy:            PASS / FAIL
  QM-11 Documentation:             PASS / FAIL
  QM-12 DR Drill:                  PASS / FAIL (RTO achieved: ___ min)
  QM-13 Multi-Region Design:       PASS / FAIL (no hardcoded ARNs; UTC storage; no region assumptions in schema or API)
  QM-14 SLO Dashboard:             PASS / FAIL
  QM-15 Feature Flags:             PASS / FAIL
  QM-16 Deployment Runbook:        PASS / FAIL
  QM-17 Incident Management:       PASS / FAIL
  QM-18 Connection Pool (PgBouncer): PASS / FAIL (client_waiting alert tested)

SECTION C — PRODUCTION ADOPTION GATES
  [ ] 8 gates to verify after go-live (tracked in Grafana dashboard)
```

If all checks pass → confirm to product owner:

> "Phase 19 production readiness verified ✅
> Proceed to go-live → load context/03_operationalize_execution.md (stage 2).
> Track 8 adoption gates in Grafana for ≥ 14 consecutive days.
> Also track all SLO targets per QM-14 for ≥ 14 consecutive days.
> When all 8 adoption gates AND all SLO targets pass → load context/04_post_launch_enterprise_evolution.md (stage 3)."

If any check fails → list what needs to be fixed before re-running. Do not advance stage.

---

## GLOBAL EXECUTION RULES

### Always

- Follow phase execution order from `context/00_master_construction_os.md` PHASE DEPENDENCY GRAPH
- Use exact technology versions specified in master document
- All monetary calculations use `decimal.js` (TypeScript) or Python `decimal` module — never `float`
- All Kafka events must use typed contracts from `@cos/shared`
- Check `docs/specifications/` (§13.3-13.5, §22.6, §05-security-compliance §5.3.1) before implementing any EP — all EP decisions are documented there;
  stub implementation behaviour is defined in `32-implementation-specifications` §32.9:
  - **Type A** (CRM, BIM, ERP, all stubs not listed as Type B) — log WARN + throw typed exception
    (fail-fast; source: spec §32.9)
  - **Type B** (IoT only, explicitly stated in §32.9) — log WARN + return safe defaults
    (service stays operational in degraded state; source: spec §32.9)
- Version every HTTP API endpoint from `/api/v1/` on the first commit (QM-2; NestJS global prefix `api/v1` — source: `backend/src/main.ts`)
- Route all user-facing strings through i18n keys — never hardcode (QM-3)
- Tag all PII fields with `@pdpa(category: "...")` comment in Prisma schema (QM-5)
- Include `traceId` in every log entry and every error response (QM-8, QM-10)
- Propagate `traceparent` header across all HTTP and Kafka calls (QM-8)
- Write or update `docs/api/error-codes.md` when adding new error codes (QM-10)
- Create an ADR in `docs/architecture/adr/` for every architectural decision (QM-11)
- Validate database migrations for backward compatibility before applying (QM-9)
- Commit a rollback script for every database migration in `prisma/rollbacks/` (QM-9) — kept OUTSIDE `prisma/migrations/` so `prisma migrate deploy` does not treat it as a migration (P3015). Name it `<migration-dir-name>.rollback.sql` exactly: `scripts/ci/check-migration-rollbacks.mjs` pairs the two by name in the CI lint job (spec §9.7.1, §30.12), and a file that exists under a different name does not count
- Register every new Kafka schema in the Schema Registry before the first producer deployment (QM-9); subject = canonical event type (**RecordNameStrategy**, one schema per event shared across tenants — never `{topic_name}-value`; topics carry a `{tenant_id}.` prefix) (spec §32.4)
- Provision Kafka topics **explicitly** — producers use `allowAutoTopicCreation: false` and `auto.create.topics.enable` is false on every real broker, so Kafka never creates a topic implicitly. A tenant's topic (`{tenant_id}.{domain}.{entity}.{action}.v{N}`) is created by `KafkaProducer` **on the first publish that needs it**, and its single DLQ (`{tenant_id}.dlq` — one per tenant, not per domain) on the first failure. Do **not** provision the whole catalogue at onboarding: that made topic count scale with customer headcount (46 topics / 414 replicas per tenant) instead of usage. Exception: enterprise tenants get a dedicated namespace/cluster and are still provisioned eagerly (Phase 25 workflow). Platform events use the shared `platform.events` topic. Shared consumers subscribe via per-tenant topic RegExp under a `{service}.shared` group and validate the `tenant_id` header before processing (spec §7.3, §15.6)
- Gate every user-facing feature and high-risk change behind a feature flag before production (QM-15)
- Include all required security headers in every HTTP response (QM-4)
- Use class-validator (TypeScript/NestJS) or Pydantic (Python) for all API input validation — never hand-written `if` checks alone (QM-4)
- Connect application to **PgBouncer** (transaction mode), never directly to PostgreSQL port 5432 (QM-18)
- Close every long-lived handle (Redis/Prisma/ClickHouse/HTTP client, OTel SDK) on shutdown via
  `OnModuleDestroy`/`OnApplicationShutdown`; call `app.enableShutdownHooks()` in `main.ts`; never use
  `forceExit` to mask a leak (QM-18; ADR-034)
- Follow the entity-specific conflict resolution strategy from Phase 6 when implementing `ConflictHandler` (QM-9) — never invent a new strategy without an ADR
- Inject runtime secrets via **AWS Secrets Manager** (cloud/AWS EKS) or **HashiCorp Vault** (on-premise/hybrid) per spec §5.2 and ADR-013; store Kubernetes Secret objects in git only as **SealedSecret** via kubeseal (QM-4)
- Emit a Kafka event for every workflow state transition — all transitions in RFQ and PO state machines must produce a typed event via `@cos/shared` (master §9; spec §32.6)
- Concrete guards in `backend/src/shared/guards/` — `@cos/rbac` for decorators/metadata keys only (spec §06 §6.9)
- Use **EMQX** (open-source edition, Apache-2.0) self-hosted on EKS as IoT MQTT broker (Phase 21+);
  pipeline: IoT device → EMQX → **IoT Ingestion Worker** → Kafka (MSK) → TimescaleDB; the custom
  worker forwards telemetry to Kafka — EMQX's native/Enterprise Kafka data-bridge (paid) is NOT
  used; RESOLVED (source: spec §13.5, `33-digital-twin-iot` §33.8).
  TimescaleDB is a PostgreSQL extension co-located on the primary instance through
  Stages 1–3, split to a dedicated instance only on the volume trigger in ADR-032
- Use **scikit-learn + XGBoost** for all Phase 23 ML models (DelayForecastModel, SafetyVisionModel,
  GraphMLModel, RiskClassifier, **DeviceTrustModel**); RESOLVED (source: spec §22-ai-architecture §22.6).
  DeviceTrustModel (added 2026-08-04, ADR-081) is the one model with **no minimum-count training
  threshold** — it is promoted only by beating the rule-based baseline on a held-out set (PR-AUC),
  because its positive class is rare by design; until then a deterministic rule-based scorer serves
  and the surface must not be described as AI-derived. The score is advisory — never revokes a device
  or blocks a login (§22.3)
- Use **MLflow** (experiment tracking + model registry) + **Evidently AI** (open-source, self-hosted —
  model/output evaluation + drift) for Phase 23+ MLOps; no external SaaS/API key. W&B removed —
  RESOLVED (source: spec §22-ai-architecture §22.6; ADR-038)

**ROOT CAUSE PREVENTION RULES — applied on every implementation task (Rules 26–39):**

- Rule 26 — Before adding `import { X } from 'pkg'` to any source file, verify 'pkg' is in that package's own `package.json` (not root or another package). Add it if missing. (prevents missing runtime deps)
- Rule 27 — When adding any new script to any `package.json`, add the corresponding task to root `turbo.json` in the same commit. (prevents missing turbo tasks)
- Rule 28 — After changing anything that moves dependency resolution — `package.json`
  `dependencies`/`devDependencies`/`peerDependencies`/`optionalDependencies`/`resolutions`/`pnpm`, or
  `overrides:` in `pnpm-workspace.yaml` — run `pnpm install` and commit `pnpm-lock.yaml` in the same
  commit; CI `--frozen-lockfile` fails without it. NOT every `package.json` edit: `scripts`,
  `engines` and `packageManager` produce no lockfile diff, so there is nothing to commit (narrowed
  2026-08-08; full rationale in 00_master Rule 28). **Which lockfile: the nearest one ABOVE that
  `package.json`** — `apps/mobile` is its own workspace, so a mobile dependency needs
  `cd apps/mobile && pnpm install` and `apps/mobile/pnpm-lock.yaml`; everything else uses the root
  one. Enforced for every author by `scripts/ci/check-lockfile-staged.sh` in `.husky/pre-commit`
  (it names the expected lockfile) — the `.claude/hooks/` version only sees agent edits.
  (prevents CI lockfile failure)
- Rule 29 — Before writing `(see ADR-NNN)` in any spec or code comment, verify `docs/architecture/adr/NNN-*.md` exists. Create the ADR first if it does not. (prevents dangling ADR references)
- Rule 30 — For async functions using `setTimeout` internally (retry, poller, backoff), use `jest.useFakeTimers()` in `beforeEach`, `jest.useRealTimers()` in `afterEach`, and `await jest.runAllTimersAsync()` — NOT `jest.runAllTimers()`. (prevents test hangs on multi-step retry chains)
- Rule 31 — "Generate: complete directory structure with placeholder README per service" means EVERY directory in the spec, including all `services/` and `packages/@cos/*`. "Tooling: X" means fully initialized (e.g., Husky = `.husky/pre-commit` exists, not just declared in `package.json`). tsconfig exceptions must be documented inline. (prevents incomplete scope)
- Rule 32 — `jest.config.js` is the single source of truth per package. Never add a `"jest"` key to `package.json` when `jest.config.js` exists in the same package. (prevents duplicate/conflicting jest config)
- Rule 33 — Use `import type { X } from 'pkg'` when X is only used for TypeScript type annotations (not runtime). Prevents Metro/webpack from bundling Node.js-only packages into mobile/browser builds. (prevents mobile bundle failures)
- Rule 34 — `@cos/shared` is imported by ALL platforms (mobile, Web/PWA, Node.js). Never add a runtime import of any Node.js-only package (PrismaClient, native addons, server frameworks). Use `import type` for type-only references. (prevents mobile bundle failures)
- Rule 35 — Every `@cos/*` package with executable logic (functions/methods with a body) must have: `jest.config.js`, `test:cov` script, `jest`+`ts-jest` in devDeps, unit tests, and CI coverage. Packages with only types/interfaces are exempt. (prevents untested logic in shared packages)
- Rule 36 — **Exhaustive verification before claiming completion** — Before reporting any Phase, task, or bug-fix set as "complete" or "all done":
  (a) Read the relevant spec section (Generate / Constraints / Exit Criteria) **line by line**
  (b) For **each item**: run `ls`/`grep`/`cat` to verify it exists on disk — show the actual command output
  (c) Only then summarize — any item without ✅ filesystem evidence = NOT complete
  Never claim "complete" based on memory, partial checks, or only verifying known issues.
  The distinction that must be maintained: "I verified X" ≠ "everything is complete".
  (prevents overstating completion confidence — root cause of recurring missed deliverables)
- Rule 37 — **After modifying any file in `docs/specifications/`**, immediately grep `context.md` and `context/00_master_construction_os.md` for the changed section number, technology name, or keyword:

  ```bash
  grep -n "<changed-keyword>" context.md context/00_master_construction_os.md
  ```

  If grep finds a match → read that section, check consistency with the spec change, update in the same commit.
  If grep finds no match → no context update needed, proceed.
  Keywords to grep: section number (e.g. `§5.5`), technology name (e.g. `Cloudflare`), or the specific concept changed (e.g. `tenant_id`, `WAF`).
  (prevents spec/context drift — root cause of WAF on-premise gap and JWT claim name inconsistency; agent had to be explicitly reminded both times)

- Rule 38 — **Pre-implementation spec extraction with mandatory product owner approval**
  BEFORE writing the first line of code for any Phase, task, or multi-step deliverable:
  (a) Read the Generate / Deliverables / Constraints section of the spec **line by line**
  (b) Create one `TodoWrite` task per line item — **before writing any code**;
  tag each item as either `READY` or `NEEDS_ESCALATION: <reason>`
  (c) **Present the full list to the product owner** — do NOT begin implementing until
  the product owner has reviewed and explicitly approved the list
  (d) For any item tagged `NEEDS_ESCALATION` — **wait for product owner decision**;
  do not implement a stub, do not skip, do not proceed unilaterally
  (e) Mark each task complete **only** when it has filesystem evidence
  (`ls`/`grep`/`cat` output); Rule 36 is the per-item gate
  Never begin implementation with a mental model of "what seems needed" —
  the spec Generate list is the complete and exhaustive obligation list.
  The product owner approval in step (c) is the human gate that closes the reasoning gap
  that automation cannot close.
- Rule 39 — **Close every long-lived handle on shutdown** (prevents leaked Redis/Prisma/ClickHouse/OTel
  handles → Jest integration runner hangs after specs pass, and ungraceful production shutdown on SIGTERM).
  Authoritative decision: ADR-034; full mandate in QM-18 (Graceful shutdown).
  (a) Provider that owns a client → `OnModuleDestroy` → `redis.quit()`/`prisma.$disconnect()`/`client.close()`
  (b) Module-factory client (no provider owns it) → close from the **module class's** `OnModuleDestroy`; for
  `@nestjs/throttler` pass the Redis URL (not a pre-built `new Redis`) so the library closes it
  (c) Resources outside Nest DI (OTel SDK in `main.ts`) → provider with `OnApplicationShutdown` → `shutdownTracing()`
  (d) `main.ts` MUST call `app.enableShutdownHooks()` before `app.listen()`; never use `forceExit` to mask a leak
  (e) Every new `onModuleDestroy`/`onApplicationShutdown` needs a unit test → keep QM-1 100% line+branch coverage
- Rule 40 — **Every surface that waits for data renders its wait through `<LoadingState />`** (prevents a
  specified component drifting out of use while screens hand-roll their own indicators). Authoritative:
  spec §32.7 "Loading State"; ADR-055. Applies the moment a screen, region, list, card or button gains an
  async state — fetch, submit, sync flush, AI job:
  (a) Pick the variant by the SHAPE of what it stands in for: `widget` card/tile/dashboard · `list` stacked
  list or feed (mobile) · `table` data-table rows (web) · `ai` an AI job, not a plain fetch · `micro` inline
  or inside a button
  (b) **Never hand-roll one** — no `ActivityIndicator`, no self-made skeleton `View`/`div`, **no line of text
  standing in for a loading state, no placeholder glyph (`…`)**. The last two have no signature a script can
  match, so they are caught in review or not at all — that is why this rule exists in prose
  (c) Mobile: wrap a region that reveals content in `<LoadingBoundary>`, not a ternary; a determinate loader
  runs to 100 and holds one fill before the crossfade
  (d) `label` is caller-supplied, already-translated copy (QM-3) — the component holds no key and no literal
  (e) `progress` only when a real percentage exists; omitted = indeterminate = **no percentage shown**, never
  a fabricated one. **A percentage needs ≥ 2 load steps** — one request can only report 0% then 100%, which
  reads as stuck (same rule that keeps a `micro` ring in a submit button wordless). Use
  `loadProgress(done, total)` (returns `null` below two steps) and count the steps that settle **while the
  loader is on screen**, not the APIs the file imports
  (g) Skeletons animate **per element**, never as one band across the card — the mockup puts
  `.skeleton-pulse` on each bar and plate separately
  (h) The bar and the percentage are **one JS-driven animated value**. Never move the bar to the native
  driver for smoothness: that driver keeps animating _while the JS thread is blocked_ and only JS can write
  text, so the bar fills while the number sits at 0 (hit on app launch 2026-08-17). Smoothness comes from
  animating `translateX` rather than `width`, and from isolating the counting text
  (f) Any ink override (`tone`, `color`) must **measure** ≥ 3:1 against the surface it sits on (SC 1.4.11),
  and ≥ 4.5:1 if it colours text (§20.8) — on 2026-08-17 every cyan in the product measured under 3:1 on a
  `--mobile-primary` button while looking fine
  Machine half: `scripts/ci/check-loading-state.sh` in the CI lint job — it catches `ActivityIndicator` and
  raw Tailwind `animate-*`, **not** (b)'s text/placeholder cases.
  (root cause: 24 hand-rolled indicators accumulated after `<LoadingState />` was specified, and web's own
  copy reached zero production consumers while ~35 list pages showed a plain "Loading…" line)

### Never

- Call OpenAI SDK directly — always via `LLMProvider` interface
- Create microservices — monolith first, extract only when BOTH conditions met:
  (a) team ownership boundary clear AND (b) independent scaling pressure with evidence
- Add direct HTTP or gRPC calls between NestJS modules inside the monolith — use NestJS DI for synchronous cross-module calls and Kafka events for async; HTTP is only for cross-deployable communication (master §3; rule 3)
- Query another module's database tables directly from application code — cross-module data access must go through the owning module's service layer or via Kafka events (master §4)
- **Skip RLS on domain tables** — PostgreSQL Row Level Security is MANDATORY on every domain table from MVP (primary isolation mechanism, spec §7.7); `app.current_tenant_id` must be set at request start before any query; application-layer `WHERE tenant_id = $1` is secondary defense-in-depth, not a replacement for RLS
- **Define design tokens without wiring the Tailwind pipeline** — the §32.7 tokens only take effect if `apps/web` has `postcss.config.js` + `tailwind.config.js` (content globs + `theme.extend` mapping tokens) + `src/app/globals.css` (`@tailwind …` + `:root{--cos-*/--web-*}`) imported in the root `layout.tsx` (with `@fontsource-variable/inter-tight`). Without the full wiring the page renders unstyled even though tokens are "defined" (spec §32.7 → Web Implementation; verify the build emits non-empty utility CSS)
- **Define design tokens without wiring the React Native app (mobile)** — same pitfall, different mechanism: RN has no CSS vars, so the §32.7 `--mobile-*` tokens must be a typed module (`apps/mobile/src/theme/tokens.ts`), the brand font loaded via `expo-font` + `@expo-google-fonts/inter-tight` (`useFonts` in `app/_layout.tsx`), and components must reference the theme (never hardcode hex/`fontWeight`). The app also needs an Expo config (`app.json` with `expo-router` + `expo-font` plugins, `main: 'expo-router/entry'`) or it never boots (spec §32.7 → Mobile Implementation)
- **Reintroduce WatermelonDB or its native wiring** — the offline DB is **Drizzle ORM on expo-sqlite** (first-party; no config plugins, no simdjson pod, no decorators/loose babel, no CMake patch). Decision record spec `17 §17.10` / ADR-048 (2026-07-04); measured envelope G1/G2 recorded there
- **Simulate offline in Detox via `device.setStatusBar`/NetInfo jest mock** — neither works: Detox has no connectivity API (setStatusBar is cosmetic) and the NetInfo jest mock is unit-only (Detox runs the real binary). Use an app-level hook gated by `EXPO_PUBLIC_E2E=1` (deep link `cos://e2e/network` → `useNetworkStatus`); and there is **no boolean `element().isVisible()`** — use `await waitFor(el).toBeVisible().withTimeout()` (spec §30.7)
- **Call `useSearchParams()` / `usePathname()` / `useRouter()` (or any CSR-bailout hook) without a `<Suspense>` boundary in a Next.js App Router page** — these hooks opt the subtree into client-side rendering, and `next build` fails the static export of the route with `missing-suspense-with-csr-bailout` ("Error occurred prerendering page"). `tsc --noEmit` (the `type-check` gate) does NOT catch this — only the `build` gate does (ADR-033). Isolate the hook in a child component and wrap it: `export default function Page(){ return <Suspense fallback={…}><Inner/></Suspense> }`. Example fix: `apps/web/src/app/login/page.tsx` (spec §32.7 → Web Implementation)
- Implement BigQuery or Snowflake — analytics uses ClickHouse only
- Implement LangGraph in Phase 11–12 — Phase 12 uses plain Python sequential pipeline; Layer C
  orchestration is LAYER-C-001, provisionally resolved to **Temporal.io** (PO decision 2026-07-10);
  final commitment gated by the §22.6 Thai benchmark when Layer B is stable ≥ 30 days — LangGraph
  remains a fallback candidate only (source: spec §22-ai-architecture §22.3)
- Use IndexedDB in React Native — smartphone uses **Drizzle ORM on expo-sqlite** (`cos_offline_v2.db`, useLiveQuery reactive reads) for all main business entities (site_reports, issues, local_photos, etc.); `sync_queue` keeps its own expo-sqlite handle (`cos_sync_queue.db`). Raw expo-sqlite for other entities is prohibited — go through the Drizzle schema (spec 17 §17.10 / ADR-048)
- Skip hallucination guard on AI report endpoints
- Invent workflow states or transitions beyond those defined in master §WORKFLOW ENGINE SPEC — implement exactly what is specified, nothing more (master §9; spec §32.6)
- Implement AUTONOMOUS execution without governance review
- Hardcode secrets, API keys, or credentials in any file — use **AWS Secrets Manager** (cloud/AWS EKS) or **HashiCorp Vault** (on-premise/hybrid) for runtime secrets per spec §5.2 and ADR-013; use `sealed-secrets` (kubeseal) for Kubernetes Secret objects that must be stored in git (QM-4)
- Use `console.log` — always use `@cos/logger`
- Return `200` with an error body — use correct HTTP status codes per QM-10
- Expose stack traces or internal paths in API error responses
- Store PII in logs, traces, or error messages — use `[REDACTED]` or IDs only
- Use `float` for monetary values — use `decimal.js` or Python `Decimal`
- Deploy a raw SQL `DROP COLUMN` or `RENAME COLUMN` migration without a backward-compat plan and a committed rollback script (QM-9)
- Bypass rate limiting on any public endpoint
- Return `Access-Control-Allow-Origin: *` in production
- Deploy a user-facing change to production without a feature flag (QM-15)
- Proceed past the canary or blue-green health gate without a passing signal (QM-16)
- Enable TLS 1.0, TLS 1.1, or TLS 1.2 on any ingress endpoint — TLS 1.3 is the minimum (QM-4; source: master §Phase 16)
- Store unencrypted data in S3, RDS, or ElastiCache in production — SSE-KMS required on all (QM-4)
- Use an encryption algorithm weaker than AES-256 for any at-rest data encryption implementation — AES-256 is the minimum standard (spec §5.2; QM-4)
- Implement tables in React Native — use card layout instead (master §8; spec §32.7)
- Implement navigation deeper than 3 levels in React Native — restructure using bottom sheets or tab navigation
- Implement modal-on-modal in React Native — use bottom sheets instead (master §8; spec §32.7)
- Render any React Native tap target below 44px height — WCAG AAA minimum is 44px; recommended 52px for primary buttons (master §8; spec §32.7)

### On ambiguity

- If spec is unclear → ask the user before implementing
- If EP is UNSPECIFIED → STOP, escalate to product owner immediately; do not generate stubs, do not implement
- If `context/00_master_construction_os.md` conflicts with `docs/specifications/` → specs win; report discrepancy to product owner before implementing
- If two spec files in `docs/specifications/` conflict → consult `32-implementation-specifications.md` first; if still unclear → ask product owner before implementing
- If a quality mandate conflicts with a feature request → quality mandate wins; escalate to product owner if blocker

---

## AWAITING_DECISION PROTOCOL (files 05–11)

When loading context files `05_*` through `11_*`, each file contains a `## REQUIRED DECISIONS` section.

> Note: Stages 1–3 use fully specified implementation details — no open architectural decisions remain at that point. Stages 4–10 enter territory with genuine uncertainty; decisions must be made before implementation can proceed.

Execute in this order — **block until all decisions are answered before implementing anything**:

### Step 1 — Review REQUIRED DECISIONS for completeness

Read the `## REQUIRED DECISIONS` section and ask:

- ผลจาก stage ก่อนหน้าสร้าง requirement ใหม่อะไรที่ยังไม่มีในรายการนี้? (What new requirements did the previous stage create that are not yet in this list?)
- production data ที่สะสมมา บอกอะไรที่ทำให้ต้องตัดสินใจเพิ่มอีกบ้าง? (What does accumulated production data tell us about additional decisions needed?)
- technology landscape เปลี่ยนไปจนมี option ใหม่ที่ควรถามหรือไม่? (Has the technology landscape changed enough to introduce new options worth asking about?)
- Are there any new compliance or data sovereignty requirements introduced by the new target markets?

ถ้าพบว่าขาด — เพิ่มคำถามใหม่เข้าไปใน `## REQUIRED DECISIONS` ของไฟล์นั้นก่อนดำเนินการต่อ
Format: `[ ] [ID]-NEW-NNN: [question] — affects: [component]`

### Step 2 — Present all decisions to product owner and BLOCK

Present all `[ ]` items from the REQUIRED DECISIONS block — including any newly added ones from Step 1.
Format: "ก่อน implement stage นี้จริง ต้องการคำตอบจาก product owner ดังนี้: ... / Before implementing this stage, the following decisions are required from the product owner: ..."

**Do not implement anything until all decisions are answered.** Every decision must be resolved and written into `docs/specifications/` before work begins.

### Step 3 — Implement once all decisions are answered

When product owner answers all questions → update `docs/specifications/` with the decisions → implement directly with full spec.

### AWAITING_DECISION vs UNSPECIFIED

- `UNSPECIFIED` = requires immediate product owner decision — STOP and escalate; no implementation until resolved
- `AWAITING_DECISION` = planned decision required at stage start — BLOCK until product owner answers; no implementation until resolved

---

---

## FILE REFERENCE MAP

All paths are relative to the repository root.

```text
# Context & Specification
context/00_master_construction_os.md                — MASTER: all decisions, all phases, all EPs; § ENGINEERING GOVERNANCE = Phase Template · Risk Register (R-01..R-09) · Roadmap horizons (NOW/NEXT/LATER/VISION) · Phase Register (Ph1–25: objective/deps/risks/exit/effort)
context/01_build_priority_execution.md              — BUILD stage context
context/02_build_deep_systems.md                    — BUILD stage deep detail (use with 01)
context/03_operationalize_execution.md              — OPERATIONALIZE stage context
context/04_post_launch_enterprise_evolution.md      — POST-LAUNCH stage context
context/05_industry_scale_transition.md             — INDUSTRY SCALE stage context
context/06_ecosystem_dominance.md                   — ECOSYSTEM DOMINANCE stage context
context/07_industry_coordination.md                 — INDUSTRY COORDINATION stage context
context/08_global_intelligence.md                   — GLOBAL INTELLIGENCE stage context
context/09_civilization_scale.md                    — CIVILIZATION SCALE stage context
context/10_civilization_stewardship.md              — STEWARDSHIP stage context
context/11_background_civilization.md               — BACKGROUND CIVILIZATION stage context
docs/specifications/                                — SOURCE OF TRUTH for all architecture decisions (00–34); master is the compiled execution view

# Engineering Governance & Non-functional Standards (authoritative spec sections)
docs/specifications/03-system-design.md §3.4        — C4 architecture views (Context / Container / Component); the Context + Container diagram SOURCES live in docs/architecture/README.md (moved there 2026-08-07 per §3.4's own "diagram sources live in architecture/" rule)
docs/specifications/05-security-compliance.md §5.9  — Threat Model (STRIDE) per external surface; §5.10 supply-chain (SBOM/SLSA)
docs/specifications/08-enterprise-deployment.md §8.2 — RTO/RPO per tier; §8.10 FinOps; §8.11 compute sustainability
docs/specifications/09-data-architecture.md §9.8     — Data governance (MDM, lineage, catalog)
docs/specifications/18-enterprise-saas-scaling.md §18.4 — Capacity planning + load-test gate
docs/specifications/20-ux-flow.md §20.8              — Accessibility (WCAG 2.2 AA)
docs/specifications/22-ai-architecture.md §22.7      — AI integration decisions (registry); §22.8 AI security (OWASP LLM Top 10); §22.9 model governance; §22.10 RAG-eval/prompt-registry/token-cap/semantic-cache
docs/specifications/23-ai-native-operating-model.md §23.5 — Human-AI governance structure (STEW-001)
docs/specifications/30-testing-strategy.md §30.9     — Lighthouse CI frontend gate (Core Web Vitals + bundle budget + accessibility category = 1.0)
docs/specifications/31-monitoring-observability.md §31.6 — SLO/error-budget + Frontend Web Vitals (LCP/INP/CLS); §31.9 incident/SEV/postmortem; §31.11 chaos/game-day; §31.12 DORA

# Readiness & Verification
scripts/readiness/verify-production-readiness.sh    — Auto-verify 30 [AUTO] checks (Phase 19)
scripts/readiness/run-all-checks.sh                 — Interactive verify 14 [MANUAL] checks (Phase 19)
scripts/readiness/check-openapi-freshness.sh        — Verify OpenAPI spec exists, is valid YAML/JSON, version present, live sync if INGRESS_HOST set (Phase 18)
scripts/readiness/check-i18n-completeness.sh        — Verify all i18n keys are translated (Phase 18)
scripts/readiness/check-security-headers.sh         — Verify all required HTTP security headers on ingress (HSTS, X-Content-Type-Options, X-Frame-Options, CSP, Referrer-Policy, Permissions-Policy) + TLS 1.3 (Phase 16)
scripts/readiness/check-schema-registry.sh          — Verify Kafka Schema Registry connectivity, BACKWARD_TRANSITIVE compatibility mode, all critical v1 schemas registered per spec §32.4 event table, local .avsc files valid JSON (Phase 8)
scripts/readiness/check-service-runtimes.sh         — Architectural fitness function: every runtime declared in a docs table matches the build files in services/<name>/ (go.mod→Go, requirements.txt→Python, package.json→Node). CANONICAL table = spec §32.2; 00_master §DEPLOYABLE UNITS, §33 Service Assignment and README are mirrors. Runs in the CI lint job on every PR
scripts/loadtest/api-baseline.js                    — k6 load test: 100 VU × 5 min mixed-read baseline gate; P95 read < 300ms, P95 write < 500ms, error rate < 0.1% (QM-6; Phase 18)

# Compliance & Governance
docs/registers/data-flow-map.md                    — PDPA/GDPR data flow documentation (Phase 16)
docs/policies/data-retention-policy.md            — Data retention rules per entity type (Phase 16)
docs/policies/log-retention-policy.md             — Log retention schedule and archival policy (Phase 15)
docs/policies/data-residency-policy.md            — Data residency requirements per region (Phase 17)
docs/registers/soc2-controls.md                    — SOC 2 Type II control tracking (before Stage 2→3)
docs/registers/localization-gaps.md                      — TH-specific rules with no i18n equivalent (Phase 3)

# Security
docs/policies/secrets-rotation-policy.md            — Rotation schedule for all secret types (Phase 2)
docs/policies/csp-policy.md                         — Content Security Policy definition (Phase 16)
docs/policies/cors-policy.md                        — CORS allowed origins per environment (Phase 3)
docs/registers/pentest-findings.md                   — External pentest findings and resolution status (before Stage 1→2)
docs/assessments/sms-otp-restricted-authenticator.md  — NIST SP 800-63B Rev 4 obligations for Path A SMS OTP: risk assessment, migration roadmap, user notification (spec §5.4.4)
infrastructure/terraform/aws/kms.tf                 — KMS customer-managed key definitions (Phase 17)
infrastructure/kubernetes/external-secrets/         — ESO ExternalSecrets: AWS SM → K8s Secret cos-<svc>-secrets (cloud secret delivery; spec §08 §8.6)
infrastructure/kubernetes/sealed-secrets/           — SealedSecrets (kubeseal): git-committed / on-prem secret path; same cos-<svc>-secrets names

# API & Documentation
docs/api/                                           — OpenAPI 3.1 specs (auto-generated per service: auth.openapi.yaml, boq.openapi.yaml, graph.openapi.yaml, analytics.openapi.yaml, etc.; QM-2 convention: docs/api/{service}.openapi.yaml; full canonical list: spec §14.3)
docs/api/error-codes.md                             — Error code registry (COS-{DOMAIN}-{NNN}) (Phase 3)
docs/api/deprecation-schedule.md                    — API version sunset dates and tenant notification log (Phase 18)
docs/architecture/adr/                              — Architecture Decision Records (see directory for current list)
docs/architecture/adr/000-template.md              — ADR template
docs/architecture/adr/008-shared-db-tenant-id-rls.md               — Shared DB + tenant_id + PostgreSQL RLS standard (current, Phase 2 revision)
docs/architecture/adr/015-database-retry-helpers.md               — Database retry helper pattern for Prisma transient errors (Phase 1)
docs/architecture/adr/032-timescaledb-colocated-then-split.md     — TimescaleDB co-located on primary PostgreSQL; split to dedicated instance on volume trigger (Phase 1 decision)
docs/architecture/adr/033-ci-build-gate.md                        — CI `build` (turbo run build) gate runs on every PR; tsc --noEmit is not a build (Phase 1 decision)
docs/architecture/adr/036-compose-profiles-local-app-services.md  — Docker Compose `apps` profile to run app services in containers locally (Phase 1 enhancement; `make docker-apps-up-full`)

# SLO & Reliability
docs/registers/dashboard-registry.md                      — Grafana dashboard IDs per SLO (Phase 15)
docs/evidence/slo-monthly-reviews/                           — Monthly SLO review notes directory (Phase 19)

# Feature Flags
docs/registers/feature-flag-cleanup-backlog.md               — Stale flags pending removal from code (Phase 3)

# Runbooks
docs/runbooks/disaster-recovery.md               — DR runbook (primary DR procedure)
docs/runbooks/disaster-recovery/                 — DR runbooks per failure scenario (structured dir; Phase 16)
docs/runbooks/disaster-recovery/drill-log.md     — DR drill results and RTO measurements
docs/runbooks/deployment-windows.md              — Approved production deployment windows
docs/runbooks/releases/                          — Per-release deployment runbooks
docs/runbooks/on-call-rotation.md                — On-call schedule and escalation path
docs/runbooks/postmortem-template.md             — Blameless post-mortem template
docs/runbooks/deployment.md                      — Deployment checklist
docs/runbooks/rollback.md                        — Rollback runbook
docs/runbooks/incident-response.md               — Incident response runbook
docs/runbooks/production-readiness.md            — Production readiness checklist
docs/runbooks/ai-readiness-checklist.md          — AI feature activation checklist
docs/runbooks/db-failover.md                     — PostgreSQL RDS Multi-AZ failover procedure
docs/runbooks/kafka-partition-rebalance.md       — Kafka consumer lag and partition rebalance procedure
docs/runbooks/keycloak-realm-recovery.md         — Keycloak realm recovery procedure
docs/runbooks/keycloak-realm-backup.md           — Keycloak realm daily backup (CronJob spec)
docs/runbooks/temporal-worker-restart.md         — Temporal.io worker restart and stuck workflow recovery

# Audit
cos-audit/                                          — Product owner sign-off audit logs (git-ignored content, directory committed)

# Observability Infrastructure
infrastructure/monitoring/otel-collector/otel-collector-config.yml — OTel collector config (tail_sampling + Loki label hints; ADR-075)
infrastructure/monitoring/otel-collector/kustomization.yaml        — base; generates the config ConfigMap from the file above (never hand-write it)
infrastructure/monitoring/otel-collector-overlays/{development,staging,production}/ — per-env ENV + OTEL_SAMPLING_PERCENTAGE (§31.5: 100/10/1); deploy with `kubectl apply -k <overlay>`, NOT `apply -f`
infrastructure/synthetics/                          — Synthetic monitoring probe definitions for Grafana Synthetic Monitoring / OpenTelemetry Collector (Phase 15)

# Lint & Format Config
.markdownlint.json / .markdownlintignore            — markdownlint rules + legacy-tree excludes (CI lints changed .md only; §30.12)
.yamllint                                           — yamllint rules (CI gate, repo-wide; §30.12)
.sqlfluff / .sqlfluffignore                         — sqlfluff PostgreSQL lint config + immutable-migration excludes (CI gate; §30.12)

# Stage Marker
.cos-stage                                          — Machine-readable current stage number; read by STEP 2 auto-detect
CHANGELOG.md                                        — Changelog with BREAKING CHANGE entries
```
