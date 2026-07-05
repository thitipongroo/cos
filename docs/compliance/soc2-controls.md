# Construction OS — SOC 2 Type II Control Tracking

> **Purpose:** Track implementation status of SOC 2 Type II Trust Service Criteria controls.
> Required before Stage 2→3 transition. Source: QM-5; spec §05-security-compliance §5.3.1.
> Audit window target: 18 months from Stage 3 go-live.

---

## Trust Service Criteria

SOC 2 Type II covers five Trust Service Criteria (TSC). Construction OS targets: **Security (CC)**,
**Availability (A)**, and **Confidentiality (C)**.

---

## CC — Common Criteria (Security)

### CC1 — Control Environment

| Control ID | Description                                                | Implementation                                        | Status  |
| ---------- | ---------------------------------------------------------- | ----------------------------------------------------- | ------- |
| CC1.1      | COSO principle: commitment to integrity and ethical values | `docs/compliance/` policies in git; change-controlled | OPEN    |
| CC1.2      | Board/management oversight of internal controls            | Product owner review + ADR-based decisions            | OPEN    |
| CC1.3      | Organizational structure and reporting lines               | RBAC roles defined in `packages/@cos/rbac/`           | PARTIAL |
| CC1.4      | Competency and commitment of individuals                   | Onboarding runbook; access review quarterly           | OPEN    |
| CC1.5      | Accountability mechanisms                                  | Immutable audit log (Phase 2 `audit_logs` table)      | PARTIAL |

### CC2 — Communication and Information

| Control ID | Description                                                 | Implementation                                  | Status  |
| ---------- | ----------------------------------------------------------- | ----------------------------------------------- | ------- |
| CC2.1      | Information relevant to internal controls obtained and used | `@cos/logger` structured JSON logs; OTEL traces | PARTIAL |
| CC2.2      | Internal communication of control information               | Runbooks in `docs/runbooks/`; ADRs              | PARTIAL |
| CC2.3      | External communication of commitments and responsibilities  | Privacy policy; DPA templates; status page      | OPEN    |

### CC3 — Risk Assessment

| Control ID | Description                                                | Implementation                                     | Status  |
| ---------- | ---------------------------------------------------------- | -------------------------------------------------- | ------- |
| CC3.1      | Specifying objectives to identify and assess risk          | SLO targets defined (QM-14); risk register         | OPEN    |
| CC3.2      | Identifying and analyzing risks                            | Threat model in `docs/security/`; pentest findings | OPEN    |
| CC3.3      | Assessing fraud risk                                       | Audit trail; RBAC prevents unauthorized access     | PARTIAL |
| CC3.4      | Identifying significant changes affecting internal control | ADR process; migration backward-compat (QM-9)      | PARTIAL |

### CC4 — Monitoring Activities

| Control ID | Description                                 | Implementation                                                   | Status  |
| ---------- | ------------------------------------------- | ---------------------------------------------------------------- | ------- |
| CC4.1      | Ongoing / separate evaluations for controls | Grafana SLO dashboards; monthly reviews                          | PARTIAL |
| CC4.2      | Remediation of deficiencies                 | Post-mortem action items; `docs/runbooks/postmortem-template.md` | PARTIAL |

### CC5 — Control Activities

| Control ID | Description                                         | Implementation                                | Status  |
| ---------- | --------------------------------------------------- | --------------------------------------------- | ------- |
| CC5.1      | Mitigation actions to address risks                 | Feature flags (QM-15); canary deploys (QM-16) | PARTIAL |
| CC5.2      | Technology controls implemented for risk mitigation | PgBouncer (QM-18); RLS; mTLS; WAF             | PARTIAL |
| CC5.3      | Relevant policies and procedures deployed           | This document + all `docs/compliance/`        | PARTIAL |

### CC6 — Logical and Physical Access

| Control ID | Description                                                     | Implementation                                                  | Status  |
| ---------- | --------------------------------------------------------------- | --------------------------------------------------------------- | ------- |
| CC6.1      | Logical access security software, infrastructure, architectures | Keycloak OIDC; RS256 JWT; MFA; Kong rate limiting               | PARTIAL |
| CC6.2      | Access provisioning and deprovisioning                          | RBAC + Keycloak user management (Phase 2)                       | PARTIAL |
| CC6.3      | Restrictions on access based on least privilege                 | Role matrix in `packages/@cos/rbac/src/roles.ts`                | PARTIAL |
| CC6.4      | Credential management and rotation                              | `docs/security/secrets-rotation-policy.md`; AWS Secrets Manager | PARTIAL |
| CC6.5      | Disposal of data                                                | Data retention policy; right-to-erasure (PDPA §41)              | OPEN    |
| CC6.6      | Logical access from unauthorized systems                        | WAF (Cloudflare + Kong); VPC SG; mTLS                           | PARTIAL |
| CC6.7      | Transmission of data with encryption                            | TLS 1.3 minimum; SSE-KMS at rest                                | PARTIAL |
| CC6.8      | Malware prevention                                              | ClamAV file scan (Phase 9); `pnpm audit`; Trivy                 | PARTIAL |

### CC7 — System Operations

| Control ID | Description                                           | Implementation                                      | Status      |
| ---------- | ----------------------------------------------------- | --------------------------------------------------- | ----------- |
| CC7.1      | Detecting and monitoring for new vulnerabilities      | `pnpm audit`; `pip-audit`; `govulncheck` in CI      | PARTIAL     |
| CC7.2      | Monitoring system components for anomalies            | Prometheus alerts; Grafana dashboards; Alertmanager | PARTIAL     |
| CC7.3      | Evaluating security events                            | Incident response runbook; on-call rotation         | PARTIAL     |
| CC7.4      | Responding to identified security incidents           | `docs/runbooks/incident-response.md`                | IMPLEMENTED |
| CC7.5      | Identifying, developing, and implementing remediation | Post-mortem action items; ADRs                      | PARTIAL     |

### CC8 — Change Management

| Control ID | Description                         | Implementation                                        | Status  |
| ---------- | ----------------------------------- | ----------------------------------------------------- | ------- |
| CC8.1      | Infrastructure and software changes | GitHub PR review; CI gates; blue-green deploy (QM-16) | PARTIAL |

### CC9 — Risk Mitigation

| Control ID | Description                         | Implementation                                     | Status  |
| ---------- | ----------------------------------- | -------------------------------------------------- | ------- |
| CC9.1      | Risk mitigation activities          | Feature flags; staged rollouts; automated rollback | PARTIAL |
| CC9.2      | Business continuity and vendor risk | DR runbooks; multi-AZ; DR drills (QM-12)           | PARTIAL |

---

## A — Availability

| Control ID | Description                                          | Implementation                           | Status  |
| ---------- | ---------------------------------------------------- | ---------------------------------------- | ------- |
| A1.1       | Current processing capacity and performance          | ClickHouse + PgBouncer; HPA Kubernetes   | PARTIAL |
| A1.2       | Environmental, regulatory, and technological changes | ADR process; QM-9 backward compat        | PARTIAL |
| A1.3       | Recovery from environmental failures                 | DR runbooks; RDS Multi-AZ; WAL streaming | PARTIAL |

---

## C — Confidentiality

| Control ID | Description                                          | Implementation                                  | Status  |
| ---------- | ---------------------------------------------------- | ----------------------------------------------- | ------- |
| C1.1       | Identifying and maintaining confidential information | Data classification (QM-5); `@pdpa` Prisma tags | PARTIAL |
| C1.2       | Disposing of confidential information                | Retention policy; anonymization-in-place        | OPEN    |

---

## Status legend

| Status        | Meaning                                          |
| ------------- | ------------------------------------------------ |
| `OPEN`        | Not yet implemented; required before SOC 2 audit |
| `PARTIAL`     | Partially implemented; gaps identified           |
| `IMPLEMENTED` | Evidence collected; ready for auditor review     |

---

## Evidence collection

Before SOC 2 Type II audit (target: Stage 3 + 18 months):

1. For each `IMPLEMENTED` control — collect screenshot / export / log extract as evidence
2. Evidence stored in a secure, auditor-accessible location (not in this git repo)
3. Evidence review by product owner prior to audit window opening

---

## Review schedule

| Event                  | Action                                    |
| ---------------------- | ----------------------------------------- |
| Stage 2 → Stage 3 gate | All CC6.x and CC7.x must be `IMPLEMENTED` |
| Stage 3 go-live        | Begin 18-month audit observation window   |
| Every 6 months         | Review all `PARTIAL` items; update status |
