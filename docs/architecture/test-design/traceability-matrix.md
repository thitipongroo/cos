---
title: 'Test Design — Traceability Matrix'
version: '1.0.0'
status: Active
last_updated: '2026-08-25'
authors:
  - thitipongroo
related_docs:
  - README.md
---

# Traceability Matrix

> Part of the [Test Design](README.md) set (§35.11 of the former single document).

489 test cases across 25 phases. Each row closes the §35.3 chain:
spec § → phase → test case IDs → CI gate.

| Phase                      | Cases | Primary spec references                                                                   | Levels used                    | Gating CI job (§30.12)                                                               |
| -------------------------- | ----- | ----------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| 1 Foundation Repository    | 19    | Ph1 Generate; §32.2; QM-1, QM-11, QM-18; Rules 26–28, 31–32, 35; ADR-033, ADR-036         | UNIT, INT, MAN                 | lint · type-check · build · unit-tests                                               |
| 2 Auth + Tenant System     | 24    | Ph2 Generate; §5.4, §5.4.2, §6.2, §6.9, §7.6, §7.7, §14.3, §32.8; ADR-008/030/031/035/040 | UNIT, INT, ISO, MAN            | unit-tests · integration-tests · isolation-tests                                     |
| 3 Project Service          | 18    | Ph3 Generate; §10.2, §11.2, §20.5                                                         | UNIT, INT, ISO, MAN            | unit-tests · integration-tests · isolation-tests                                     |
| 4 BOQ Service              | 19    | Ph4 Generate; §32.5; QM-1                                                                 | UNIT, INT, ISO, SEC            | unit-tests · integration-tests · mutation-tests                                      |
| 5 Procurement Service      | 28    | Ph5 Generate; §32.6, §15.5, §14, §13.3; ADR-022, ADR-030                                  | UNIT, INT, SEC, MAN            | unit-tests (+ serial workflows) · integration-tests · mutation-tests                 |
| 6 Site Operations          | 27    | Ph6 Generate; §17.4, §17.6; QM-9; ADR-025, ADR-027                                        | UNIT, INT                      | unit-tests · integration-tests                                                       |
| 7 Finance Service          | 20    | Ph7 Generate; §32.5, §11, §15; ADR-023, ADR-024                                           | UNIT, INT, ISO                 | unit-tests · integration-tests · isolation-tests                                     |
| 8 Event Infrastructure     | 20    | Ph8 Generate; §32.4, §7.3, §15.6; QM-9; Rules 33–34                                       | UNIT, INT, MAN                 | unit-tests · integration-tests                                                       |
| 9 File + Document          | 21    | Ph9 Generate; QM-4, QM-10                                                                 | UNIT, INT, ISO, LOAD, SEC      | unit-tests · integration-tests · load-tests                                          |
| 10 Mobile Offline Engine   | 24    | Ph10 Generate; §17.2, §17.4, §17.6, §17.7, §17.9, §17.10; §30.7; ADR-048, ADR-050         | UNIT, E2E, MAN                 | mobile-tests · e2e-tests (Detox)                                                     |
| 11 AI Foundation           | 19    | Ph11 Generate; §22.3, §22.6, §22.7, §22.8, §22.10; §30.11 Layer A                         | UNIT, INT, AI, MAN             | (see ESC-05 — AI-service pytest is not wired into CI)                                |
| 12 AI Report Assistant     | 21    | Ph12 Generate; §22.3; §31.6; §30.11 Layer A                                               | UNIT, INT, AI, LOAD            | (see ESC-05) · load-tests                                                            |
| 13 Knowledge Graph         | 18    | Ph13 Generate; §12, §7.3, §15.6, §32.4                                                    | UNIT, INT, ISO, MAN            | (see ESC-05 — Go tests are not wired into CI)                                        |
| 14 Analytics + Dashboard   | 14    | Ph14 Generate; §31.6; §30.9                                                               | UNIT, INT, ISO, LOAD, MAN      | unit-tests · integration-tests · load-tests                                          |
| 15 Observability           | 17    | Ph15 Generate; §31.2–31.12; QM-8, QM-14                                                   | UNIT, MAN                      | unit-tests                                                                           |
| 16 Security                | 29    | Ph16 Generate; §5.2, §5.5, §5.8, §5.9, §5.10, §9.7.3; QM-4, QM-5, QM-7; §30.10            | UNIT, INT, ISO, SEC, MAN       | unit-tests · isolation-tests · dependency-audit · secret-scan · security-scan · dast |
| 17 DevOps + Deployment     | 11    | Ph17 Generate; QM-16, QM-18; §31.11, §31.12; ADR-039                                      | INT, MAN                       | build-docker · push-ecr · update-gitops                                              |
| 18 Testing                 | 28    | Ph18 Generate; §30.2–30.13; QM-1; ADR-048                                                 | UNIT, CONTRACT, E2E, LOAD, MAN | unit-tests · contract-tests · e2e-tests · lighthouse · load-tests                    |
| 19 Production Readiness    | 25    | Ph19 Section A + B; `context.md` Phase 19 protocol; QM-1…QM-18                            | MAN                            | Stage 1→2 gate (not a PR gate)                                                       |
| 20 Notification Service    | 17    | Ph20 Generate; §19.2, §19.3, §19.6, §19.7, §7.3; QM-8                                     | UNIT, INT, MAN                 | unit-tests · integration-tests                                                       |
| 21 Equipment Service       | 9     | Ph21 Generate; §13.5, §33.8, §32.9; ADR-032                                               | UNIT, INT, ISO                 | unit-tests                                                                           |
| 22 Workforce Service       | 15    | Ph22 Generate; §13.5, §32.4, §32.9                                                        | UNIT, INT, ISO                 | unit-tests · integration-tests · isolation-tests                                     |
| 23 MLOps Pipeline          | 18    | Ph23 Generate; §22.6, §22.9; §30.11 Layer B; ADR-038                                      | UNIT, INT, AI, MAN             | mlops-tests                                                                          |
| 24 Digital Twin            | 11    | Ph24 Generate; §33, §33.3, §33.4; ADR-032                                                 | UNIT, INT, MAN                 | (see ESC-05)                                                                         |
| 25 Enterprise Provisioning | 17    | Ph25 Generate; §34, §34.6, §7.1                                                           | UNIT, INT, MAN                 | unit-tests (+ serial workflows)                                                      |

## Distribution by level

| Level      | Cases   | Share    |
| ---------- | ------- | -------- |
| `UNIT`     | 309     | 63.2%    |
| `MAN`      | 90      | 18.4%    |
| `INT`      | 34      | 7.0%     |
| `ISO`      | 13      | 2.7%     |
| `E2E`      | 13      | 2.7%     |
| `AI`       | 10      | 2.0%     |
| `LOAD`     | 9       | 1.8%     |
| `SEC`      | 8       | 1.6%     |
| `CONTRACT` | 3       | 0.6%     |
| **Total**  | **489** | **100%** |

The unit-heavy distribution matches the §30.2 pyramid target (unit 70% / integration 20% / E2E 5% /
load 5%); `MAN` cases are predominantly Phase 19 readiness checks and infrastructure-configuration
verifications, which the pyramid does not model.

---
