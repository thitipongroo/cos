# ADR-094: Domain events go through a durable outbox, not an inline Kafka publish

**Date:** 2026-08-19
**Status:** Accepted
**Deciders:** Backend Lead
**Tags:** architecture | data | infra

> **Path note (added 2026-08-25).** The `@cos/shared/src/kafka/…` paths below were correct when
> this was written. [ADR-055](055-split-cos-kafka-from-cos-shared.md) (2026-08-22) moved that SDK
> into its own package, so those files now live at `packages/@cos/kafka/src/…`. The text is left
> as written — an ADR records what was decided and observed at its date.

---

## Context

Thirteen call sites published domain events by opening a Kafka producer inside the operation that
raised the event, and swallowing any failure. Eleven were request-path services (`boq`, `equipment`,
`finance`, `procurement`, `project`, `project/risks`, `safety`, `site-ops`, `tenant`, `tenant/user`,
`workforce`); two were Temporal activity paths (`procurement/workflows/activity-helpers.ts`,
`tenant/workflows/enterprise-provisioning.activities.ts`).

**The comments said an outbox caught the failures. Nothing did.** `project.service.ts` and
`risks.service.ts` both read _"Non-fatal in MVP: log and continue — outbox pattern picks up failures
(Phase 8)"_, and `equipment.service.ts` logged _"Failed to emit Kafka event — will retry via outbox"_.
`OutboxPublisher` and `OutboxPoller` do exist in `@cos/shared/src/kafka/outbox.ts`, and
`platform.outbox_events` was created by migration `20260531000002` — but **no file under
`backend/src` imported either class**, and the poller's own header (_"Start once per deployable in
main.ts bootstrap"_) described a call `main.ts` never made. The table had never held a row.

So every broker hiccup, Schema Registry timeout or partition-leader election dropped the event
permanently, with one log line and a `200 OK` already on its way to the client. Nothing downstream
could distinguish "the project was never created" from "the project was created and
`construction.project.created.v1` never happened". The comment is the reason nobody went looking.

The same code was also expensive, and in four places leaked. The services are `Scope.REQUEST` and each
built a **new** `KafkaProducer` per request, so:

- `connect()` performs a Schema Registry compatibility call (`ensureCompatibilityMode`) plus a full
  producer handshake — per event, not per process;
- `ensureTopic()` costs an admin round trip that its `knownTopics` cache exists to avoid, except the
  cache is per instance and every instance was new;
- `boq`, `equipment`, `procurement` and `workforce` **never called `disconnect()` at all**, and
  `project`, `risks`, `tenant` and `user` called it inside the `try`, so it was skipped on exactly the
  failure path that most needed it. Only `finance`, `safety` and `site-ops` used `finally`.

## Decision

### 1. Publishing is an INSERT; delivery is a background job

`EventOutboxService.publish()` (`backend/src/shared/events/event-outbox.service.ts`) writes one row to
`platform.outbox_events` and returns. `OutboxPollerService`
(`backend/src/shared/events/outbox-poller.service.ts`) delivers it to Kafka afterwards and retries
until it lands. Both are provided by a `@Global` `EventsModule`, so the eleven services inject the
outbox instead of constructing a producer, and Kafka leaves the request path entirely.

The poller is a Nest provider rather than a `main.ts` call — the original design — so Nest owns its
lifecycle: it starts on `onApplicationBootstrap` and, more importantly, **stops on shutdown**, letting
the in-flight batch finish instead of being cut off when the pod is killed.

### 2. The poller runs in every replica, and needs no lease

The claim is a single statement whose subquery takes `FOR UPDATE SKIP LOCKED`, so three replicas
running it at the same instant get three **disjoint** row sets rather than three copies of one set.
Three pollers therefore drain three times as fast, and this job deliberately does **not** use the
`ScheduledJobLockService` of [ADR-095](095-scheduled-job-leader-election.md): here the exclusion is
per ROW, not per job.

### 3. Delivery is at-least-once, and the event keeps one identity for life

A row is marked published only after Kafka accepts it, so a poller that dies mid-publish leaves the
row to be retried — possibly re-delivering an event that did land. That is the correct trade, because
the alternative loses events, and it is safe **only because the envelope keeps one `event_id`**:
`KafkaConsumer` dedupes on `event_id` through a Redis key with a 24h TTL.

`KafkaProducer.publish()` was minting a fresh `event_id` on every call. That made the consumer's
dedupe unreachable for anything republished — each retry looked like a brand-new event. It now honours
a caller-supplied id and mints one only when there is none, so direct publishers are unaffected.

### 4. Migration `20260819000003` adds the three columns the table lacked

| Column            | Why the original table could not be used without it                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `attempts`        | `published = false` cannot tell "not tried yet" from "tried and failed", so a poison row is retried every 500ms forever |
| `next_attempt_at` | Doubles as the **claim**: the claim UPDATE moves it into the future, hiding the row from the other replicas' pollers    |
| `last_error`      | The only diagnostic for a stuck row — poller logs have rotated long before anyone looks                                 |
| `tenant_id`       | Denormalised from the envelope so "what is stuck, and whose is it?" does not require reaching into JSON                 |

The attempt is counted **at claim time, not on failure**: a poller killed mid-publish never reaches a
failure handler, so counting only clean failures would let a row that crashes the process every time
it is tried be retried forever. Backoff is `LEAST(300, 30 * attempts)` seconds.

A row that exhausts `MAX_ATTEMPTS` (10, ≈25 minutes) is **not deleted and gets no separate flag** — it
simply stops being claimed and remains queryable as what it is:

```sql
SELECT id, tenant_id, event_type, attempts, last_error, created_at
  FROM platform.outbox_events
 WHERE published = false AND attempts >= 10
 ORDER BY created_at;
```

Re-driving one after fixing the cause is `SET attempts = 0, next_attempt_at = now()`. Republishing is
safe because the envelope keeps its original `event_id`.

### 5. Connect before claim

`poll()` connects to Kafka **before** claiming. Claiming spends attempt budget, so claiming while the
broker is unreachable would burn ten attempts on perfectly good events and retire them — purely
because Kafka was down for half an hour. Failing at `connect()` means nothing was claimed, so an
outage of any length costs no budget, and the attempt counter only ever measures what it is meant to:
how many times **this** event was offered to a broker that was listening.

## Rationale

**Why not just start the existing `OutboxPoller`.** It was written before the deployment ran three
replicas and cannot survive them: its query is `SELECT … WHERE published = false ORDER BY created_at
LIMIT 50` with no row locking, so every replica reads the same rows and publishes each event three
times. It also passes the stored envelope straight to `publish()`, which — before the change in §3 —
overwrote `event_id`, so its own retries were undedupable. The class stays in `@cos/shared` for other
deployables; the backend uses the two services above.

**Why durable and not transactionally atomic.** The textbook outbox writes the event in the same
transaction as the business row, which requires threading `tx` from the repository into the publish
call. This codebase's repositories own their transactions internally, so that is a refactor of every
write path — a much larger change than the bug being fixed. The residual gap is narrow and
one-directional: if the process dies between the business write committing and the outbox INSERT, the
event is lost. **That was equally true of the inline publish it replaces**, while every other failure
mode — broker down, registry down, publish timing out — is now recoverable where before it was not.
`EventOutboxService.write(tx, event)` exists so a caller that does have a transaction can close even
that gap, and is the migration path if a domain ever needs it.

**Why `publish()` never throws but `write()` always does.** `publish()` runs after the operation has
already committed; failing the caller there would report a business action as failed when it
succeeded, which is worse than a delivery problem. `write()` runs **inside** the caller's transaction,
where swallowing the error would commit the business row and silently drop the event — precisely what
the transactional form exists to make impossible.

**Why a dead-letter threshold at all.** Some failures never resolve — an event type with no registered
Avro schema, a payload the schema rejects. Retrying those forever costs a poll slot every 500ms that a
healthy event queued behind them could have used. Ten attempts is long enough to ride out any
transient broker problem and short enough that a genuinely broken event stops consuming capacity.

## Consequences

### Positive

- **Domain events survive a broker outage.** The failure the old comments claimed was handled now
  actually is.
- **Kafka is off the request path.** A publish is a local INSERT; no Schema Registry call, no producer
  handshake, no admin round trip per request, and the four leaked connections are gone.
- **The producer's caches finally work.** One process-lifetime producer means `knownTopics` and
  `schemaIds` are warm after the first event of each type, instead of empty on every request.
- **A stuck event is visible and re-drivable** by SQL, with the reason it failed recorded next to it.

### Negative

- **Delivery latency gains up to ~500ms** (the idle poll interval). No consumer in this system reads
  events synchronously with a request, but this is a real change to end-to-end timing.
- **Still not atomic with the business write** (see Rationale). The window is small and was always
  there, but it is now the _only_ remaining way to lose an event, which makes it worth naming.
- **A new always-on background loop per replica**, and with no Kafka reachable it logs an error every
  5s. That is the honest signal — events are not being delivered — but it is new noise in local dev.

### Neutral

- `platform.outbox_events` stops being a dead table, and its row count becomes an operational signal:
  a rising unpublished count means delivery is behind.
- Eleven per-service `try/catch` blocks collapsed into one. Their unit tests — each asserting "a Kafka
  failure does not break the request" — collapsed with them into
  `shared/events/__tests__/event-outbox.service.spec.ts`.

## References

- `backend/src/shared/events/` — `EventOutboxService`, `OutboxPollerService`, `EventsModule`
- `backend/prisma/migrations/20260819000003_outbox_delivery_state/migration.sql`
- `packages/@cos/shared/src/kafka/producer.ts` — `event_id` is now caller-supplied when present
- `packages/@cos/shared/src/kafka/consumer.ts` — dedupe on `event_id` (Redis, 24h TTL)
- [ADR-004: Kafka event bus](004-kafka-event-bus.md)
- [ADR-095: Scheduled-job leader election](095-scheduled-job-leader-election.md) — why that job needs
  a lease and this one does not
- [`specifications/15-event-driven-workflow.md`](../../specifications/15-event-driven-workflow.md)
