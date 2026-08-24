# Construction OS — ISO/IEC 27001:2022 Control Tracking

> **Purpose:** Track implementation status of the ISO/IEC 27001:2022 Annex A controls. Named as the
> ISO 27001 controls tracker by spec §05-security-compliance §5.3.1 (alongside `soc2-controls.md`
> and `pdpa-controls.md`). Certification target: 12–18 months, audit workflow triggered **6 months
> before the Stage 2→3 transition** (§5.3.1). Standard version: **ISO/IEC 27001:2022** (spec §5,
> line 374).

---

## How to read this file

Same convention as `pdpa-controls.md`: every row states what the repository can be shown to contain
**today**, verified against the paths named in the Evidence column on the date in Verified. Nothing
here is aspirational — an unimplemented control reads `OPEN`, never `DONE`.

| Status    | Meaning                                                             |
| --------- | ------------------------------------------------------------------- |
| `DONE`    | Implemented and verifiable on disk today                            |
| `PARTIAL` | Mechanism exists but does not yet satisfy the control end-to-end    |
| `OPEN`    | Not implemented                                                     |
| `ORG`     | Organisational control — cannot be satisfied by code; needs process |

**Scope note.** ISO 27001 certifies a management system (ISMS), not a codebase. The Annex A rows
below are the technical subset a repository can evidence. Clauses 4–10 (context, leadership,
planning, support, operation, performance evaluation, improvement) are `ORG` in their entirety and
are **not** tracked here — they require an appointed ISMS owner, a Statement of Applicability, a
risk-treatment plan and management review records. None of those exist yet; that gap is the single
largest obstacle to certification and is tracked as `ISMS-00` below.

---

## Clause 4–10 — Management system

| ID      | Clause | Requirement                                        | Evidence                                                                                                                                     | Status    | Verified   |
| ------- | ------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| ISMS-00 | 4–10   | ISMS established, documented, and management-owned | None. No Statement of Applicability, risk-treatment plan, ISMS scope statement or review record                                              | `OPEN`    | 2026-08-03 |
| ISMS-01 | 6.1.2  | Information security risk assessment process       | Risk Register (`context/00_master_construction_os.md` § Risk Register, R-01..R-09) — reviewed at every stage gate. Not yet in ISO 27005 form | `PARTIAL` | 2026-08-03 |
| ISMS-02 | 9.2    | Internal audit programme                           | None                                                                                                                                         | `OPEN`    | 2026-08-03 |
| ISMS-03 | 10.2   | Nonconformity and corrective action                | Blameless post-mortem process (`docs/runbooks/postmortem-template.md`), incident severity + response targets (QM-17)                         | `PARTIAL` | 2026-08-03 |

---

## Annex A.5 — Organizational controls

| ID    | Annex A | Control                               | Evidence                                                                                                    | Status    | Verified   |
| ----- | ------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| A5-01 | A.5.1   | Policies for information security     | `docs/policies/` set, git change-controlled                                                                 | `PARTIAL` | 2026-08-03 |
| A5-07 | A.5.7   | Threat intelligence                   | CodeQL + Semgrep CE + Trivy in CI; `pnpm audit` / `pip-audit` / `govulncheck` dependency gates (ADR-011)    | `PARTIAL` | 2026-08-03 |
| A5-15 | A.5.15  | Access control                        | RBAC + ABAC (`packages/@cos/rbac`, `backend/src/shared/guards/`); 9 spec roles + 3 implementation sub-roles | `DONE`    | 2026-08-03 |
| A5-17 | A.5.17  | Authentication information            | Keycloak OIDC single source of truth; RS256 JWT; MFA/TOTP for TENANT_ADMIN + FINANCE                        | `DONE`    | 2026-08-03 |
| A5-23 | A.5.23  | Security for use of cloud services    | Processor list + DPA status in `data-flow-map.md`. **OpenAI and Cloudflare DPAs are unsigned**              | `PARTIAL` | 2026-08-03 |
| A5-30 | A.5.30  | ICT readiness for business continuity | DR runbooks (`docs/runbooks/disaster-recovery/`); RTO/RPO targets (QM-12). Drill log not yet populated      | `PARTIAL` | 2026-08-03 |
| A5-34 | A.5.34  | Privacy and protection of PII         | `pdpa-controls.md`, `data-flow-map.md`, `data-retention-policy.md`, `data-residency-policy.md`              | `PARTIAL` | 2026-08-03 |

---

## Annex A.8 — Technological controls

| ID    | Annex A | Control                                 | Evidence                                                                                                                                                    | Status    | Verified   |
| ----- | ------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| A8-05 | A.8.5   | Secure authentication                   | Keycloak OIDC + PKCE (mobile is a public client, ADR-050); OTP path issues via Direct Grant                                                                 | `DONE`    | 2026-08-03 |
| A8-08 | A.8.8   | Management of technical vulnerabilities | CodeQL, Semgrep CE, Trivy image scan, dependency-audit job — all blocking in `.github/workflows/ci.yml`                                                     | `DONE`    | 2026-08-03 |
| A8-09 | A.8.9   | Configuration management                | Terraform IaC (`infrastructure/terraform/`), Helm charts, ArgoCD GitOps with self-heal                                                                      | `PARTIAL` | 2026-08-03 |
| A8-12 | A.8.12  | Data leakage prevention                 | RLS tenant isolation + CI `isolation-tests`. **No log redaction** — see `pdpa-controls.md` PDPA-45                                                          | `PARTIAL` | 2026-08-03 |
| A8-15 | A.8.15  | Logging                                 | `@cos/logger` structured JSON with trace/span/tenant/user; Loki retention per `log-retention-policy.md`                                                     | `DONE`    | 2026-08-03 |
| A8-16 | A.8.16  | Monitoring activities                   | Prometheus + Grafana + Alertmanager rules (`infrastructure/monitoring/`); OTel tail sampling (ADR-075)                                                      | `PARTIAL` | 2026-08-03 |
| A8-24 | A.8.24  | Use of cryptography                     | AES-256 SSE-KMS + CMK (`infrastructure/terraform/aws/kms.tf`); AES-256-GCM field encryption (`backend/src/shared/crypto/secret-cipher.ts`); TLS 1.3 ingress | `DONE`    | 2026-08-03 |
| A8-25 | A.8.25  | Secure development life cycle           | ADR process; CI build/type-check/lint/test gates; 100% coverage gate (QM-1)                                                                                 | `DONE`    | 2026-08-03 |
| A8-28 | A.8.28  | Secure coding                           | Semgrep project-policy rules (`.semgrep/`), ESLint flat config, `ruff` for Python, jscpd duplication ratchet                                                | `DONE`    | 2026-08-03 |

---

## Known gaps blocking certification

| Gap                                  | Detail                                                                                                                                    | Tracked as                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| No ISMS                              | Clauses 4–10 are entirely unaddressed — no SoA, no risk-treatment plan, no management review. Annex A controls alone cannot certify.      | `ISMS-00`                  |
| SBOM not generated                   | Spec §5.10 requires a CycloneDX SBOM per release artifact + SLSA provenance + cosign signing. No SBOM step exists in `.github/workflows/` | `A5-07`                    |
| Service-to-service mTLS not deployed | Spec §5.4 specifies Istio mTLS; no Istio manifest exists under `infrastructure/`                                                          | `pdpa-controls.md` PDPA-46 |
| Unsigned processor DPAs              | OpenAI and Cloudflare DPAs are `OPEN` in `data-flow-map.md`                                                                               | `A5-23`                    |
| No log redaction                     | `@cos/logger` sets no pino `redact` option — PII protection is convention only                                                            | `A8-12`                    |

---

## Review schedule

| Event                    | Reviewer         | Action                                                            |
| ------------------------ | ---------------- | ----------------------------------------------------------------- |
| Stage 2 → Stage 3 gate   | Product owner    | Trigger the §5.3.1 audit workflow 6 months ahead; close `ISMS-00` |
| Annual                   | ISMS owner       | Re-verify every row against the code; update the Verified date    |
| Any new external surface | Engineering lead | Re-run STRIDE (§5.9) and update the affected Annex A rows         |

---

## Related documents

- `docs/specifications/05-security-compliance.md` §5.3.1 — audit workflow; names this file
- `docs/registers/soc2-controls.md` — SOC 2 Type II control tracking
- `docs/registers/pdpa-controls.md` — PDPA control tracking
- `context/00_master_construction_os.md` § Risk Register — R-01..R-09
