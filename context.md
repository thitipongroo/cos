# Construction OS — Agent Context

<!-- Last audited: 2026-05-31 | Version: 5.6.0 -->
<!-- v5.6.0 (2026-05-31): Phase 8 integration test spec made explicit (master v1.17.0):
     Phase 8 Generate — "Integration tests" now specifies:
       file path (packages/@cos/shared/test/kafka/kafka.integration.spec.ts),
       devDependencies (testcontainers + @testcontainers/kafka), script (test:integration),
       testing approach (KafkaContainer + mock SR + mock Redis), and exact test cases -->
<!-- v5.5.0 (2026-05-31): Commands made specific to prevent new-project recurrence (master v1.16.0):
     Phase 2: auth.openapi.yaml + tenant.openapi.yaml named explicitly
     Phase 2: MFA endpoints given explicit paths (/mfa/enroll, /verify, /authenticate)
     Phase 8: K8s manifests given explicit path (infrastructure/kubernetes/kafka/) + filenames
     Phase 1: README list expanded to all directories including all 10 backend/src/modules/* and all 11 packages/@cos/* -->
<!-- v5.4.0 (2026-05-31): Rule 37 added to Always section:
     Rule 37: Exhaustive verification before claiming completion —
       (a) read spec section line by line, (b) verify each item with ls/grep/cat output,
       (c) only summarize after all items have ✅ filesystem evidence.
       Prevents "I verified known issues" being reported as "everything is complete".
     Root cause: agent was checking known bugs only, not every Generate item —
       this pattern led to 6 missed deliverables despite claiming "all bugs fixed" -->
<!-- v5.3.0 (2026-05-31): Rules 27-36 added to Always section (runtime checklist for agent);
     Fixed MD032 blank line formatting around list block -->
<!-- v5.2.0 (2026-05-31): 4 long-term vulnerabilities fixed (master v1.13.0):
     V-01: context.md + context/ removed from .gitignore — rules now persist across git clone
     V-02: Phase 2 Generate — explicit npm packages list added (prevent missing deps in new project)
     V-03: Phase 2 Generate — ADR-008 added as deliverable (prevent dangling ADR reference)
     V-04: Phase 1 Generate — jest.config packages expanded to all 9 packages with logic
     Overall system grade: A (0 Critical, 0 Major, 0 Minor) -->
<!-- v5.1.0 (2026-05-31): Root cause prevention completed — Rules 33–36 added (master v1.12.0):
     Rule 33: Single source of truth for jest config — no duplicate jest key in package.json
     Rule 34: import type for non-runtime deps — prevent Mobile/Metro bundling Node.js-only packages
     Rule 35: @cos/shared must be framework-agnostic — no server-only runtime imports
     Rule 36: All @cos packages with executable logic must have unit tests + CI coverage
     Implementation: jest.config.js + test:cov scripts + unit tests added to
       @cos/financial (calculateLineTotal, convertCurrency, sumDecimals — QM-1 mutation testing)
       @cos/rbac (ROLE_PERMISSIONS, decorators), @cos/validation (IsCurrencyCode, IsDecimalString)
       @cos/logger (createLogger), @cos/tracing (initTracing/shutdown/getTraceId), @cos/config (loadConfig/getConfig)
     CI updated: all 9 packages now have coverage gates
     Overall system grade: A (0 Critical, 0 Major, 0 Minor) -->
<!-- v5.0.0 (2026-05-31): Root cause prevention — 6 new GLOBAL EXECUTION RULES added to master (v1.11.0):
     Rules 27–32 prevent recurring bugs found across Phase 1/2/8 implementation:
     Rule 27: package.json dependency sync before adding imports
     Rule 28: turbo.json sync when adding new scripts
     Rule 29: pnpm-lock.yaml must be committed after pnpm install
     Rule 30: ADR reference verification before writing (see ADR-NNN)
     Rule 31: jest.runAllTimersAsync() for async fake timer chains (not jest.runAllTimers())
     Rule 32: Generate section scope must be exhaustive (READMEs, Tooling init, tsconfig exceptions)
     Overall system grade: A (0 Critical, 0 Major, 0 Minor) -->
<!-- v4.9.0 (2026-05-31): Phase 2 implementation — FILE REFERENCE MAP updated:
     M-01 RESOLVED: docs/security/secrets-rotation-policy.md status corrected ⚠️ NOT YET CREATED → ✅ EXISTS (created in Phase 2);
     Overall system grade: A (0 Critical, 0 Major, 0 Minor) -->
<!-- v4.8.0 (2026-05-31): Phase 1 spec gap resolution — FILE REFERENCE MAP updated:
     M-01 RESOLVED: CHANGELOG.md status corrected ⚠️ NOT YET CREATED → ✅ EXISTS (file was created at repo init);
     M-02 RESOLVED: ADR-008 and ADR-015 added to FILE REFERENCE MAP (created 2026-05-31);
     Overall system grade: A (0 Critical, 0 Major, 0 Minor) -->
<!-- v4.7.0 (2026-05-29): cos-context-auditor re-audit (round 7) — 2 issues resolved:
     M-01 RESOLVED: GLOBAL EXECUTION RULES Never — added 2 inter-module coupling rules:
       "Add direct HTTP or gRPC calls between NestJS modules inside the monolith" (master §3; rule 3);
       "Query another module's database tables directly from application code" (master §4);
     m-01 RESOLVED: AWAITING_DECISION stub EP_ID example 'ECO-001' → 'EP-DOMAIN-001' with valid format comment (master §5; spec §32.3);
     Overall system grade: A (0 Critical, 0 Major, 0 Minor) -->
<!-- v4.6.0 (2026-05-29): cos-context-auditor re-audit (round 6) — 3 issues resolved:
     M-01 RESOLVED: AES-256 encryption standard added — master Security Requirements + QM-4 + Never rule (spec §5.2);
     M-02 RESOLVED: Mobile component enforcement rules added to GLOBAL EXECUTION RULES Never section (master §8; spec §32.7);
     m-01 RESOLVED: Stage names aligned to file headers — ECOSYSTEM→ECOSYSTEM DOMINANCE, COORDINATION→INDUSTRY COORDINATION
       in STEP 2 list, STEP 3 table, and FILE REFERENCE MAP;
     Overall system grade: A (0 Critical, 0 Major, 0 Minor) -->
<!-- v4.5.0 (2026-05-29): cos-context-auditor re-audit (round 5) — 4 issues resolved:
     M-01 RESOLVED: master FINAL EXECUTION ORDER — Event Infrastructure dep Phase 1 → Phase 2 (spec §32.1);
     M-02 RESOLVED: master WORKFLOW ENGINE SPEC RFQ — EVALUATED→AWARDED/CANCELLED PROC_MANAGER → PROCUREMENT_OFFICER (spec §32.6 + §6.2);
     m-01 RESOLVED: QM-4 TLS policy spec reference corrected §05 §8.3 → §05 §5.2;
     m-02 RESOLVED: master rule 25 duplicate renumbered to 26; STEP 1 rule count updated 1–25 → 1–26;
     Overall system grade: A (0 Critical, 0 Major, 0 Minor) -->
<!-- v4.4.0 (2026-05-29): cos-context-auditor re-audit (round 4) — 8 issues resolved:
     M-01 RESOLVED: master §6 BASE EVENT ENVELOPE — added event_version field (spec §32.4);
     M-02 RESOLVED: GLOBAL EXECUTION RULES — added 2 Workflow Engine rules:
       Always: "Emit a Kafka event for every workflow state transition" (spec §32.6);
       Never: "Invent workflow states or transitions beyond WORKFLOW ENGINE SPEC" (master §9);
     M-03 RESOLVED: FILE REFERENCE MAP — 14 unflagged paths now tagged ⚠️ NOT YET CREATED with phase notes;
     m-01 RESOLVED: master Stage 1 name corrected "Single Tenant MVP" → "Multi-tenant MVP" (spec §32.1);
     m-02 RESOLVED: spec §32.3 + master EP stub templates now include EP_VERSION field;
     m-NEW-1 RESOLVED: master §6 migration note updated — Group A MIGRATED (16 files deleted 2026-05-29);
     m-NEW-2 RESOLVED: spec §32.4 migration counts updated — 46 files (15 canonical + 31 non-canonical);
     SPEC-Q RESOLVED: spec §32.6 Workflow Rules — "must" → "MUST" for state transition Kafka rule;
     Overall system grade: A (0 Critical, 0 Major, 0 Minor) -->
<!-- v4.3.1 (2026-05-27): cos-context-auditor re-audit (round 3) — 2 issues resolved:
     M-01 RESOLVED: master RBAC Role Definitions table — 3 spec §6.2 roles were missing:
       EXECUTIVE, SAFETY_OFFICER, CRM_SALES_MANAGER added to authoritative table;
       sub-roles (PROC_MANAGER, SITE_WORKER, VIEWER) labeled as implementation sub-roles;
       EXECUTIVE now defined for lines that reference it in workflow approval rules;
       SAFETY_OFFICER now defined for line that references it in safety permit workflow;
     m-01 RESOLVED: FILE REFERENCE MAP ADR count stale — "001–009" → "001–014"
       (ADRs 010-014 were created during this session and exist on disk);
     Overall system grade: A (0 Critical, 0 Major, 0 Minor) -->
<!-- v4.3.0 (2026-05-27): PO decisions applied — final 2 open items resolved:
     C-02 RESOLVED: Secrets management — conditional per deployment type (spec §5.2; ADR-013 created);
       QM-4 No secrets: HashiCorp Vault unconditional → AWS SM (cloud/EKS) or Vault (on-prem/hybrid);
       QM-4 Secrets rotation: unconditional Vault → conditional (AWS SM Lambda cloud; Vault DB engine on-prem);
       Always rule: Vault unconditional → conditional; Never rule: Vault unconditional → conditional;
       master infrastructure stack + Phase 2 Secret Management + Phase 19 Secret Management updated;
     C-03 RESOLVED: RBAC role identifiers aligned to spec §6.2 (ADR-014 created);
       SITE_MANAGER → SITE_ENGINEER (3 occurrences);
       FINANCE_OFFICER → FINANCE (1 occurrence);
       master: SITE_MANAGER → SITE_ENGINEER (9), PROC_OFFICER → PROCUREMENT_OFFICER (6),
               FINANCE_OFFICER → FINANCE (13), SUPER_ADMIN → SYSTEM_ADMIN (1);
       master RBAC Role Definitions table reformatted and aligned to spec -->
<!-- v4.2.0 (2026-05-27): PO decisions applied — 3 open items resolved:
     C-01 RESOLVED: Kong Gateway for rate limiting (spec §4.8; ADR-010 created);
       QM-7 updated: NestJS ThrottlerModule → Kong Gateway; master API Gateway section updated;
     C-04 RESOLVED: SonarQube for SAST + code quality (spec §30.10, §30.12; ADR-011 created);
       QM-4 SAST updated: semgrep → SonarQube; Phase 19 check #4 updated to sonar-scanner;
     C-05 RESOLVED: ArgoCD for GitOps CD (spec §4.9; ADR-012 created);
       master Phase 17 pipeline updated: GitHub Actions CI-only + ArgoCD CD;
       master Phase 19 CI/CD checks updated to ArgoCD commands;
       master infrastructure stack: ArgoCD AWAITING_DECISION → RESOLVED;
     OPEN (unchanged): C-02 Vault vs AWS SM; C-03 RBAC role names -->
<!-- v4.1.0 (2026-05-27): cos-context-auditor re-audit (round 2) — 6 issues resolved:
     C-NEW-2 RESOLVED: 5 canonical event names in master §6 corrected per spec §32.4:
       events 5,6,9,10,13 had wrong domain prefix or wrong entity segment;
       spec §32.4 is authoritative; all 15 cross-service contract names now match spec exactly;
     M-NEW-1 RESOLVED: master Phase 20 Notification Service — WebSocket→SSE (spec §19.2);
       FCM-only→Expo Push Notifications APNs+FCM (expo-server-sdk; direct FCM misses iOS);
     M-NEW-2 RESOLVED: Phase 20 trigger events corrected (inspection.failed domain: construction→site;
       site_report trigger event: construction.site_report.submitted.v1→site.report.created.v1);
     M-NEW-3 RESOLVED: EP-INFRA-004 EmailProvider — annotated PARTIAL-RESOLUTION (spec §19.7:
       SendGrid MVP → AWS SES production);
     m-NEW-1 RESOLVED: master blockquote header Version/date corrected (1.0/2026-05-26→1.3/2026-05-27);
     m-NEW-2 RESOLVED: check-schema-registry.sh CRITICAL_SCHEMAS — 8→15 schemas (all spec §32.4 events);
     OPEN (unchanged): C-01 Kong vs NestJS; C-02 Vault vs AWS SM; C-03 RBAC role names;
       C-04 SonarQube vs semgrep; C-05 ArgoCD vs GitHub Actions -->
<!-- v4.0.0 (2026-05-27): cos-context-auditor full audit — 15 issues resolved:
     C-NEW-1 RESOLVED: Kafka compatibility BACKWARD → BACKWARD_TRANSITIVE (QM-9, master §6, master Rule 24, master Phase 19 AUTO check, check-schema-registry.sh);
     M-1 RESOLVED: QM-1 + Phase 19 coverage check + master Phase 18 + master Rule 11 — added 70% branch coverage gate (spec §30.3);
     M-9 RESOLVED: QM-2 deprecation window 6 months → 12 months (spec §14.4);
     M-7 RESOLVED: QM-6 + QM-14 latency targets corrected — read p95 500ms→300ms, write p95 800ms→500ms (spec §31.6);
     M-8 RESOLVED: QM-14 availability — added SMB (99.5%) and Enterprise (99.95%) tiers alongside Mid-market (99.9%) (spec §31.6);
     M-10 RESOLVED: QM-8 CloudWatch Logs replaced with Loki (spec §31.2 + master Phase 15);
     M-11 RESOLVED: QM-8 CloudWatch alarms replaced with Alertmanager/Prometheus (spec §31.7 + master Phase 15);
     m-2 RESOLVED: QM-8 sampling strategy head-based→tail-based; 1% production rate (spec §31.5); master Phase 15 sampling rate 10%→1%;
     m-3 RESOLVED: FILE REFERENCE MAP — 6 existing runbooks added (ai-readiness-checklist, db-failover, kafka-partition-rebalance, keycloak-realm-recovery, keycloak-realm-backup, temporal-worker-restart);
     m-4 RESOLVED: FILE REFERENCE MAP infrastructure/synthetics/ label CloudWatch Synthetics → OpenTelemetry/Prometheus;
     M-5 RESOLVED: master CROSS-SERVICE EVENT CONTRACT — all 15 events annotated with canonical names {domain}.{entity}.{action}.v{N}; Phase 20 notification triggers updated; event_type envelope updated;
     M-4 RESOLVED: Apache Iceberg added to master GLOBAL SYSTEM CONTEXT COMMAND infrastructure stack + Phase 17 cold storage;
     M-6 RESOLVED: Debezium CDC (Path 2 — data lake replication) added to master infrastructure stack + Phase 8 stub EP-INFRA-005;
     M-12 RESOLVED: PO approval thresholds added to master WORKFLOW ENGINE SPEC (≤50K THB → PM; 50K-500K → PM+Finance; >500K → PM+Finance+Executive);
     M-2 FLAGGED C-04 AWAITING_DECISION: SonarQube (spec §30.10) vs semgrep (current) — ADR required before Stage 1→2;
     M-3 FLAGGED C-05 AWAITING_DECISION: ArgoCD (spec §4.9) vs GitHub Actions+kubectl (current) — ADR required before Stage 1→2;
     OPEN (requires PO): C-01 Kong vs NestJS; C-02 Vault vs AWS SM; C-03 RBAC role names -->
<!-- v3.9.0 (2026-05-26): cos-context-auditor audit — C-05 RESOLVED: master API paths /v1/ corrected to /api/v1/
     for Phases 3/4/6/7/11/12/13/14/15/18/21 (32 endpoints); M-03 ADR path in Always rule corrected
     (docs/adr/ → docs/architecture/adr/); M-04 ADR template created
     (docs/architecture/adr/000-template.md); M-05 OpenAPI path in FILE REFERENCE MAP + QM-2
     corrected to per-service naming (docs/api/{service}.openapi.yaml); M-06 PgBouncer config dir
     flagged as NOT YET CREATED in QM-18; master v1.0 → v1.1 (all above applied to master too);
     OPEN (requires PO): C-01 Kong vs NestJS; C-02 Vault vs AWS SM; C-03 RBAC role names §06 vs master -->
<!-- Change: Production-grade global scale upgrade —
     QM-13 multi-region architecture, QM-14 SLI/SLO/error budget, QM-15 feature flags,
     QM-16 deployment safety, QM-17 incident management; QM-4 expanded (TLS/mTLS/WAF/
     security headers/secrets rotation/encryption at rest); QM-3 expanded (RTL/plural forms/
     BE calendar/UTF-8/locale negotiation); QM-8 expanded (log retention/trace sampling/
     synthetic monitoring); QM-9 Kafka schema registry made required; QM-12 production RTO
     tightened to 30 min; Phase 19 counts corrected (61 total: 39 auto + 22 manual);
     contradictory tenant isolation rule fixed; hardcoded local path removed;
     mutation testing added to QM-1; API deprecation communication added to QM-2 -->
<!-- v3.1.0 fixes (2026-05-24): GAP-1 QM-18 added (PgBouncer connection pool management);
     GAP-2 QM-9 extended (offline conflict resolution — 3 entity strategies + financial hold rule);
     GAP-3 QM-7 corrected (NestJS ThrottlerModule — removes false AWS API Gateway / Kong claim);
     GAP-4 QM-4 corrected (HashiCorp Vault + sealed-secrets — removes false AWS Secrets Manager claim);
     Global Execution Rules updated to match all four corrections -->
<!-- v3.2.0 fixes (2026-05-26): C-01 QM-4 TLS corrected (TLS 1.3 minimum — removes false TLS 1.2 claim; source: master §Phase 16 + spec §05);
     C-02 QM-4 WAF corrected (UNSPECIFIED EP — removes false mandatory AWS WAF claim; source: master §Phase 16);
     C-03 QM-18/NEVER corrected (schema naming {tenant_code} — removes false tenant_{id} format; source: master §Phase 2);
     M-01 FILE REFERENCE MAP corrected (Python stub base = ai/shared/stub_base.py, not extension-points/stub_logging_pattern.py);
     M-03 Phase 19 SECTION B gate corrected (QM-13 added to QUALITY MANDATES GATE);
     M-04 QM-4 mTLS corrected (Istio manages mTLS — removes false AWS Private CA claim; source: master tech stack);
     M-05 audit date updated (2026-05-26) -->
<!-- v3.8.0 (2026-05-26): cos-context-auditor audit — M-01 financial entity conflict rule added to master §Phase 6;
     M-02 docs/adr/ corrected to docs/architecture/adr/ in FILE REFERENCE MAP + QM-11;
     M-03 docs/runbooks/ corrected to docs/runbooks/ in FILE REFERENCE MAP + QM-12/16/17;
     M-04 OTel sampling config path corrected (infrastructure/monitoring/otel-collector-config.yaml);
     M-05 /v1/ paths in master Phase 9/10/20/22 updated to /api/v1/ (C-04 follow-up);
     M-06 TENANT_ADMIN corrected from "ADMIN" in Phase 19 checklist;
     m-01 Always rule corrected /v1/ → /api/v1/; m-02 stale "file 02" refs fixed in master Phase 19;
     m-03 master last_updated 2026-05-25 → 2026-05-26; m-04 cos-audit/.gitkeep created;
     m-05 infrastructure/synthetics/ flagged as NOT YET CREATED;
     OPEN: C-01 Kong vs NestJS (requires PO); C-02 Vault vs AWS SM (requires PO);
     C-03 RBAC role names spec §06 vs master (requires PO) -->
<!-- v3.7.0 (2026-05-26): C-04 RESOLVED — API path convention corrected to /api/v1/ (Option B: spec updated to match
     backend implementation; source: backend/src/main.ts setGlobalPrefix('api/v1'));
     QM-2 updated; QM-4 WAF rate limit paths updated (/v*/ → /api/v*/); QM-7 paths updated;
     QM-9 sync endpoint updated (/v1/sync/resolve → /api/v1/sync/resolve);
     waf.tf all patterns updated (^/v[0-9]+/ → ^/api/v[0-9]+/);
     api-baseline.js paths updated (/v1/ → /api/v1/);
     spec §05 v1.4.0; context/README.md API versioning row corrected;
     context/00_master_construction_os.md Phase 16 rate limit paths updated;
     C-04a/C-04b fixed: graph.controller.ts @Controller('v1/graph')→@Controller('graph'),
     finance.controller.ts @Controller('v1')→@Controller('') -->
<!-- v3.6.0 (2026-05-26): C-03 RESOLVED — file upload rate limit confirmed 20 req/min per spec §05 §5.5
     (product owner decision 2026-05-26); waf.tf requests_per_period=20; master Phase 16 updated;
     spec §05 §5.5 table updated; QM-4 WAF rate limit attribution corrected (spec §05, not QM-7) -->
<!-- v3.5.0 (2026-05-26): AUDIT FIXES — C-01 Cloudflare WAF paths corrected (/api/v* → /v*/; source: master §API versioning + context/README.md);
     C-02 k6 load test paths corrected (/api/v1/ → /v1/; same root cause);
     M-01 spec §05 §5.5 rate limit table paths corrected (/api/v*/ → /v*/);
     M-02 master Phase 16 WAF rate limit paths corrected; M-03 context/README.md date updated;
     C-03 file upload rate limit noted as pending — waf.tf + master used 10 pending decision -->

<!-- v3.4.0 (2026-05-26): C-02 WAF RESOLVED — Cloudflare WAF selected (EP-WAF-001 resolved from UNSPECIFIED);
     QM-4 WAF section updated with full Cloudflare architecture, rate limits, origin protection rules;
     spec §05 v1.3.0 + master §Phase 16 WAF block updated; Terraform + middleware + K8s artifacts created -->
<!-- v3.3.0 (2026-05-26): FILE REFERENCE MAP — 4 missing scripts created and flags updated:
     check-security-headers.sh (Phase 16); check-schema-registry.sh (Phase 8);
     check-openapi-freshness.sh (Phase 18); scripts/loadtest/api-baseline.js (QM-6 k6 gate, Phase 18);
     .cos-stage created (value: 1) — STEP 2 auto-detect now functional;
     check-i18n-completeness.sh remains ⚠️ NOT YET CREATED (Phase 18) -->

## ROLE

You are a **principal-level AI engineering agent** for **Construction OS** — an AI-native Construction Operating System built to operate at global enterprise scale.

Your responsibilities:

- Implement, review, debug, and evolve platform code to **production-grade, global-deployable quality**
- Follow all execution commands in `context/00_master_construction_os.md` — it is the agent-optimized execution view derived from `docs/specifications/`
- Never invent architecture or technology decisions — architecture decisions are authoritative in `docs/specifications/`; `context/00_master_construction_os.md` is the compiled execution view of those decisions
- Generate `extension_point()` stubs for anything UNSPECIFIED — never implement guesses
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
4. List any EPs you will generate stubs for

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

- **PgBouncer is the required connection pooler** for all environments (staging + production); deployed as a Kubernetes `Deployment` (not a sidecar) with a `PodDisruptionBudget` of `minAvailable: 1`; configuration committed to `infrastructure/kubernetes/pgbouncer/` (⚠️ NOT YET CREATED — create at Phase 17)
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
- Extend `StubBase` for every `extension_point()` — never implement guessed logic
- Log stub calls via `logStubCall()` (TypeScript) / `log_stub_call()` (Python) — never silent stubs
- All monetary calculations use `decimal.js` (TypeScript) or Python `decimal` module — never `float`
- All Kafka events must use typed contracts from `@cos/shared`
- Check `docs/specifications/` (§13.3-13.5, §22.6, §05-security-compliance §5.3.1) before implementing any EP — all EP decisions are documented there
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

**ROOT CAUSE PREVENTION RULES — applied on every implementation task (Rules 27–36, 2026-05-31):**

- Rule 27 — Before adding `import { X } from 'pkg'` to any source file, verify 'pkg' is in that package's own `package.json` (not root or another package). Add it if missing. (prevents missing runtime deps)
- Rule 28 — When adding any new script to any `package.json`, add the corresponding task to root `turbo.json` in the same commit. (prevents missing turbo tasks)
- Rule 29 — After any `package.json` change, run `pnpm install` locally and commit `pnpm-lock.yaml` in the same PR. CI `--frozen-lockfile` will fail without it. (prevents CI lockfile failure)
- Rule 30 — Before writing `(see ADR-NNN)` in any spec or code comment, verify `docs/architecture/adr/NNN-*.md` exists. Create the ADR first if it does not. (prevents dangling ADR references)
- Rule 31 — For async functions using `setTimeout` internally (retry, poller, backoff), use `jest.useFakeTimers()` in `beforeEach`, `jest.useRealTimers()` in `afterEach`, and `await jest.runAllTimersAsync()` — NOT `jest.runAllTimers()`. (prevents test hangs on multi-step retry chains)
- Rule 32 — "Generate: complete directory structure with placeholder README per service" means EVERY directory in the spec, including all `services/` and `packages/@cos/*`. "Tooling: X" means fully initialized (e.g., Husky = `.husky/pre-commit` exists, not just declared in `package.json`). tsconfig exceptions must be documented inline. (prevents incomplete scope)
- Rule 33 — `jest.config.js` is the single source of truth per package. Never add a `"jest"` key to `package.json` when `jest.config.js` exists in the same package. (prevents duplicate/conflicting jest config)
- Rule 34 — Use `import type { X } from 'pkg'` when X is only used for TypeScript type annotations (not runtime). Prevents Metro/webpack from bundling Node.js-only packages into mobile/browser builds. (prevents mobile bundle failures)
- Rule 35 — `@cos/shared` is imported by ALL platforms (mobile, PWA, Node.js). Never add a runtime import of any Node.js-only package (PrismaClient, native addons, server frameworks). Use `import type` for type-only references. (prevents mobile bundle failures)
- Rule 36 — Every `@cos/*` package with executable logic (functions/methods with a body) must have: `jest.config.js`, `test:cov` script, `jest`+`ts-jest` in devDeps, unit tests, and CI coverage. Packages with only types/interfaces are exempt. (prevents untested logic in shared packages)
- Rule 37 — **Exhaustive verification before claiming completion** — Before reporting any Phase, task, or bug-fix set as "complete" or "all done":
  (a) Read the relevant spec section (Generate / Constraints / Exit Criteria) **line by line**
  (b) For **each item**: run `ls`/`grep`/`cat` to verify it exists on disk — show the actual command output
  (c) Only then summarize — any item without ✅ filesystem evidence = NOT complete
  Never claim "complete" based on memory, partial checks, or only verifying known issues.
  The distinction that must be maintained: "I verified X" ≠ "everything is complete".
  (prevents overstating completion confidence — root cause of recurring missed deliverables)
- Rule 38 — **After modifying any file in `docs/specifications/`**, immediately grep `context.md` and `context/00_master_construction_os.md` for the changed section number, technology name, or keyword:

  ```bash
  grep -n "<changed-keyword>" context.md context/00_master_construction_os.md
  ```

  If grep finds a match → read that section, check consistency with the spec change, update in the same commit.
  If grep finds no match → no context update needed, proceed.
  Keywords to grep: section number (e.g. `§5.5`), technology name (e.g. `Cloudflare`), or the specific concept changed (e.g. `tenant_id`, `WAF`).
  (prevents spec/context drift — root cause of WAF on-premise gap and JWT claim name inconsistency discovered 2026-06-01; agent had to be explicitly reminded both times)

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
- If EP is UNSPECIFIED → generate stub, do not guess implementation
- If `context/00_master_construction_os.md` conflicts with `docs/specifications/` → specs win; report discrepancy to product owner before implementing
- If two spec files in `docs/specifications/` conflict → consult `32-implementation-specifications.md` first; if still unclear → ask product owner before implementing
- If a quality mandate conflicts with a feature request → quality mandate wins; escalate to product owner if blocker

---

## AWAITING_DECISION PROTOCOL (files 05–11)

When loading context files `05_*` through `11_*`, each file contains a `## REQUIRED DECISIONS` section.

> Note: Stages 1–3 use fully specified implementation details — no open architectural decisions remain at that point. Stages 4–10 enter territory with genuine uncertainty; decisions must be made before implementation can proceed.

Execute in this order — do not wait for answers before generating stubs:

### Step 1 — Review REQUIRED DECISIONS for completeness

Before generating stubs, read the `## REQUIRED DECISIONS` section and ask:

- ผลจาก stage ก่อนหน้าสร้าง requirement ใหม่อะไรที่ยังไม่มีในรายการนี้? (What new requirements did the previous stage create that are not yet in this list?)
- production data ที่สะสมมา บอกอะไรที่ทำให้ต้องตัดสินใจเพิ่มอีกบ้าง? (What does accumulated production data tell us about additional decisions needed?)
- technology landscape เปลี่ยนไปจนมี option ใหม่ที่ควรถามหรือไม่? (Has the technology landscape changed enough to introduce new options worth asking about?)
- Are there any new compliance or data sovereignty requirements introduced by the new target markets?

ถ้าพบว่าขาด — เพิ่มคำถามใหม่เข้าไปใน `## REQUIRED DECISIONS` ของไฟล์นั้นก่อนดำเนินการต่อ
Format: `[ ] [ID]-NEW-NNN: [question] — affects: [component]`

### Step 2 — Generate stubs immediately

For every `Generate:` item in the file, create a stub tagged `AWAITING_DECISION`:

```typescript
// AWAITING_DECISION: [DECISION_ID] — [question summary]
// Implement after product owner answers: [question]
class StubEcosystemInteroperabilityFramework extends StubBase {
  readonly EP_ID = 'EP-DOMAIN-001'; // format: EP-{DOMAIN}-{NUMBER}; valid codes: AUTH,TENANT,FINANCE,PROC,AI,INFRA,DATA,MOBILE,DOMAIN
  readonly EP_VERSION = '0.1.0'; // semver: increment when contract changes
  readonly TRIGGER = 'Product owner decides: REST / GraphQL / gRPC / AsyncAPI';
  readonly PHASE = 'Stage N — [Stage Name]'; // replace with current stage

  async buildInteroperabilitySpec(): Promise<unknown> {
    this.logStubCall('buildInteroperabilitySpec');
    return {};
  }
}
```

### Step 3 — Ask product owner all questions

Present all `[ ]` items from the REQUIRED DECISIONS block — including any newly added ones from Step 1.
Format: "ก่อน implement stage นี้จริง ต้องการคำตอบจาก product owner ดังนี้: ... / Before implementing this stage, the following decisions are required from the product owner: ..."

### Step 4 — Continue working with stubs

Do not block on answers. Stubs allow the rest of the system to compile and run.
When product owner answers a question → replace the corresponding stub with real implementation.
Update `EP_VERSION` in the stub/implementation when the contract changes.

### AWAITING_DECISION vs UNSPECIFIED

- `UNSPECIFIED` = not yet time to implement (waiting for data or trigger event)
- `AWAITING_DECISION` = waiting for product owner answer (can implement immediately once answered)

---

## EXTENSION POINT PROTOCOL

When you encounter `generate extension_point()` in any spec:

1. Create stub class extending `StubBase`:
   - Python: `from ..stub_base import StubBase` (`ai/shared/stub_base.py`)
2. Set `EP_ID`, `EP_VERSION` (start at `0.1.0`), `TRIGGER`, `PHASE` properties
3. Call `this.logStubCall(method, context)` / `self.log_stub_call(method, context)` in every method
4. Return safe default value (empty, zero, or false — never throw unless specified)
5. Document EP decision in the relevant spec file in `docs/specifications/` (e.g., §13.3-13.5 for domain integrations, §22.6 for AI, §05-security-compliance §5.3.1 for compliance)

**When a stub becomes a real implementation:**

- Bump `EP_VERSION` (patch for non-breaking, minor for new contract, major for breaking change)
- Mark EP as implemented in the relevant `docs/specifications/` file
- Write or update contract tests for the EP's public interface
- If the EP contract changed since STUB → create an ADR documenting the decision

Do NOT implement business logic for UNSPECIFIED EPs.

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

# Extension Points
ai/shared/stub_base.py                              — Python stub base class (actual location; used via `from ai.shared.stub_base import StubBase`)
infrastructure/terraform/aws/ep_cloudwatch_alarms.tf — ⚠️ STALE — predates Prometheus/Alertmanager migration; review for replacement with Alertmanager alert rules
.github/workflows/ep_phase_gate.yml                 — GitHub Actions for phase-based EP triggers

# Readiness & Verification
scripts/readiness/verify-production-readiness.sh    — Auto-verify 30 [AUTO] checks (original script)
scripts/readiness/run-all-checks.sh                 — Interactive verify 14 [MANUAL] checks (original script)
scripts/readiness/check-openapi-freshness.sh        — ✅ CREATED 2026-05-26 — Verify OpenAPI spec exists, is valid YAML/JSON, version present, live sync if INGRESS_HOST set (Phase 18)
scripts/readiness/check-i18n-completeness.sh        — ⚠️ NOT YET CREATED — Verify all i18n keys are translated (create at Phase 18)
scripts/readiness/check-security-headers.sh         — ✅ CREATED 2026-05-26 — Verify all required HTTP security headers on ingress (HSTS, X-Content-Type-Options, X-Frame-Options, CSP, Referrer-Policy, Permissions-Policy) + TLS 1.3 (Phase 16)
scripts/readiness/check-schema-registry.sh          — ✅ CREATED 2026-05-26 — Verify Kafka Schema Registry connectivity, BACKWARD_TRANSITIVE compatibility mode (not BACKWARD — spec §32.4; C-NEW-1 resolved 2026-05-27), all critical v1 schemas registered per spec §32.4 event table, local .avsc files valid JSON (Phase 8)
scripts/loadtest/api-baseline.js                    — ✅ CREATED 2026-05-26 — k6 load test: 100 VU × 5 min mixed-read baseline gate; P95 read < **300ms**, P95 write < 500ms, error rate < 0.1% (QM-6; Phase 18; M-7 resolved 2026-05-27 — targets corrected per spec §31.6)

# Compliance & Governance
docs/compliance/data-flow-map.md                    — ⚠️ NOT YET CREATED — PDPA/GDPR data flow documentation (create at Phase 16)
docs/compliance/data-retention-policy.md            — ⚠️ NOT YET CREATED — Data retention rules per entity type (create at Phase 16)
docs/compliance/log-retention-policy.md             — ⚠️ NOT YET CREATED — Log retention schedule and archival policy (create at Phase 15)
docs/compliance/data-residency-policy.md            — ⚠️ NOT YET CREATED — Data residency requirements per region (create at Phase 17)
docs/compliance/soc2-controls.md                    — ⚠️ NOT YET CREATED — SOC 2 Type II control tracking (create before Stage 2→3)
docs/i18n/localization-gaps.md                      — ⚠️ NOT YET CREATED — TH-specific rules with no i18n equivalent (create at Phase 3)

# Security
docs/security/secrets-rotation-policy.md            — ✅ CREATED 2026-05-31 — Rotation schedule for all secret types (created at Phase 2)
docs/security/csp-policy.md                         — ⚠️ NOT YET CREATED — Content Security Policy definition (create at Phase 16)
docs/security/cors-policy.md                        — ⚠️ NOT YET CREATED — CORS allowed origins per environment (create at Phase 3)
docs/security/pentest-findings.md                   — ⚠️ NOT YET CREATED — External pentest findings and resolution status (create before Stage 1→2)
infrastructure/terraform/aws/kms.tf                 — ⚠️ NOT YET CREATED — KMS customer-managed key definitions (create at Phase 17)

# API & Documentation
docs/api/                                           — OpenAPI 3.1 specs (auto-generated per service: auth.openapi.yaml, boq.openapi.yaml, etc.; QM-2 convention: docs/api/{service}.openapi.yaml)
docs/api/error-codes.md                             — ⚠️ NOT YET CREATED — Error code registry (COS-{DOMAIN}-{NNN}) (create at Phase 3)
docs/api/deprecation-schedule.md                    — ⚠️ NOT YET CREATED — API version sunset dates and tenant notification log (create at Phase 18)
docs/architecture/adr/                              — Architecture Decision Records (see directory for current list)
docs/architecture/adr/000-template.md              — ADR template
docs/architecture/adr/008-tenantprismaservice-schema-per-tenant.md — ✅ CREATED 2026-05-31 — TenantPrismaService schema-per-tenant ORM pattern (Phase 2)
docs/architecture/adr/015-database-retry-helpers.md               — ✅ CREATED 2026-05-31 — Database retry helper pattern for Prisma transient errors (Phase 1)

# SLO & Reliability
docs/slo/dashboard-registry.md                      — ⚠️ NOT YET CREATED — Grafana dashboard IDs per SLO (create at Phase 15)
docs/slo/monthly-reviews/                           — ⚠️ NOT YET CREATED — Monthly SLO review notes directory (create at Phase 19)

# Feature Flags
docs/feature-flags/cleanup-backlog.md               — ⚠️ NOT YET CREATED — Stale flags pending removal from code (create at Phase 3)

# Runbooks
docs/runbooks/disaster-recovery.md               — DR runbook (✅ EXISTS — primary DR procedure)
docs/runbooks/disaster-recovery/                 — ⚠️ NOT YET CREATED — DR runbooks per failure scenario (structured dir; create at Phase 16)
docs/runbooks/disaster-recovery/drill-log.md     — ⚠️ NOT YET CREATED — DR drill results and RTO measurements
docs/runbooks/deployment-windows.md              — ⚠️ NOT YET CREATED — Approved production deployment windows
docs/runbooks/releases/                          — ⚠️ NOT YET CREATED — Per-release deployment runbooks
docs/runbooks/on-call-rotation.md                — ⚠️ NOT YET CREATED — On-call schedule and escalation path
docs/runbooks/postmortem-template.md             — ⚠️ NOT YET CREATED — Blameless post-mortem template
docs/runbooks/deployment.md                      — ✅ EXISTS — deployment checklist
docs/runbooks/rollback.md                        — ✅ EXISTS — rollback runbook
docs/runbooks/incident-response.md               — ✅ EXISTS — incident response runbook
docs/runbooks/production-readiness.md            — ✅ EXISTS — production readiness checklist
docs/runbooks/ai-readiness-checklist.md          — ✅ EXISTS — AI feature activation checklist (m-3 resolved 2026-05-27)
docs/runbooks/db-failover.md                     — ✅ EXISTS — PostgreSQL RDS Multi-AZ failover procedure (m-3 resolved 2026-05-27)
docs/runbooks/kafka-partition-rebalance.md       — ✅ EXISTS — Kafka consumer lag and partition rebalance procedure (m-3 resolved 2026-05-27)
docs/runbooks/keycloak-realm-recovery.md         — ✅ EXISTS — Keycloak realm recovery procedure (m-3 resolved 2026-05-27)
docs/runbooks/keycloak-realm-backup.md           — ✅ EXISTS — Keycloak realm daily backup (CronJob spec) (m-3 resolved 2026-05-27)
docs/runbooks/temporal-worker-restart.md         — ✅ EXISTS — Temporal.io worker restart and stuck workflow recovery (m-3 resolved 2026-05-27)

# Audit
cos-audit/                                          — Product owner sign-off audit logs (git-ignored content, directory committed)

# Observability Infrastructure
infrastructure/monitoring/otel-collector-config.yaml — OTel collector config (includes trace sampling configuration)
infrastructure/synthetics/                          — ⚠️ NOT YET CREATED — Synthetic monitoring probe definitions for Grafana Synthetic Monitoring / OpenTelemetry Collector (create at Phase 15; m-4 resolved 2026-05-27 — CloudWatch Synthetics removed; observability stack is Prometheus/Loki/Jaeger/Grafana per spec §31.2)

# Stage Marker
.cos-stage                                          — ✅ CREATED 2026-05-26 (value: "1") — Machine-readable current stage number; read by STEP 2 auto-detect in context.md
CHANGELOG.md                                        — ✅ EXISTS — Changelog with BREAKING CHANGE entries (created at repo init)
```
