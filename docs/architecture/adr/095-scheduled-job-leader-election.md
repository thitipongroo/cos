# ADR-095: Scheduled jobs elect a leader through a lease row, not an advisory lock

**Date:** 2026-08-19
**Status:** Accepted
**Deciders:** Backend Lead
**Tags:** architecture | infra | data

---

## Context

`@nestjs/schedule` registers `@Cron` timers **per process**. Production runs three replicas —
`replicaCount: 3` with `autoscaling.minReplicas: 3` in
`infrastructure/helm/cos-backend/values-prod.yaml` — so all four scheduled jobs fired three times on
the same minute, and nothing coordinated them.

| Job                       | Schedule      | What three replicas actually did                                        |
| ------------------------- | ------------- | ----------------------------------------------------------------------- |
| `notification-escalation` | `*/5 * * * *` | Sent **three** escalation messages per unacknowledged incident          |
| `notification-digest`     | `0 * * * *`   | Sent every PM **three** copies of the daily site summary and the weekly |
| `exchange-rate-refresh`   | `0 0 * * *`   | Spent **three** calls of a metered third-party quota on one day's rates |
| `sync-tombstone-prune`    | `0 3 * * *`   | Ran the same full-table DELETE three times                              |

The two notification jobs are the ones that are _wrong_ rather than merely wasteful, because neither
is idempotent across processes:

- **Escalation** reads `WHERE … escalated_at IS NULL`, calls `svc.escalate()` — which sends — and only
  **then** writes `escalated_at`, in a separate transaction. All three replicas read the same
  unescalated rows before any of them marked one. The sweep also had no `LIMIT`, so the first tick
  after an outage delivered the whole backlog at once.
- **Digest** reads `listActiveTenants()` and calls `deliverDigest()`. There is no per-period record
  anywhere, so nothing downstream can tell a second copy from the first.

The other two are idempotent, but three concurrent full-table DELETEs is triple the lock contention
and WAL for one job's work, and each replica then logs a _fraction_ of the real row count as if it
were the total.

## Decision

### 1. A lease row in `platform.scheduled_job_locks`

Migration `20260819000002` adds:

| Column         | Purpose                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------- |
| `job_name` PK  | The `@Cron` `name`. The primary key is what makes `ON CONFLICT` the arbiter between replicas |
| `holder`       | `"<pod hostname>:<pid>"` — names the pod for a stuck lease, and scopes release               |
| `acquired_at`  | Diagnostic                                                                                   |
| `locked_until` | The lease. A finished run sets it to `now()`; a dead holder lets it expire                   |

`ScheduledJobLockService.runExclusively(jobName, leaseSeconds, fn)`
(`backend/src/shared/scheduling/scheduled-job-lock.service.ts`) wraps each `@Cron` entry point. All
four jobs now read the same way: the decorated method claims the lease and delegates, and the work
itself lives in a separate method.

### 2. Acquisition is one statement

```sql
INSERT INTO platform.scheduled_job_locks (job_name, holder, acquired_at, locked_until)
VALUES ($1, $2, now(), now() + ($3::int * interval '1 second'))
ON CONFLICT (job_name) DO UPDATE
   SET holder = EXCLUDED.holder, acquired_at = now(), locked_until = EXCLUDED.locked_until
 WHERE platform.scheduled_job_locks.locked_until < now()
RETURNING job_name
```

A row comes back only if the lease was free or expired. A `SELECT` followed by an `UPDATE` is exactly
the read-then-write race this service exists to remove — three replicas would all read "expired" and
all proceed — so the take-over decision is made by one statement under a row lock.

### 3. It fails closed

If the lock table cannot be reached, `acquire()` returns **false** and the job is skipped. With the
table unavailable we cannot tell whether another replica is already running, and the failure this
service exists to prevent is duplicate work: a tick missed once is recoverable, three copies of a
notification already sent is not.

### 4. Release is scoped to the holder, and always happens

`runExclusively` releases in a `finally`, including after the job throws — holding a lease for the
rest of its term because one run failed would make a bad tick delay every following one, and the retry
_is_ the next tick. The release carries `AND holder = $2`: if this replica overran its lease and
another took over mid-run, clearing the lock would cut the new holder's run short.

### 5. Lease lengths are per job, and all shorter than the interval

| Job                       | Lease | Reasoning                                                                         |
| ------------------------- | ----- | --------------------------------------------------------------------------------- |
| `notification-escalation` | 240s  | Under the 5-minute schedule, so a replica killed mid-sweep costs at most one tick |
| `notification-digest`     | 1800s | Longest job (walks every active tenant, sends per role); half the hourly interval |
| `exchange-rate-refresh`   | 900s  | One HTTP fetch; daily, so there is no next tick to protect — only a slow provider |
| `sync-tombstone-prune`    | 900s  | Covers a large DELETE with room to spare on a daily schedule                      |

A completed run releases immediately, so the lease only has to survive a **crash**. Its real meaning
is the ceiling on how long a job stays blocked by a replica that was `SIGKILL`ed mid-run — which is
why it must sit well under the schedule interval.

### 6. `findEscalationCandidates` is bounded

`ORDER BY created_at ASC LIMIT 200`. Oldest-first is what makes the bound safe rather than arbitrary:
the oldest are the most overdue, and whatever does not fit is picked up five minutes later, because
rows are marked escalated only once they have actually been sent.

## Rationale

**Why not `pg_advisory_lock`.** It is **session**-scoped, and the application reaches PostgreSQL
through PgBouncer in **transaction** pooling mode (QM-18). The connection holding the lock is returned
to the pool at commit, so the lock's lifetime stops matching the job's — the one property a lock is
bought for.

**Why not `pg_try_advisory_xact_lock`.** It fixes the pooling problem only by keeping a transaction
open for the whole job. For the hourly digest that means a transaction open for minutes while the job
makes network calls, which trades a correctness bug for a database problem.

**Why a lease and not a boolean "running" flag.** A holder that is `SIGKILL`ed never clears a flag, so
a boolean turns one bad pod into a job that never runs again until someone notices and clears it by
hand. An expiring lease self-heals: the worst case is one skipped tick.

**Why not move the jobs out of the API pod.** A dedicated scheduler deployment with `replicas: 1` is
the other standard answer and would work. It was rejected as a larger change than the bug warrants —
a new deployable, its own image, Helm chart, probes and rollout — and because it trades duplicate runs
for a single point of failure with no redundancy. The lease keeps all three replicas eligible, so a
pod dying between ticks costs nothing.

**Why the outbox poller does not use this.** [ADR-094](094-durable-event-outbox.md)'s poller wants the
opposite property: it should run everywhere so the backlog drains three times as fast. It gets its
exclusion per **row** through `FOR UPDATE SKIP LOCKED` rather than per **job** through a lease. The
distinction is worth keeping straight — a future `@Cron` needs a lease; a future queue drainer does
not.

## Consequences

### Positive

- **Escalations and digests are sent once.** The user-visible defect is gone.
- **Self-healing.** A pod killed mid-run blocks its job for at most the lease, not indefinitely.
- **All three replicas stay eligible**, so there is no scheduler single point of failure.
- **Logged row counts mean what they say** now that one process does the whole prune.

### Negative

- **One extra round trip per tick per replica.** Two of three do nothing else, which is the point.
- **A skipped tick is possible** when the lock table is briefly unavailable (fail-closed, §3). For a
  5-minute sweep this is invisible; for the daily jobs it would delay them a day, which is why the
  skip is logged at ERROR.
- **A new table with no retention.** Four rows, updated in place — but it is one more thing that
  exists, and a rollback of this migration silently restores triplicate notifications, which the
  rollback script says in as many words.

### Neutral

- Lease-holder rows are a cheap operational read: `SELECT * FROM platform.scheduled_job_locks` shows
  which pod ran what, and when.
- Every `@Cron` in the codebase now has a matching `*_JOB` and `*_LEASE_SECONDS` export, so adding a
  scheduled job without a lease is visibly different from the four that have one.

## References

- `backend/src/shared/scheduling/scheduled-job-lock.service.ts`, `scheduling.module.ts`
- `backend/prisma/migrations/20260819000002_scheduled_job_locks/migration.sql`
- `infrastructure/helm/cos-backend/values-prod.yaml` — `replicaCount: 3`, `minReplicas: 3`
- `infrastructure/kubernetes/pgbouncer/configmap.yaml` — transaction pooling, which rules out session
  advisory locks
- [ADR-094: Durable event outbox](094-durable-event-outbox.md) — per-row exclusion, and why it differs
- [ADR-008: Shared DB + tenant_id RLS](008-shared-db-tenant-id-rls.md)
