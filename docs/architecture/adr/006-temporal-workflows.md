---
title: "ADR-006 — Temporal for Long-running Workflows"
status: Accepted
last_updated: "2026-05-29"
authors:
  - thitipongroo
---

# ADR-006 — Temporal for Long-running Workflows

**Status:** Accepted
**Date:** 2026-02-01
**Deciders:** Engineering team

## Context

Several Construction OS workflows are long-running, multi-step, and require durability across failures:

- Procurement approval chains (RFQ → Quotation → PO → Delivery → Invoice → Payment)
- AI report generation (multi-step: data fetch → embedding → LLM call → hallucination guard → store)
- Multi-phase project milestone tracking

Options considered:

1. Kafka-based state machine (manual saga pattern)
2. **Temporal** (workflow orchestration engine)
3. AWS Step Functions (vendor lock-in)
4. Custom database-backed state machine

## Decision

**Temporal 1.x** — self-hosted on Kubernetes.

## Rationale

- Workflows survive pod restarts without data loss — Temporal persists workflow state
- Built-in retry logic, timeout handling, activity cancellation
- TypeScript SDK integrates cleanly with NestJS
- Significantly less code than manual Kafka saga pattern
- Temporal's workflow history provides audit trail for compliance

## Consequences

- Temporal cluster required in production (Kubernetes StatefulSet with PostgreSQL backend)
- At least 2 Temporal worker replicas (Phase 19 readiness check)
- Long-running workflows are NOT implemented as direct HTTP calls
- Activity timeouts prevent runaway processes (especially AI calls)

## Workflow inventory

| Workflow | Duration | Timeout |
| ---------- | --------- | --------- |
| ProcurementApproval | hours–days | 30 days |
| AIReportGeneration | 30–120s | 5 min |
| InvoiceProcessing | hours | 14 days |
| OnboardingTenant | 1–5 min | 30 min |

---

## Alternatives Considered

| Option | Reason Rejected |
| --- | --- |
| Kafka-based state machine (manual saga pattern) | Requires manual state persistence, retry logic, timeout tracking, and compensating transactions per workflow — significant boilerplate with high failure surface |
| AWS Step Functions | Vendor lock-in; not Kubernetes-native; incompatible with on-premise deployments; higher per-execution cost |
| Custom database-backed state machine | Complex to implement correctly; error-prone state transitions; no built-in audit trail or replay capability |

---

## References

- `docs/00-specifications/15-event-driven-workflow.md` §15.5 — approval workflow model and multi-step flow design
- `docs/00-specifications/32-implementation-specifications.md` §32.6 — workflow state machines (ProcurementApproval, InvoiceProcessing)
