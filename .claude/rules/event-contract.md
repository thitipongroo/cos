---
paths:
  - "**/*.avsc"
  - "packages/@cos/kafka/**"
  - "packages/@cos/shared/**"
  - "**/*consumer*.ts"
  - "**/*producer*.ts"
  - "**/*outbox*.ts"
  - "libs/go/**"
  - "services/kg-ingestion-worker/**"
  - "services/analytics-worker/**"
---

# Cross-Service Event Contract

Indexed in: `context/00_master_construction_os.md` §CROSS-CUTTING SPECIFICATIONS

> 📎 **Derived from:** `docs/specifications/32-implementation-specifications.md §32.4`
> Authoritative payload specs (field types, enum values) are in specs. This section is agent-executable form.
> **EVENT NAMING:** the canonical format (spec §32.4 and §15.6) is
> `{domain}.{entity}.{action}.v{N}` — e.g., `construction.project.created.v1`.
> Agents MUST use it for ALL NEW events.
> **The legacy-name migration this note used to demand is complete** (verified 2026-08-22): no
> legacy-named `.avsc` remains, and §32.4's 27-row pending table has been replaced by its status.
> The one contested name was settled on 2026-08-23 (TDD OQ-16): §32.4 #16 now reads
> `finance.variance.alert.v1`, the name on the wire. The spec form had no producer, consumer or
> `.avsc` anywhere, so aligning the code to it would have been a breaking `.v2` for a name nothing
> had ever emitted. Note the cost: `variance.alert` does not parse as `{domain}.{entity}.{action}`,
> so this event is the convention's one live exception.
> See Kafka topic naming: `{tenant_id}.{domain}.{entity}.{action}.v{N}`
> The event names below are annotated with their canonical equivalents where known.

```text
All Kafka events MUST conform to the following envelope:

┌─────────────────────────────────────────────────────────────┐
│ BASE EVENT ENVELOPE (TypeScript + Avro)                     │
├─────────────────────────────────────────────────────────────┤
│ {                                                           │
│   event_id:      string (UUID v4)                          │
│   event_type:    string — CANONICAL format:                │
│                    "{domain}.{entity}.{action}.v{N}"       │
│                    e.g. "construction.project.created.v1"  │
│                    (source: spec §32.4; M-5 resolved)      │
│   event_version: string (e.g. "1.0" — semantic patch      │
│                    version within the major version;       │
│                    source: spec §32.4)                     │
│   tenant_id:     string (UUID)                             │
│   actor_id:      string (UUID — user who triggered)        │
│   occurred_at:   string (ISO 8601 UTC)                     │
│   correlation_id: string (UUID — for tracing)              │
│   trace_id:      string | null (OTel trace_id, 32 hex —    │
│                    the trace that RAISED the event; set    │
│                    by EventOutboxService.publish(), NOT    │
│                    at delivery — the poller runs later in  │
│                    another process under its own span)     │
│   span_id:       string | null (OTel span_id, 16 hex)      │
│   payload:       object (event-specific — see below)       │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘

CRITICAL CROSS-SERVICE EVENTS (field-level spec):
Note: Legacy names shown first → canonical name in brackets. New events use canonical name only.

1. project.created → [construction.project.created.v1]

   payload: {
     project_id:   UUID
     project_code: string
     project_name: string
     project_type: enum [RESIDENTIAL, COMMERCIAL, INFRASTRUCTURE, INDUSTRIAL]
     budget:       { amount: decimal(19,4), currency_code: ISO4217 }
     start_date:   date (YYYY-MM-DD)
     end_date:     date (YYYY-MM-DD)
     created_by:   UUID
   }

2. boq.version.created → [construction.boq.version_created.v1]

   payload: {
     boq_version_id: UUID
     project_id:     UUID
     version_number: integer
     total_estimated:{ amount: decimal(19,4), currency_code: ISO4217 }
     created_by:     UUID
   }

3. procurement.purchase_order.created → [procurement.po.created.v1]

   payload: {
     po_id:        UUID
     project_id:   UUID
     vendor_id:    UUID
     po_number:    string
     total_amount: { amount: decimal(19,4), currency_code: ISO4217 }
     delivery_date: date
     line_items:   Array<{ item_id: UUID, quantity: decimal(10,4),
                           unit: string, unit_price: decimal(19,4) }>
   }

4. procurement.vendor_invoice.received → [procurement.invoice.received.v1]

   payload: {
     invoice_id:  UUID
     po_id:       UUID
     project_id:  UUID
     vendor_id:   UUID
     amount:      { amount: decimal(19,4), currency_code: ISO4217 }
     invoice_date: date
     due_date:    date
   }

5. site.report.created → [site.report.created.v1]

   payload: {
     report_id:    UUID
     project_id:   UUID
     report_date:  date
     submitted_by: UUID
     summary:      string (max 2000 chars)
     issue_count:  integer
     photo_count:  integer
   }

6. inspection.failed → [site.inspection.failed.v1]

   payload: {
     inspection_id:  UUID
     project_id:     UUID
     checklist_id:   UUID
     failed_items:   Array<{ item_id: UUID, description: string }>
     inspected_by:   UUID
     inspected_at:   datetime
   }

7. task.completed → [construction.task.completed.v1]

   payload: {
     task_id:        UUID
     project_id:     UUID
     boq_item_id:    UUID
     completed_by:   UUID
     completed_at:   datetime
     progress_percent: integer (100 at completion)
     actual_duration_days: integer
   }

8. delay.detected → [construction.delay.detected.v1]

   payload: {
     project_id:     UUID
     task_id:        UUID  (nullable — may be project-level delay)
     delay_days:     integer
     cause:          enum [PROCUREMENT, WEATHER, WORKFORCE, EQUIPMENT, SCOPE_CHANGE, OTHER]
     detected_by:    enum [AI_FORECAST, MANUAL_REPORT]
     severity:       enum [LOW, MEDIUM, HIGH, CRITICAL]
   }

9. workforce.checkin.created → [workforce.checkin.created.v1]

   payload: {
     checkin_id:     UUID
     worker_id:      UUID
     project_id:     UUID
     checkin_at:     datetime
     method:         enum [QR_CODE, GPS, BIOMETRIC, MANUAL] (nullable — null means NOT
                     RECORDED, which is not MANUAL; captured from the client 2026-08-24)
     location:       { lat: float, lng: float }  (nullable)
   }

10. site.material.consumed → [site.material.consumed.v1]

    payload: {
      consumption_id: UUID
      project_id:     UUID
      task_id:        UUID
      material_id:    UUID
      quantity:       decimal(10,4)
      unit:           string
      consumed_by:    UUID
      consumed_at:    datetime
    }

11. procurement.delivery.received → [procurement.delivery.received.v1]

    payload: {
      delivery_id:    UUID
      po_id:          UUID
      project_id:     UUID
      vendor_id:      UUID
      received_by:    UUID
      received_at:    datetime
      items_received: Array<{ item_id: UUID, quantity_received: decimal(10,4) }>
      partial:        boolean
    }

12. finance.budget.exceeded → [finance.budget.exceeded.v1]

    BUILT 2026-08-23 (TDD OQ-50). Per COST CATEGORY, where #16 finance.variance.alert.v1
    is per PROJECT — a project can sit inside its total while one trade has blown its line.
    Threshold is the project's own variance_alert_threshold against the smaller denominator.
    cost_category = the BOQ category CODE.
    The enabling fix: cost_transactions.budget_line_id existed from the first finance
    migration and NOTHING EVER WROTE IT, so every per-category figure read zero — including
    the task-completion gate in TasksService, which blocks at ratio >= 1.0 and so had never
    fired. procurement.po.created.v1 now carries boq_item_id per line (nullable, Avro
    default), and Finance resolves boq_items.category_id -> budget_lines.boq_category_id.
    A PO spanning several categories stays unattributed rather than charging one of them.


    payload: {
      project_id:       UUID
      cost_category:    string
      budget_amount:    { amount: decimal(19,4), currency_code: ISO4217 }
      actual_amount:    { amount: decimal(19,4), currency_code: ISO4217 }
      overage_percent:  decimal(5,2)
      detected_at:      datetime
    }

13. finance.invoice.approved → [procurement.vendor_invoice.approved.v1]

    payload: {
      invoice_id:     UUID
      po_id:          UUID
      project_id:     UUID
      vendor_id:      UUID
      amount:         { amount: decimal(19,4), currency_code: ISO4217 }
      approved_by:    UUID
      approved_at:    datetime
      payment_due:    date
    }

14. finance.cashflow_risk.detected → [finance.cashflow_risk.detected.v1]

    BUILT 2026-08-23 (TDD OQ-50) — CashflowRiskService, a daily leased @Cron. The forecast is a
    PULL endpoint (GET /api/v1/finance/cashflow-forecast/:projectId) returning 13 weekly
    buckets of inflow/outflow/net_flow/cumulative_net. RULE_ENGINE grades by HOW SOON
    cumulative_net first goes negative: never in 13 weeks -> no event; weeks 9-13 LOW;
    5-8 MEDIUM; 2-4 HIGH; 0-1 CRITICAL. projected_shortfall = the most negative
    cumulative_net across the horizon. Nothing new is invented — every figure already exists.
    AI_FORECAST is a second, later producer.
    A SWEEP, not a write hook: the risk moves on the calendar — nothing changes in the data,
    a week passes, and a shortfall five weeks out is now one week out. It does not emit from
    the pull endpoint either, or the alert would depend on somebody opening a screen. It calls
    the SAME buildForecast the endpoint uses, so the alert cannot disagree with the screen an
    operator opens to check it. AI_FORECAST stays a second, later producer.


    payload: {
      project_id:     UUID
      risk_level:     enum [LOW, MEDIUM, HIGH, CRITICAL]
      projected_shortfall: { amount: decimal(19,4), currency_code: ISO4217 }
      projected_at:   date  (when shortfall is expected)
      detected_by:    enum [AI_FORECAST, RULE_ENGINE]
    }

15. ai.risk_prediction.generated → [ai.risk_prediction.generated.v1]

    payload: {
      prediction_id:  UUID
      project_id:     UUID
      model_type:     enum [DELAY_FORECAST, COST_OVERRUN, SAFETY_VISION, RISK_CLASSIFIER]
      prediction:     object  (model-specific structure)
      confidence:     decimal(5,4)  (0.0000 – 1.0000)
      generated_at:   datetime
      model_version:  string
    }

16. boq.created → [construction.boq.created.v1]

    payload: {
      project_id:     UUID
      version_id:     UUID
      version_number: integer
    }

17. boq.updated → [construction.boq.updated.v1]

    payload: {
      version_id:                   UUID
      project_id:                   UUID
      changed_items_count:           integer
      new_total_estimated_amount:    string  (decimal — never float)
      new_total_estimated_currency:  string  (ISO 4217)
    }

18. procurement.po.approval_requested.v1

    payload: {
      po_id:         UUID
      project_id:    UUID
      approver_id:   UUID
      tier:          enum [PM, FINANCE, EXECUTIVE, TENANT_ADMIN]
      po_number:     string
      total_amount:  string  (decimal — never float)
      currency_code: string  (ISO 4217)
    }
    // Emitted by the PO approval workflow (notifyApprover) when a PO enters an approval
    // tier or is escalated on the 48h timeout; consumed by Notification Service → approver_id.

- Use Confluent Schema Registry (open-source, self-hosted)
- All schemas registered in Avro format
- Compatibility mode: BACKWARD_TRANSITIVE (new schema must be readable by ALL previous versions, not just the immediately preceding one; source: spec §32.4)
- Schema subject naming: RecordNameStrategy — subject is the canonical event type ({domain}.{entity}.{action}.v{N}), one schema per event shared across all tenants. NOT {topic_name}-value: Kafka topics carry a {tenant_id}. prefix (§7.3), so TopicNameStrategy would duplicate schemas per tenant (source: spec §32.4)
- Version increment on every schema change
- Agents must generate both TypeScript interface AND Avro schema for each event

```
