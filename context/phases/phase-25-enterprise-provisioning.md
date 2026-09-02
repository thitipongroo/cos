# Phase 25 — Enterprise Provisioning

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase 2, 3, 20 · SaaS Maturity Stage 3.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Automate end-to-end dedicated DB provisioning for Enterprise tenants upon contract signing.

Triggers (both paths start the same Temporal workflow):
  Path A: SYSTEM_ADMIN → PATCH /api/v1/admin/tenants/:tenantId/mark-contracted
  Path B: CRM webhook  → POST /api/v1/platform/webhooks/enterprise-contract-signed
          (generic payload: { tenant_id, contract_reference? } — CRM-agnostic)

Workflow: EnterpriseProvisioningWorkflow (Temporal, task queue: enterprise-provisioning)
  Activity 1 — createRdsActivity:         AWS SDK CreateDBInstance
                                           class: db.t3.medium, 100 GB GP3, per-tenant KMS key
  Activity 2 — runMigrationsActivity:     prisma migrate deploy against new DB URL
  Activity 3 — assignDedicatedDbActivity: SET platform.tenants.dedicated_db_url
  [HUMAN GATE] notify SYSTEM_ADMIN; wait for signal (approve / abort) — no timeout
  Activity 4 — migrateDataActivity:       pg_dump + psql from shared DB
                                           (conditional: only if tenant has existing data AND signal = approve)
  Activity 5 — verifyRoutingActivity:     test query against dedicated DB; assert connectivity

Compensation (rollback per activity):
  createRds        → AWS SDK DeleteDBInstance
  assignDedicatedDb → SET dedicated_db_url = NULL
  migrateData      → no auto-rollback; SYSTEM_ADMIN must coordinate manually

Events emitted:
  platform.enterprise.contract_signed.v1  { tenant_id, contract_reference? }
  platform.enterprise.db_provisioned.v1   { tenant_id, rds_endpoint }

npm packages required in backend/package.json — add BEFORE implementing (Rule 26):
  dependencies: @aws-sdk/client-rds

Generate:

- PATCH /api/v1/admin/tenants/:tenantId/mark-contracted (NestJS controller + service + DTO)
- POST /api/v1/platform/webhooks/enterprise-contract-signed (new module: platform-webhook)
    SECURITY (MANDATORY — spec §34.6): verify HMAC-SHA256 signature on every webhook request.
      env: PLATFORM_WEBHOOK_SECRET
      1. Capture raw request body as Buffer via Fastify addContentTypeParser
      2. expectedSig = "sha256=" + HMAC-SHA256(secret, rawBody).hexDigest()
      3. Compare X-Webhook-Signature header vs expectedSig using timingSafeEqual (constant-time)
      4. Missing secret or missing rawBody → 500; missing or invalid signature → 401
- EnterpriseProvisioningWorkflow + 5 activities + compensation + worker (enterprise-provisioning)
- TypeScript interfaces: platform.enterprise.contract_signed.v1.ts + platform.enterprise.db_provisioned.v1.ts
- Avro schemas: platform.enterprise.contract_signed.v1.avsc + platform.enterprise.db_provisioned.v1.avsc
- Terraform module: infrastructure/terraform/modules/rds-tenant/ (main.tf + variables.tf + outputs.tf)
- Unit tests: 100% line + branch coverage (Rule 11)

Constraints:
- Workflow MUST be idempotent — re-triggering for same tenant_id must not create duplicate RDS
- Human gate (before Activity 4) must NOT timeout — wait indefinitely for approve/abort signal
- platform.* tables always stay on shared DB — never moved to dedicated (platform isolation rule)
- CRM webhook: generic payload only — no CRM-specific adapter in Phase 25
- Before marking Phase 25 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```
