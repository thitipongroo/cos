# Finance Ledger Drift Runbook

**Source:** TDD OQ-31 — the Phase 7 no-direct-query rule and its one exception
**Trigger:** Alertmanager alert `FinanceLedgerDrift` fires (`finance_ledger_drift > 0` for 15 min)

---

## What the alert means

`finance.cost_transactions` is built **entirely** from Kafka events — Finance never queries
Procurement to answer anything. The outbox behind those events is durable, not transactional
(ADR-094): the business write commits first, and the event that carries it to Finance is published
afterwards. Everything after that commit can fail, and when it does the project's budget is simply
wrong, with nothing in the system disagreeing with anything else.

`LedgerReconciliationService` runs hourly (`@Cron('37 * * * *')`, leased so one replica sweeps) and
compares the ledger against `procurement.purchase_orders` and `procurement.invoices`. Every unit of
`finance_ledger_drift` is money a budget is wrong about.

| `kind`      | Meaning                                       | Effect on the budget           |
| ----------- | --------------------------------------------- | ------------------------------ |
| `missing`   | PO/invoice exists, no cost transaction        | **Under**-committed            |
| `duplicate` | More than one transaction for the same source | **Over**-committed             |
| `orphan`    | Transaction whose PO/invoice no longer exists | Over-committed against nothing |

> **Absent is not zero.** The gauge reports nothing at all until the first sweep completes. If you
> see no series, the question is whether the job is running — grep for `finance.ledger.reconciled`
> (clean sweep) or `finance.ledger.drift` (findings) in the backend logs. A missing series is not an
> all-clear.

---

## Step 1 — Read the finding

The `finance.ledger.drift` log line carries the full report: a count per `kind` × `source`, and a
sample of up to 50 rows per kind naming `tenant_id`, `source_id` and the amount.

```bash
kubectl logs -n cos deploy/cos-backend --since=2h \
  | grep '"event":"finance.ledger.drift"' | tail -1 | jq .
```

The **count** is exact and unbounded. The **sample** is capped — do not read a 50-row sample as
"50 affected rows"; read the count.

---

## Step 2 — `missing`: find out where the event stopped

Work outward from the source. Take a `source_id` from the sample.

### 2a. Did the event ever get written to the outbox?

```sql
SELECT id, event_type, published, attempts, last_error, created_at
  FROM platform.outbox_events
 WHERE payload->'payload'->>'po_id' = '<source_id>'
    OR payload->'payload'->>'invoice_id' = '<source_id>';
```

- **No row** — the producer never wrote it. This is a code path that skipped `publish()`, not a
  delivery failure. Escalate to the owning team; the re-drive below will not help.
- **`published = false`, `attempts >= 10`** — a dead letter. It exhausted its retries and stopped
  being claimed. Go to step 3.
- **`published = false`, `attempts < 10`** — still in flight or backing off. Read `last_error`, fix
  the cause, and let the poller finish; the next sweep will clear it.
- **`published = true`** — the event reached Kafka. The loss is downstream: go to 2b.

### 2b. Did the consumer dead-letter it?

Check the DLQ for the event, and check the backend logs for `Max retries exceeded` carrying that
`event_id`. Replay from the DLQ per [kafka-partition-rebalance.md](kafka-partition-rebalance.md).

---

## Step 3 — Re-drive a dead-lettered outbox row

**Fix the cause first.** A re-drive against an unfixed cause burns ten more attempts and lands back
here.

```sql
UPDATE platform.outbox_events
   SET attempts = 0, next_attempt_at = now(), last_error = NULL
 WHERE id = '<outbox id>';
```

Republishing is safe: the envelope keeps its original `event_id`, and `KafkaConsumer` claims that id
in Redis before processing.

> **Never INSERT the cost transaction by hand.** `FinanceConsumer` is the only writer to
> `finance.cost_transactions`, and that is what keeps the ledger reproducible from the event log. A
> hand-written row also has no `event_id` behind it, so when the real event is finally re-driven it
> will insert a second one — turning a `missing` finding into a `duplicate` one.

---

## Step 4 — `duplicate`: decide which row to void

Two transactions for one PO means the source event was processed twice. The Redis idempotency claim
(`kafka:processed:*`, 24 h TTL) normally prevents this, but it is a cache, not a constraint — it
expires, it is lost on a Redis failover, and the DLQ-replay path deletes it deliberately.

```sql
SELECT transaction_id, amount, transaction_date, description, recorded_at
  FROM finance.cost_transactions
 WHERE tenant_id = '<tenant_id>' AND source_type = '<PURCHASE_ORDER|INVOICE>'
   AND source_id = '<source_id>'
 ORDER BY recorded_at;
```

Keep the earliest; the later ones are the redelivery. Removing a cost transaction changes a
customer's reported budget — **get finance sign-off before deleting anything**, and record the
decision in the incident.

---

## Step 5 — `orphan`: confirm before acting

A transaction whose PO or invoice no longer exists. Confirm the source is genuinely gone (not moved,
not a tenant mismatch) before touching the ledger:

```sql
SELECT po_id, tenant_id, status FROM procurement.purchase_orders WHERE po_id = '<source_id>';
```

If the PO truly does not exist, the transaction is charged against nothing. Same rule as step 4:
finance sign-off before removing it.

---

## What NOT to do

- **Do not widen the exception.** `LedgerReconciliationService` is the only thing in Finance allowed
  to read Procurement's tables, it is read-only, and its output is a log line and a gauge. Reading
  Procurement to answer a query, fill a report, or make a decision is still forbidden
  (`00_master` § PHASE 7).
- **Do not silence the alert to clear a backlog.** A broker outage can strand thousands of events at
  once; the count is meant to be large in that case. Re-drive them.
- **Do not treat a clean sweep as proof the pipeline is healthy.** It proves the ledger matches the
  purchase orders that exist. A PO the producer never wrote an event for reconciles as `missing`;
  one where the producer never wrote the PO either is invisible to this job.

---

## Related

- [kafka-partition-rebalance.md](kafka-partition-rebalance.md) — consumer lag and DLQ replay
- ADR-094 — why the outbox is durable rather than transactional
- Migration `20260819000003_outbox_delivery_state` — dead-letter query and re-drive, at source
