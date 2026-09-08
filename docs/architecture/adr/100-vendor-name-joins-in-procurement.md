# ADR-100: A payment names its vendor through procurement, not through a cross-schema join

**Date:** 2026-09-08
**Status:** Accepted
**Deciders:** Product Owner (the outcome), the architecture rule (the mechanism)
**Tags:** architecture | backend | mobile | finance | procurement

---

## Context

The FINANCE mobile screens (`mockup/mobile/09_finance/`) all show who is being paid.
`finance.payments` cannot say: its columns are

```text
payment_id · invoice_id · project_id · tenant_id · amount · currency_code
payment_date · payment_reference · status · recorded_by · created_at
```

`invoice_id` is a UUID and nothing on the row is readable by a person. The invoice number lives in
`procurement.invoices` and the vendor's name in `procurement.vendors`.

On 2026-09-08 the product owner was asked how the screens should get them, and answered: **change
the backend — join them into the existing `GET /finance/payments`.** That was implemented the same
day: `finance.repository.ts` gained

```sql
SELECT p.*, v.vendor_name, i.invoice_number
FROM finance.payments p
LEFT JOIN procurement.invoices i ON i.invoice_id = p.invoice_id AND i.tenant_id = p.tenant_id
LEFT JOIN procurement.vendors  v ON v.vendor_id  = i.vendor_id  AND v.tenant_id = p.tenant_id
```

**It was forbidden, and two test suites said so.** `context/00_master_construction_os.md` §PHASE 7
line 3216 states that finance learns about purchase orders and invoices from procurement **events**
and never from its tables. It is guarded twice:

| Guard                                              | Assertion                                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `tests/architecture/connectivity.spec.ts`          | TC-P07-INT-002 — no `FROM/JOIN/INTO/UPDATE procurement.` SQL in `backend/src/modules/finance/` |
| `tests/conformance/finance/05-constraints.spec.ts` | the same rule, restated for ADR-024 §2                                                         |

One file is exempt — `ledger-reconciliation.service.ts`, the hourly sweep, exempted as TDD OQ-31 on
2026-08-23 because a ledger built from a stream cannot detect its own gaps — and the exemption is
deliberately narrow, held to three limits by the conformance test.

The join was caught by `scripts/ci/verify-before-push.sh`, not by the author, and only because that
script was run before the next push. That is the reason this record exists rather than a one-line
revert: the question was asked and answered without either party knowing the rule was there.

## Decision

**The join moves into procurement, which owns both tables.**

1. `GET /finance/payments` returns the payment's own columns and nothing else. The join in
   `finance.repository.ts` is reverted; `PaymentRow` loses `vendor_name` and `invoice_number`.
2. `GET /procurement/vendor-invoices` and `GET /procurement/vendor-invoices/:id` gain
   `vendor_name`, LEFT-joined from `procurement.vendors` — a join **within one schema**, which no
   rule constrains.
3. The mobile screens that draw a payment read that endpoint once per page and match on
   `invoice_id` (`invoiceIndex()` in `apps/mobile/src/api/procurement.ts`).

**The product owner's outcome is unchanged.** A payment row still names its vendor and its invoice
number on screen. What changed is where the join runs.

### Why not widen the exemption instead

It was considered and rejected without escalation, on the strength of what the exemption's own
comment says: it is "narrow by design", justified by a correctness argument specific to
reconciliation — the outbox is durable but not transactional (ADR-094), so a dropped
`procurement.po.created.v1` leaves the budget silently under-committed with nothing disagreeing.
Displaying a name on a phone has no such argument behind it. If the product owner would rather widen
the rule than accept the extra request, reverting to the join is a small diff and this record says
what it would cost.

### Why not carry the name on the event instead

`procurement.vendor_invoice.received.v1` carries `vendor_id` and neither `vendor_name` nor
`invoice_number`. Adding them is a Kafka schema change under `BACKWARD_TRANSITIVE` (additive, so
permitted) **plus** a finance-side projection table, a migration, a consumer change and a backfill
for every invoice already received. That is the architecturally purest answer and it is an order of
magnitude more work than the screens justify today. It stays on the table; see Consequences.

## Rationale

- **The rule is about deployability, not tidiness.** A cross-schema join makes finance and
  procurement deployable only together, which is the coupling the event contract exists to prevent.
  A name on a card is not worth that.
- **Procurement joining procurement is not the same act.** `invoices.vendor_id` is
  `NOT NULL REFERENCES vendors (vendor_id)` inside the same schema; the service already owns and
  queries both tables.
- **The extra request is one per page, not one per row.** The alternative — fetching each invoice as
  its payment is drawn — is the N+1 fan-out `GET /tasks/portfolio-summary` was built to avoid, and
  would be worst on the first screen the FINANCE role opens.

## Consequences

### Positive

- Both guards pass, and the module boundary they defend is intact.
- `GET /procurement/vendor-invoices` is more useful to every caller, not only to the payment queue:
  the Invoices screen (`app/(app)/invoices.tsx`) reads the same field.
- The failure mode is honest and local. `invoiceIndex()` resolves to an empty map rather than
  throwing, so a payment queue that cannot reach procurement still lists every payment, with an em
  dash where a name would be.

### Negative

- Two requests where there was one, and the phone does the matching.
- The index covers one page of invoices (100 rows). A payment whose invoice falls outside it shows
  an em dash even though the vendor is known to the platform. Acceptable while the AP queue is a
  page long; it is the first thing to fix if it stops being.

### Neutral

- The event-carried projection above remains the right answer if a second consumer needs the same
  denormalisation, or if the em-dash case above starts appearing. Nothing here forecloses it.

## References

- `context/00_master_construction_os.md` §PHASE 7 line 3216 — the rule
- `tests/architecture/connectivity.spec.ts` TC-P07-INT-002 and
  `tests/conformance/finance/05-constraints.spec.ts` — the guards
- ADR-024 §2 — the same boundary stated for the cash-flow outflow
- ADR-094 — why the reconciliation sweep is exempt and a display join is not
- `docs/api/finance.openapi.yaml` · `docs/api/procurement.openapi.yaml` — the two contracts
