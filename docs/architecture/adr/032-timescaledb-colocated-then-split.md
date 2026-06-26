# ADR-032: TimescaleDB Deployment — Co-located on Primary PostgreSQL, Split on Volume Trigger

**Date:** 2026-06-26
**Status:** Accepted
**Deciders:** Product Owner / Engineering Lead
**Tags:** data, infra

---

## Context

TimescaleDB stores all time-series telemetry in Construction OS: `equipment_telemetry`
(Phase 21), `workforce_telemetry` (Phase 22), and the `digital_twin` / `TwinState`
hypertable (Phase 24). See `docs/specifications/33-digital-twin-iot.md` §33.8,
`docs/specifications/07-multi-tenant-architecture.md`, and
`docs/specifications/09-data-architecture.md` §9.3.

A recurring design question surfaced during Phase 1 verification: should TimescaleDB
run as a **dedicated database instance** separate from the primary relational PostgreSQL,
or as an **extension co-located on the same PostgreSQL instance**?

The specifications already classify TimescaleDB as a **"PostgreSQL extension"**
(`04-tech-stack.md` §4.3 / line 65; `00-glossary.md`), and the master execution view
states twin-state storage is on "the same instance as Phase 21/22"
(`context/00_master_construction_os.md`). The local-dev Docker Compose already realizes
this: a single `postgres` service using the `timescale/timescaledb:latest-pg16` image,
with the extension enabled at init (`infrastructure/postgres/init.sql`). This ADR makes
the deployment posture explicit and defines the trigger for splitting it out later.

## Decision

**Start co-located. Split to a dedicated TimescaleDB instance only when a measured
volume trigger is crossed.**

1. **Stages 1–3 (MVP through POST-LAUNCH):** TimescaleDB runs as an extension on the
   primary PostgreSQL instance (shared-DB tenants) / the tenant's dedicated PostgreSQL
   instance (ENTERPRISE). Telemetry hypertables live alongside relational tables.
   No separate time-series server is provisioned.
2. **Split trigger — provision a dedicated TimescaleDB instance when ANY of:**
   - Sustained telemetry write throughput > **10,000 rows/s** on the primary instance, OR
   - TimescaleDB hypertable storage > **30%** of the primary instance's total size, OR
   - Telemetry write load measurably contends with OLTP latency (p95 write SLO per QM-6
     breached and root-caused to telemetry ingestion), OR
   - A region/compliance requirement mandates physical separation of telemetry data.
3. The split, when triggered, is executed as its own ADR (superseding the relevant
   section here) and a multi-region-aware Terraform change; the chunk interval is sized
   from IoT write-frequency profiling at the Phase 24 planning gate
   (`33-digital-twin-iot.md` §33.8), not pre-specified.

The split threshold is reviewed at the PgBouncer/PostgreSQL scale load-test before
Stage 2 go-live (QM-18; `docs/architecture/tenant-scale-limits.md`).

## Rationale

- **Industry consensus + vendor guidance:** TimescaleDB is a PostgreSQL extension; the
  recommended posture is to run it in the same instance unless distributed/independent
  scaling is genuinely required, because it preserves full SQL compatibility, lets
  telemetry join relational data in a single query, and avoids a second operational
  surface (backup, HA, failover, upgrades).
- **Premature split is waste:** Stage 1–3 telemetry volume is unproven. Provisioning a
  separate instance before there is write pressure adds cost and operational complexity
  (QM-12 DR runbooks, QM-18 connection pooling, monitoring) with no benefit.
- **Trigger-based split is reversible and measurable:** co-located → dedicated is a
  standard migration (logical replication / dump-restore of hypertables). Defining the
  trigger now means the split is a planned, data-driven action rather than an emergency.
- **Alternatives rejected:**
  - *Dedicated instance from day one* — rejected: cost/ops overhead without evidence of
    need; contradicts spec's "extension" classification and master's "same instance".
  - *Never split* — rejected: at high IoT scale (Phase 21+) telemetry ingestion can
    contend with OLTP; the trigger guards the OLTP latency SLO.

## Consequences

### Positive

- Single instance to operate, back up, and fail over through Stage 3.
- Telemetry and relational data joinable in one SQL query.
- Local dev matches production topology (one PostgreSQL+TimescaleDB instance).
- Split is a planned, threshold-driven decision, not guesswork.

### Negative

- A future split is operational work (migration + cutover + new DR runbook); mitigated by
  defining the trigger and reviewing it at the Stage 2 scale load-test.
- Telemetry write spikes share I/O with OLTP until the split — monitored via the QM-6
  write-latency SLO and the trigger.

### Neutral

- No change to application code: telemetry access already goes through the owning module's
  service layer; the connection target (co-located vs dedicated) is configuration.
- Multi-region (QM-13) is unaffected: the split, if/when it happens, is region-scoped.

## References

- `docs/specifications/04-tech-stack.md` §4.3 (TimescaleDB = PostgreSQL extension)
- `docs/specifications/09-data-architecture.md` §9.3 (Data Storage Architecture)
- `docs/specifications/33-digital-twin-iot.md` §33.8 (Infrastructure scaling notes)
- `docs/specifications/07-multi-tenant-architecture.md` (telemetry hypertables)
- ADR-008 (shared-DB + tenant_id + RLS) — isolation model the co-located instance inherits
- QM-6 (performance budgets), QM-12 (DR), QM-18 (connection pooling)
