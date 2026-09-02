---
paths:
  - "**/*.workflow.ts"
  - "**/*.activities.ts"
  - "backend/src/modules/workflow/**"
  - "backend/src/modules/procurement/**"
  - "infrastructure/temporal/**"
---

# Workflow Engine

Indexed in: `context/00_master_construction_os.md` §CROSS-CUTTING SPECIFICATIONS

> 📎 **Derived from:** `docs/specifications/32-implementation-specifications.md §32.6`
> Authoritative state machines (states, transitions, roles) are in specs.

```text
WORKFLOW ENGINE DECISION:

- Engine: Temporal (self-hosted, open-source)
- Temporal Server version: latest stable
- Temporal SDK: TypeScript SDK (@temporalio/client, @temporalio/worker)
- Reason: supports long-running workflows, retries, compensation,

           and is well-suited for procurement multi-step flows

PROCUREMENT STATE MACHINES (authoritative — agents must implement exactly):

RFQ Workflow:
  DRAFT → PUBLISHED → CLOSED → EVALUATED → [AWARDED | CANCELLED]
  Transitions:
    DRAFT → PUBLISHED:    triggered by procurement officer (ROLE: PROCUREMENT_OFFICER)
    PUBLISHED → CLOSED:   triggered by deadline expiry (Temporal timer) or manual
    CLOSED → EVALUATED:   triggered by system after quotation comparison complete
    EVALUATED → AWARDED:  triggered by ROLE: PROCUREMENT_OFFICER or PROC_MANAGER (manual approval; spec §32.6)
    EVALUATED → CANCELLED:triggered by ROLE: PROCUREMENT_OFFICER or PROC_MANAGER (spec §32.6)

Purchase Order Workflow:
  DRAFT → PENDING_APPROVAL → APPROVED → SENT → ACKNOWLEDGED →
  PARTIALLY_DELIVERED → FULLY_DELIVERED → INVOICED → PAID | DISPUTED
  Transitions:
    DRAFT → PENDING_APPROVAL: triggered by ROLE: PROCUREMENT_OFFICER
    PENDING_APPROVAL → APPROVED: threshold-based approval chain (source: spec §15.5):
      ≤ 50,000 THB:             PM (PROJECT_MANAGER) approves alone
      50,001–500,000 THB:       PM + FINANCE required
      > 500,000 THB:            PM + FINANCE + EXECUTIVE required
      All tiers: 48-hour timeout per approver → escalate to manager; final escalation → TENANT_ADMIN
      Note: thresholds are configurable per tenant; defaults above are the platform defaults
    PENDING_APPROVAL → DRAFT:   triggered by any approval-chain role (reject/revise)
    APPROVED → SENT:            triggered by system (auto) after approval
    SENT → ACKNOWLEDGED:        triggered by vendor confirmation event
    ACKNOWLEDGED → PARTIALLY_DELIVERED: triggered by delivery recording
    PARTIALLY_DELIVERED → FULLY_DELIVERED: triggered by delivery completion
    FULLY_DELIVERED → INVOICED: triggered by invoice receipt
    INVOICED → PAID:            triggered by ROLE: FINANCE
    INVOICED → DISPUTED:        triggered by ROLE: FINANCE

  Approval Chain Additional Rules (spec §15.5):
    - Vendor Invoice (AP): FINANCE approves up to configured limit; above limit requires EXECUTIVE
    - Client Billing (AR): PM approves up to configured limit; above limit requires EXECUTIVE
    - Safety permit: SITE_WORKER/SITE-ENGINEER initiates → SAFETY_OFFICER approves → PM (final)
    - All approval decisions: logged with approver_id, decision, timestamp, comment (audit_logs table)

RULES:

- Do NOT invent additional states beyond those listed above
- Do NOT invent additional approval roles — use RBAC from Phase 2
- Temporal workflow functions must be deterministic
- Compensation logic (rollback) must be implemented for CANCELLED transitions
- All state transitions must emit Kafka events

```
