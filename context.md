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

- Architecture decisions (monolith, schema-per-tenant, 3-platform mobile)
- Full technology stack (AWS, ClickHouse, OpenAI GPT-4o, Keycloak, Temporal, etc.)
- Phase 1–24 implementation specs
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
> 1. BUILD — กำลัง implement Phase 1–24 อยู่ (Implementing phases)
> 2. OPERATIONALIZE — Phase 1–24 เสร็จแล้ว กำลัง deploy และ adopt จริง (Deploying & adopting)
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
- p95 API latency: read < **300ms**, write < **500ms** on production (source: spec §31.6 SLO targets; M-7 resolved 2026-05-27; measured via Grafana)
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

- Unit test coverage ≥ **80% lines and ≥ 70% branches** for all new modules (source: spec §30.3, §30.12; M-1 resolved 2026-05-27); measured by `jest --coverage` with thresholds `{"global":{"lines":80,"branches":70}}` or `pytest --cov` with `--cov-fail-under=80` for lines (branch coverage enforced in jest config)
- Integration tests required for every public API endpoint
- Contract tests required whenever a new inter-service HTTP/gRPC contract is introduced
- E2E tests required for every critical user workflow (site report, procurement approval, cost tracking)
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
- Old versions must remain functional for ≥ **12 months** after a new version is published (minimum deprecation notice before version sunset — source: spec §14.4; M-9 resolved 2026-05-27)
- OpenAPI 3.1 spec must be generated per service under `docs/api/{service}.openapi.yaml` (e.g., `docs/api/auth.openapi.yaml`) — one file per service, not one combined file
- When deprecating an API version: notify tenants via email + in-app banner ≥ 90 days before sunset; record sunset date in `docs/api/deprecation-schedule.md`

### QM-3 — Internationalization (i18n)

- **Zero hardcoded user-facing strings in application code** — all strings go through i18n keys
- i18n keys format: `{domain}.{screen}.{element}` (e.g., `procurement.list.emptyState`)
- Translation files live in `apps/*/src/i18n/{locale}.json` (e.g., `th.json`, `en.json`)
- Default locale: `th-TH`. Fallback locale: `en-US`
- All dates → ISO 8601 internally; display via `Intl.DateTimeFormat` with user's locale
- All currencies → `decimal.js` internally; display via `Intl.NumberFormat` with user's locale
- All timestamps → stored in UTC; converted to user's timezone on display
- All sort orders → locale-aware (`Intl.Collator`)
- **Plural forms** — use ICU MessageFormat syntax for all strings that vary by count; never assume English plural rules apply to other locales (Arabic has 6 plural forms, Russian has 3); use `@formatjs/intl` or equivalent ICU-compliant library
- **RTL (Right-to-Left) layout** — all UI components must support RTL via CSS `direction: rtl` / React Native `I18nManager.isRTL`; test every new UI component against `ar-SA` locale before merging
- **Buddhist Era (BE) calendar** — Thai users expect B.E. year display (e.g., 2568 not 2025); use `Intl.DateTimeFormat` with `calendar: 'buddhist'` for `th-TH` locale; never hardcode Gregorian year arithmetic for Thai display
- **Character encoding** — all source files, API responses, and database text columns must use UTF-8; explicitly verify PostgreSQL cluster encoding is `UTF8`; never override to a narrower encoding
- **Locale negotiation** — honor `Accept-Language` HTTP header for API responses; store user's preferred locale in their profile and use it as override over header
- For Thai-specific business rules that have no international equivalent → tag with `// i18n: TH-SPECIFIC` comment and add to `docs/i18n/localization-gaps.md`

### QM-4 — Security

- **No secrets in code or git history** — runtime secrets injected via **AWS Secrets Manager** (cloud/AWS EKS; External Secrets Operator syncs SM secrets → K8s Secret → pod env) or **HashiCorp Vault** (on-premise/hybrid; Vault Agent sidecar) per spec §5.2; C-02 resolved 2026-05-27; ADR-013. Kubernetes Secret objects that must exist in git committed only as **SealedSecret** via `sealed-secrets` (kubeseal); never commit `.env` files; never commit `*.pem`, `*.key`, or `*.pfx` files; pre-commit hook must block secret patterns (`git-secrets` or `gitleaks`). Source of truth: `context/00_master_construction_os.md` §Phase 2 Secret Management
- **Secrets rotation** — all secrets must have a rotation schedule defined in `docs/security/secrets-rotation-policy.md`; cloud: database credentials rotated via AWS SM automated rotation (Lambda rotation function per resource type); on-premise: database credentials rotated every 24h via **Vault database secrets engine** (dynamic secrets, lease TTL — see Vault secret rotation policy); JWT signing keys rotate every 180 days via JWKS endpoint rotation (zero-downtime); rotation tested in staging before each Stage transition
- **Authentication — TWO PATHS (Phase 2 authoritative):**
  - **Path B (email/password — office/management roles):** uses Keycloak OIDC — never implement custom email/password auth; JWT is RS256-signed by Keycloak
  - **Path A (SMS OTP — SITE_WORKER, SITE_ENGINEER):** uses a **Custom lightweight NestJS module** within the identity module — explicitly NOT via Keycloak extension (Phase 2 spec: "NOT via Keycloak extension — complexity not justified at MVP"); SMS gateway: AWS SNS (AWS SNS selected)
  - Keycloak is the single source of truth for identity storage and JWT signing across both paths
- All inputs validated at the API layer — never trust client-supplied data; use **Zod** (TypeScript) or **Pydantic** (Python) for schema validation — never hand-written `if` checks alone
- SQL queries via Prisma ORM only — never raw string interpolation in SQL
- File uploads: validate MIME type server-side, scan with ClamAV (Phase 9+)
- OWASP Top 10 — every endpoint must be hardened against: injection, broken auth, IDOR, SSRF, XSS, security misconfiguration
- **Security headers** — every HTTP response must include:
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Content-Security-Policy` — policy defined in `docs/security/csp-policy.md`; never use `unsafe-inline` or `unsafe-eval` in production CSP
- **TLS policy** — TLS 1.3 minimum on all ingress endpoints (source: master §Phase 16 + spec §05 §5.2); TLS 1.0, TLS 1.1, TLS 1.2 explicitly disabled on ingress; certificate rotation automated via cert-manager (Kubernetes) + AWS ACM (cloud)
- **mTLS** — required for all service-to-service communication that crosses VPC/node boundaries; internal calls within the same NestJS process are exempt; mTLS managed via **Istio 1.21+** service mesh (source: master tech stack — Istio handles mTLS certificate lifecycle via cert-manager integration; no separate AWS Private CA required)
- **WAF** — solution depends on deployment type (source: spec §05-security-compliance §5.5 + §08-enterprise-deployment §8.7):
  - **Cloud deployments** (Shared SaaS, Dedicated Tenant): **Cloudflare WAF** (decided 2026-05-26)
    - Architecture: `Internet → Cloudflare Edge → AWS ALB → EKS Ingress → NestJS`
    - Plan: Cloudflare Pro minimum
    - Rule sets: Cloudflare Managed Ruleset + OWASP CRS (paranoia level 2) + Custom Construction OS rules
    - Rate limits (paths `/api/v*/...`): auth 10 req/min/IP · general API 100 req/min/user · file upload **20 req/min/user** (spec §05 §5.5 v1.4.0, confirmed 2026-05-26)
    - **Origin protection MANDATORY**: AWS ALB SG must allow port 443 from Cloudflare IPs only → `infrastructure/terraform/cloudflare/`
    - **App integration MANDATORY**: use `CF-Connecting-IP` as real IP; validate `CF-Ray` present; log `CF-Ray` → `backend/src/shared/middleware/cloudflare-waf.middleware.ts`
  - **On-premise deployments**: Cloudflare WAF is NOT applicable — Kong Gateway provides rate limiting; customer-provided WAF MUST meet OWASP CRS paranoia level 2 minimum (see spec §08-enterprise-deployment §8.7)
- **Data encryption at rest** — algorithm: **AES-256** minimum on all persistent storage (source: spec §5.2); all S3 buckets: SSE-KMS with customer-managed key (CMK); all RDS/Aurora: storage encryption enabled at creation; all ElastiCache nodes: encryption-at-rest enabled; CMK definitions in `infrastructure/terraform/aws/kms.tf`
- **Penetration testing** — external pentest required before Stage 1→2 and Stage 2→3 transitions; findings tracked in `docs/security/pentest-findings.md`; all HIGH/CRITICAL findings resolved before advancing stage
- SAST and code quality scan must pass in CI via **SonarQube** before merge — **C-04 RESOLVED (2026-05-27; ADR-011):** spec §30.10 and §30.12 mandate SonarQube; semgrep removed from CI pipeline once SonarQube is operational; SonarQube Community Edition self-hosted on EKS; quality gate thresholds: 0 new bugs, 0 new vulnerabilities, ≥80% line coverage, ≥70% branch coverage, ≤3% duplication on new code; command: `sonar-scanner -Dsonar.projectKey=construction-os -Dsonar.sources=. -Dsonar.host.url=$SONAR_HOST_URL`
- Dependency vulnerability scan in CI (`npm audit --audit-level=high` / `pip-audit`) — no HIGH/CRITICAL unresolved
- Rate limiting required on all public-facing endpoints (see QM-7)
- CORS policy must be explicit — never use `*` in production; allowed origins defined in `docs/security/cors-policy.md`

### QM-5 — Data Privacy & Compliance

- **Data classification** — all data must be classified as one of: `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `RESTRICTED`; classification tagged in Prisma schema comments; access control enforced per classification level
- **PDPA (Thailand)** — Personal Data Protection Act B.E. 2562:
  - All PII fields must be tagged in Prisma schema with `@pdpa(category: "...")` comment
  - Consent must be captured before any PII is stored
  - Data subject rights (access, deletion, portability) must be implementable for each PII entity
  - Retain personal data for no longer than the purpose requires — define retention in `docs/compliance/data-retention-policy.md`
- **GDPR (EU)** — applies when any EU resident's data is processed:
  - Same PII tagging rules as PDPA
  - Data Processing Agreements (DPAs) required for all third-party processors
  - Right to erasure must be implementable within 30 days; implementation strategy: anonymization-in-place preferred over cascade delete (preserves aggregate analytics)
- **CCPA (California, USA)** — applies when California residents are served:
  - "Do not sell my personal information" opt-out must be implementable
- **SOC 2 Type II** — platform must be SOC 2 Type II ready by Stage 3; controls tracked in `docs/compliance/soc2-controls.md`; every new feature reviewed against SOC 2 trust criteria (Security, Availability, Confidentiality) before merge
- **Cross-border data transfer**: Thai-origin data must not leave the `ap-southeast-1` region without explicit product owner approval and legal review; data residency rules per region defined in `docs/compliance/data-residency-policy.md`
- PII must never appear in logs, traces, or error messages — use `[REDACTED]` or masked values

### QM-6 — Performance Budgets

These are enforced targets. If an implementation does not meet them, do not ship — optimize or escalate.
Source: spec §31.6 (M-7 resolved 2026-05-27 — targets corrected to match spec SLO definitions)

| Metric                                       | Target                                         | Measurement                                  |
| -------------------------------------------- | ---------------------------------------------- | -------------------------------------------- |
| API p95 latency (read endpoints — GET)       | **< 300ms**                                    | Grafana / k6 load test                       |
| API p99 latency (read endpoints — GET)       | < 500ms                                        | Grafana / k6 load test                       |
| API p95 latency (write endpoints — POST/PUT) | **< 500ms**                                    | Grafana / k6 load test                       |
| API p99 latency (write endpoints — POST/PUT) | < 1s                                           | Grafana / k6 load test                       |
| Dashboard / analytics (ClickHouse)           | p95 < 1s                                       | Grafana / k6 load test                       |
| AI report generation                         | p95 < 5s                                       | Grafana / k6 load test                       |
| Mobile app cold start (React Native)         | < 3s on mid-range Android                      | Manual test + Flipper                        |
| Offline sync completion (3G, 5MB data)       | < 30s                                          | Manual test on throttled network             |
| Background job (Temporal workflow)           | SLA defined per workflow type in workflow spec | Temporal dashboard                           |
| k6 sustained load (100 VU × 5 min)           | 0 errors, p95 within budget                    | CI gate — `scripts/loadtest/api-baseline.js` |

The k6 load test runs as a CI gate on every PR that modifies an API endpoint, database query, or Temporal workflow. A failing load test blocks merge.

### QM-7 — Rate Limiting

- All public API endpoints: 100 req/min per tenant by default; burst allowance: 150 req/min for ≤ 10 consecutive seconds
- Authentication endpoints: 10 req/min per IP (brute force protection); account lockout after 5 consecutive failures for 15 minutes
- AI/LLM endpoints: 20 req/min per tenant (cost protection)
- File upload endpoints (`/api/v*/files/*`): **20 req/min per user** (spec §05 §5.5 v1.4.0, confirmed 2026-05-26)
- Rate limiting via **Kong Gateway** (open-source, Kubernetes-native) at the infrastructure level — C-01 RESOLVED (2026-05-27; spec §4.8; ADR-010); Kong enforces rate limits before requests reach NestJS, reducing compute waste on blocked requests; Kong also handles JWT validation, tenant routing, and API analytics per spec §4.8; API monetization covers billing/quota metering only — Kong is now the gateway infrastructure
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
- **Log retention** — production logs stored in **Loki** (30 days hot on S3 object storage); 1 year cold; compliance archive retained 7 years (source: spec §31.2 + master Phase 15; M-10 resolved 2026-05-27 — CloudWatch Logs removed; Loki is the authoritative log store); retention schedule defined in `docs/compliance/log-retention-policy.md`

**Distributed Tracing:**

- All HTTP requests must propagate `traceparent` header (W3C Trace Context)
- All Kafka events must carry `trace_id` and `span_id` in headers
- All cross-service calls must create child spans
- **Sampling strategy** — tail-based sampling in production: 1% baseline of all requests; 100% of requests with errors (`4xx`/`5xx` responses); 100% of all AI/LLM calls; 100% of all financial transactions (source: spec §31.5; m-2 resolved 2026-05-27 — "head-based" corrected to "tail-based"; tail-based captures all error traces regardless of baseline sample rate); sampling config in `infrastructure/monitoring/otel-collector-config.yaml` (sampling section)

**Metrics:**

- All Temporal workflows: emit `workflow.started`, `workflow.completed`, `workflow.failed` counters
- All AI/LLM calls: emit `llm.tokens_used`, `llm.latency_ms`, `llm.model` metrics
- All background jobs: emit `job.duration_ms`, `job.success`, `job.failure` metrics
- **SLO burn rate** — emit `slo.error_budget_remaining` and `slo.burn_rate_1h` per SLO defined in QM-14; alert when burn rate exceeds 2× sustained for 1 hour, or 10× for 5 minutes

**Alerts:**

- Every new service must have corresponding **Alertmanager** alert rules defined (Prometheus ecosystem — source: spec §31.7 + master Phase 15; M-11 resolved 2026-05-27 — CloudWatch alarms removed; Alertmanager is the authoritative alerting system); alert YAML in `infrastructure/monitoring/`
- Minimum alerts: error rate > 1% for > 5 min, p99 latency > 3s for > 5 min, job failure rate > 5%
- **Synthetic monitoring** — health-check probes run every 60 seconds from ≥ 2 AWS regions against all public endpoints; implemented via OpenTelemetry Collector + Grafana Synthetic Monitoring (source: spec §31.7 + master Phase 15; probe definitions in `infrastructure/synthetics/`)

### QM-9 — Backward Compatibility

- **Database migrations must be backward-compatible** — the old code must still work while the migration runs
  - Add columns as nullable first
  - Never rename a column in a single migration — add new + copy data + remove old (3-step)
  - Never change a column's type directly — create new column, migrate data, drop old
  - Never drop a column used by any deployed code
  - Every migration must have a verified rollback script committed alongside it in `migrations/rollbacks/`
- **API backward compatibility** — old clients must not break during upgrades
  - Never remove a JSON field from a response — mark as deprecated with `@deprecated` in OpenAPI, keep for 6 months
  - Never change a field's type in the same version
- **Kafka schema backward compatibility** — Confluent Schema Registry is **required** infrastructure (not optional); all Kafka schemas must be registered before first producer use; compatibility mode: `BACKWARD_TRANSITIVE` (new schema can read messages from ALL previous versions — not just the immediately preceding one; source: spec §32.4; C-NEW-1 resolved 2026-05-27); CI must validate schema compatibility against the registry before deployment
- **Mobile backward compatibility** — the backend must support the previous 2 major mobile app versions
- **Offline sync conflict resolution** — conflict strategy is entity-specific (authoritative spec: `context/00_master_construction_os.md` §Phase 6 Offline Conflict Resolution Strategy); agents must implement exactly the strategies below — never invent a different strategy without an ADR:
  - `site_reports`: **LAST_WRITE_WINS** on `client_submitted_at`; flag as `CONFLICT_FLAGGED` for `SITE_ENGINEER` manual review when server `modified_at` differs from client's `last_known_modified_at`
  - `issues`: **FIELD_LEVEL_MERGE** — `description` / `resolution_note`: last writer wins; `status`: server wins (authoritative); `photos`: union (additive, no conflict possible); flag `ConflictRecord` for `SITE_ENGINEER` review if `status` was changed server-side during client's offline edit
  - `safety_checklists`: **SERVER_WINS** — reject client version unconditionally; return server version with `CONFLICT_REJECTED` status; safety data must be authoritative, no exceptions
  - **Financial entities** (BOQ line items, payment approvals, budget entries, invoice records): **no auto-resolution** — offline write operations on financial entities are held in the sync queue; before applying, server checks for concurrent server-side modification; if conflict detected → status `CONFLICT_FLAGGED`, push notification to `FINANCE` or `PROJECT_MANAGER` for manual resolution; never auto-merge, auto-overwrite, or silently discard financial data
  - Sync wire protocol (server-side endpoint): `POST /api/v1/sync/resolve` accepts `{ entity_type, entity_id, client_version, payload, client_submitted_at }`; returns `{ resolved_payload, conflict_status, server_version }` where `conflict_status ∈ { ACCEPTED | CONFLICT_FLAGGED | CONFLICT_REJECTED }`
  - `ConflictHandler` class (generated in Phase 10) must implement all three strategies; unit-tested per QM-1 (Phase 18 mandatory coverage list)

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

- Active-passive multi-region: primary `ap-southeast-1` (Thailand); DR region defined via multi-region Terraform module before Stage 4 begins
- Global traffic routing via Route 53 latency-based routing or CloudFront
- Data residency enforced per QM-5: Thai-origin data remains in `ap-southeast-1` unless product owner approves otherwise with legal sign-off
- Cross-region replication strategy (read replicas vs. active-active) decided in an ADR before implementation begins
- Each region must independently pass Phase 19 automated checks before receiving production traffic

### QM-14 — SLI / SLO / Error Budget

SLOs are non-negotiable production targets. Error budget is consumed when an SLO is violated.
Source: spec §31.6 (M-7 latency fix + M-8 availability tiers resolved 2026-05-27)

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
- SLO dashboards tracked in Grafana; dashboard IDs registered in `docs/slo/dashboard-registry.md`
- SLO burn rate alerts wired via QM-8 metrics
- Monthly SLO review required; notes in `docs/slo/monthly-reviews/YYYY-MM.md`

### QM-15 — Feature Flags & Progressive Delivery

All user-facing features and high-risk changes must ship behind a feature flag.

- Feature flag system: AWS AppConfig (Stage 1–3); migrate to LaunchDarkly at Stage 4 if tenant count exceeds 50
- Flag naming convention: `{stage}.{domain}.{feature}` (e.g., `s1.procurement.bulk-upload`)
- **Mandatory flag scenarios:**
  - Any new UI screen or workflow step
  - Any new AI/LLM endpoint
  - Any database migration that modifies existing data (data backfill, column drop)
  - Any change to authentication or authorization logic
  - Any Kafka schema change
- **Progressive rollout order:** 1% of tenants → 10% → 50% → 100%; minimum 24 hours at each step unless a rollback is triggered
- Feature flags must be removed from code within 30 days of reaching 100% rollout; stale flags tracked in `docs/feature-flags/cleanup-backlog.md`
- Emergency kill switch: every flag must be togglable to OFF within 60 seconds without a deployment

### QM-16 — Deployment Safety

Every production deployment must follow this protocol:

- **Zero-downtime** — required for all production changes; use Kubernetes rolling update by default
- **Blue-green deployment** — required for: major version releases, authentication system changes, any database migration that cannot be made backward-compatible in a single step
- **Canary deployment** — required for: API endpoint changes, new background job types, AI model version upgrades; minimum canary duration 30 minutes at 5% traffic before full rollout
- **Automated rollback** — if error rate exceeds 1% within 10 minutes of deployment → pipeline rolls back automatically; health gate defined in `.github/workflows/deploy.yml`
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

Schema-per-tenant uses `SET LOCAL search_path = {tenant_code}` per request — where `{tenant_code}` is the tenant's schema name (e.g., `acme_corp`, `riverside_const`), NOT `tenant_{id}` (source: master §Phase 2: "Each tenant gets one PostgreSQL schema: {tenant_code}"). Direct application-to-PostgreSQL connections do not scale: each pod holds a connection pool, and with many tenants and replicas, PostgreSQL `max_connections` is exhausted before reaching meaningful tenant count. A connection pooler is mandatory.

- **PgBouncer is the required connection pooler** for all environments (staging + production); deployed as a Kubernetes `Deployment` (not a sidecar) with a `PodDisruptionBudget` of `minAvailable: 1`; configuration committed to `infrastructure/kubernetes/pgbouncer/` (Phase 17)
- **Transaction mode is required** — `SET LOCAL search_path` is transaction-scoped and reverts on `COMMIT`/`ROLLBACK`, making transaction pooling safe for tenant routing; do NOT use session mode or statement mode
- **Session mode is prohibited** — incompatible with horizontal pod autoscaling (connections are pinned to a pod)
- **Statement mode is prohibited** — incompatible with multi-statement transactions
- Application layer (`TenantPrismaService`) must connect to PgBouncer address — never directly to PostgreSQL port `5432`; integration test must assert connection string resolves to PgBouncer, not the database host
- **Baseline configuration** (tune before Stage 2 go-live based on Grafana observations):
  - `default_pool_size = 25` per database
  - `max_client_conn = 1000`
  - `server_idle_timeout = 600` seconds
- **Grafana must expose** `pgbouncer_pools_client_active`, `pgbouncer_pools_server_active`, `pgbouncer_pools_client_waiting`, `pgbouncer_databases_pool_size`; alert policy: fire P2 incident when `client_waiting > 10` sustained for > 30 seconds
- **Tenant scale limit documentation** — before Stage 2 go-live, load-test the PgBouncer + PostgreSQL stack and record the maximum concurrent tenants at acceptable latency in `docs/architecture/tenant-scale-limits.md`; this threshold determines when DatabaseSharding evaluation must begin
- Local development (Docker Compose): PgBouncer container required in `docker-compose.yml`; dev mode Vault and PgBouncer must start together with the application

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
# 1. Test coverage gate (80% lines + 70% branches — source: spec §30.3; M-1 resolved 2026-05-27)
npx jest --coverage --coverageThreshold='{"global":{"lines":80,"branches":70}}'

# 2. Node dependency vulnerability check
npm audit --audit-level=high

# 3. Python dependency vulnerability check
pip-audit --requirement ai/requirements.txt

# 4. SAST + code quality scan (SonarQube — C-04 resolved 2026-05-27; ADR-011)
sonar-scanner \
  -Dsonar.projectKey=construction-os \
  -Dsonar.sources=. \
  -Dsonar.host.url=$SONAR_HOST_URL \
  -Dsonar.login=$SONAR_TOKEN
# Quality gate must be GREEN (0 bugs, 0 vulnerabilities, ≥80% line coverage, ≥70% branch coverage)

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

- [ ] PDPA data flow reviewed and documented in `docs/compliance/data-flow-map.md`
- [ ] Rate limiting verified via load test (k6): no tenant can exceed 100 req/min sustained
- [ ] DR runbook executed successfully in staging (RTO achieved < 30 minutes)
- [ ] API backward compatibility: old mobile app version (N-1) tested against new backend
- [ ] Feature flags verified: all mandatory flags present and togglable to OFF in < 60 seconds
- [ ] SLO dashboard live in Grafana with correct thresholds per QM-14
- [ ] On-call rotation and PagerDuty escalation policy configured and tested (paging drill completed)
- [ ] Secrets rotation schedule defined in `docs/security/secrets-rotation-policy.md`; first rotation executed and verified in staging

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
  stub implementation behaviour is defined in `32-implementation-specifications` §32.9
- Version every HTTP API endpoint from `/api/v1/` on the first commit (QM-2; NestJS global prefix `api/v1` — source: `backend/src/main.ts`)
- Route all user-facing strings through i18n keys — never hardcode (QM-3)
- Tag all PII fields with `@pdpa(category: "...")` comment in Prisma schema (QM-5)
- Include `traceId` in every log entry and every error response (QM-8, QM-10)
- Propagate `traceparent` header across all HTTP and Kafka calls (QM-8)
- Write or update `docs/api/error-codes.md` when adding new error codes (QM-10)
- Create an ADR in `docs/architecture/adr/` for every architectural decision (QM-11)
- Validate database migrations for backward compatibility before applying (QM-9)
- Commit a rollback script alongside every database migration in `migrations/rollbacks/` (QM-9)
- Register every new Kafka schema in the Schema Registry before the first producer deployment (QM-9)
- Gate every user-facing feature and high-risk change behind a feature flag before production (QM-15)
- Include all required security headers in every HTTP response (QM-4)
- Use Zod (TypeScript) or Pydantic (Python) for all API input validation — never hand-written `if` checks alone (QM-4)
- Connect application to **PgBouncer** (transaction mode), never directly to PostgreSQL port 5432 (QM-18)
- Follow the entity-specific conflict resolution strategy from Phase 6 when implementing `ConflictHandler` (QM-9) — never invent a new strategy without an ADR
- Inject runtime secrets via **AWS Secrets Manager** (cloud/AWS EKS) or **HashiCorp Vault** (on-premise/hybrid) per spec §5.2 and ADR-013; store Kubernetes Secret objects in git only as **SealedSecret** via kubeseal (QM-4)
- Emit a Kafka event for every workflow state transition — all transitions in RFQ and PO state machines must produce a typed event via `@cos/shared` (master §9; spec §32.6)

**ROOT CAUSE PREVENTION RULES — applied on every implementation task (Rules 26–38):**

- Rule 26 — Before adding `import { X } from 'pkg'` to any source file, verify 'pkg' is in that package's own `package.json` (not root or another package). Add it if missing. (prevents missing runtime deps)
- Rule 27 — When adding any new script to any `package.json`, add the corresponding task to root `turbo.json` in the same commit. (prevents missing turbo tasks)
- Rule 28 — After any `package.json` change, run `pnpm install` locally and commit `pnpm-lock.yaml` in the same PR. CI `--frozen-lockfile` will fail without it. (prevents CI lockfile failure)
- Rule 29 — Before writing `(see ADR-NNN)` in any spec or code comment, verify `docs/architecture/adr/NNN-*.md` exists. Create the ADR first if it does not. (prevents dangling ADR references)
- Rule 30 — For async functions using `setTimeout` internally (retry, poller, backoff), use `jest.useFakeTimers()` in `beforeEach`, `jest.useRealTimers()` in `afterEach`, and `await jest.runAllTimersAsync()` — NOT `jest.runAllTimers()`. (prevents test hangs on multi-step retry chains)
- Rule 31 — "Generate: complete directory structure with placeholder README per service" means EVERY directory in the spec, including all `services/` and `packages/@cos/*`. "Tooling: X" means fully initialized (e.g., Husky = `.husky/pre-commit` exists, not just declared in `package.json`). tsconfig exceptions must be documented inline. (prevents incomplete scope)
- Rule 32 — `jest.config.js` is the single source of truth per package. Never add a `"jest"` key to `package.json` when `jest.config.js` exists in the same package. (prevents duplicate/conflicting jest config)
- Rule 33 — Use `import type { X } from 'pkg'` when X is only used for TypeScript type annotations (not runtime). Prevents Metro/webpack from bundling Node.js-only packages into mobile/browser builds. (prevents mobile bundle failures)
- Rule 34 — `@cos/shared` is imported by ALL platforms (mobile, PWA, Node.js). Never add a runtime import of any Node.js-only package (PrismaClient, native addons, server frameworks). Use `import type` for type-only references. (prevents mobile bundle failures)
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
  (prevents spec/context drift — root cause of WAF on-premise gap and JWT claim name inconsistency discovered 2026-06-01; agent had to be explicitly reminded both times)

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
  (prevents silent scope reduction — root cause of Phase 6 gaps: OpenSearch indexing,
  integration tests, ConflictRecord notification, `site.material.consumed`;
  discovered 2026-06-04)

### Never

- Call OpenAI SDK directly — always via `LLMProvider` interface
- Create microservices — monolith first, extract only when BOTH conditions met:
  (a) team ownership boundary clear AND (b) independent scaling pressure with evidence
- Add direct HTTP or gRPC calls between NestJS modules inside the monolith — use NestJS DI for synchronous cross-module calls and Kafka events for async; HTTP is only for cross-deployable communication (master §3; rule 3)
- Query another module's database tables directly from application code — cross-module data access must go through the owning module's service layer or via Kafka events (master §4)
- **Rely on `tenant_id` column filtering + RLS as the ONLY isolation mechanism** — schema-per-tenant (`SET LOCAL search_path = {tenant_code}`, where `{tenant_code}` is the tenant's schema name, e.g., `acme_corp`) is the mandatory baseline (source: master §Phase 2); row-level security (RLS) may be added as secondary defense-in-depth only at Phase 16; never replace schema isolation with RLS alone
- Implement BigQuery or Snowflake — analytics uses ClickHouse only
- Use IndexedDB in React Native — smartphone uses **WatermelonDB 0.28.x + ExpoSQLiteAdapter** for all main business entities (site_reports, issues, local_photos, etc.); `expo-sqlite` directly is allowed **only** for the `sync_queue` infrastructure table; plain `expo-sqlite` for any other entity is prohibited (Phase 10 authoritative)
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
context/00_master_construction_os.md                — MASTER: all decisions, all phases, all EPs
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
docs/specifications/                                — Architecture diagrams and system design reference

# Readiness & Verification
scripts/readiness/verify-production-readiness.sh    — Auto-verify 30 [AUTO] checks (Phase 19)
scripts/readiness/run-all-checks.sh                 — Interactive verify 14 [MANUAL] checks (Phase 19)
scripts/readiness/check-openapi-freshness.sh        — Verify OpenAPI spec exists, is valid YAML/JSON, version present, live sync if INGRESS_HOST set (Phase 18)
scripts/readiness/check-i18n-completeness.sh        — Verify all i18n keys are translated (Phase 18)
scripts/readiness/check-security-headers.sh         — Verify all required HTTP security headers on ingress (HSTS, X-Content-Type-Options, X-Frame-Options, CSP, Referrer-Policy, Permissions-Policy) + TLS 1.3 (Phase 16)
scripts/readiness/check-schema-registry.sh          — Verify Kafka Schema Registry connectivity, BACKWARD_TRANSITIVE compatibility mode, all critical v1 schemas registered per spec §32.4 event table, local .avsc files valid JSON (Phase 8)
scripts/loadtest/api-baseline.js                    — k6 load test: 100 VU × 5 min mixed-read baseline gate; P95 read < 300ms, P95 write < 500ms, error rate < 0.1% (QM-6; Phase 18)

# Compliance & Governance
docs/compliance/data-flow-map.md                    — PDPA/GDPR data flow documentation (Phase 16)
docs/compliance/data-retention-policy.md            — Data retention rules per entity type (Phase 16)
docs/compliance/log-retention-policy.md             — Log retention schedule and archival policy (Phase 15)
docs/compliance/data-residency-policy.md            — Data residency requirements per region (Phase 17)
docs/compliance/soc2-controls.md                    — SOC 2 Type II control tracking (before Stage 2→3)
docs/i18n/localization-gaps.md                      — TH-specific rules with no i18n equivalent (Phase 3)

# Security
docs/security/secrets-rotation-policy.md            — Rotation schedule for all secret types (Phase 2)
docs/security/csp-policy.md                         — Content Security Policy definition (Phase 16)
docs/security/cors-policy.md                        — CORS allowed origins per environment (Phase 3)
docs/security/pentest-findings.md                   — External pentest findings and resolution status (before Stage 1→2)
infrastructure/terraform/aws/kms.tf                 — KMS customer-managed key definitions (Phase 17)

# API & Documentation
docs/api/                                           — OpenAPI 3.1 specs (auto-generated per service: auth.openapi.yaml, boq.openapi.yaml, etc.; QM-2 convention: docs/api/{service}.openapi.yaml)
docs/api/error-codes.md                             — Error code registry (COS-{DOMAIN}-{NNN}) (Phase 3)
docs/api/deprecation-schedule.md                    — API version sunset dates and tenant notification log (Phase 18)
docs/architecture/adr/                              — Architecture Decision Records (see directory for current list)
docs/architecture/adr/000-template.md              — ADR template
docs/architecture/adr/008-tenantprismaservice-schema-per-tenant.md — TenantPrismaService schema-per-tenant ORM pattern (Phase 2)
docs/architecture/adr/015-database-retry-helpers.md               — Database retry helper pattern for Prisma transient errors (Phase 1)

# SLO & Reliability
docs/slo/dashboard-registry.md                      — Grafana dashboard IDs per SLO (Phase 15)
docs/slo/monthly-reviews/                           — Monthly SLO review notes directory (Phase 19)

# Feature Flags
docs/feature-flags/cleanup-backlog.md               — Stale flags pending removal from code (Phase 3)

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
infrastructure/monitoring/otel-collector-config.yaml — OTel collector config (includes trace sampling configuration)
infrastructure/synthetics/                          — Synthetic monitoring probe definitions for Grafana Synthetic Monitoring / OpenTelemetry Collector (Phase 15)

# Stage Marker
.cos-stage                                          — Machine-readable current stage number; read by STEP 2 auto-detect
CHANGELOG.md                                        — Changelog with BREAKING CHANGE entries
```
