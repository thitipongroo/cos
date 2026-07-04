# ADR-045: Wave F — stateful infrastructure major upgrades

**Date:** 2026-07-01
**Status:** Accepted
**Deciders:** Product owner / engineering lead
**Tags:** infra, architecture

---

## Context

The Docker Compose stateful services were a major version behind. Unlike the app-layer upgrades
(ADR-041–044), these carry data-migration risk. They were validated locally by upgrading the running
containers in place, treating the existing dev data as the migration subject (schemas, extensions,
hypertables, indices, topics, realms — real structure, sparse rows).

## Decision

Upgrade each stateful store to its current major, with the migration steps each one actually
requires (verified empirically, not by naive image swap):

| Store                                        | From → To               | Migration handling verified                                                                                                                                                                  |
| -------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL + TimescaleDB                     | pg16 → pg18             | PG18 Docker data-dir layout change (mount `/var/lib/postgresql`, docker-library/postgres#1259); dump/restore; TimescaleDB `timescaledb_pre_restore()`/`post_restore()` for hypertable chunks |
| Redis                                        | 7 → 8                   | in-place (AOF/RDB backward-compatible)                                                                                                                                                       |
| ClickHouse                                   | 24.3 → 26.3 LTS         | in-place (reads prior on-disk format)                                                                                                                                                        |
| OpenSearch                                   | 2.13 → 3.7              | in-place; Lucene 9→10; OS3 reads N-1 indices                                                                                                                                                 |
| Neo4j                                        | 5.19 → 2026.05 (CalVer) | in-place store-format migration; image moved to ubi10 base                                                                                                                                   |
| Keycloak                                     | 24 → 26                 | env rename `KEYCLOAK_ADMIN*` → `KC_BOOTSTRAP_ADMIN_*`; health moved to mgmt port 9000; Liquibase realm-schema migration                                                                      |
| Confluent Platform (Kafka + Schema Registry) | 7.6 → 8.3 (Kafka 4)     | already KRaft (no ZooKeeper migration); CP8 image dropped curl → bash /dev/tcp healthcheck                                                                                                   |

Each upgrade backed up first (e.g. `pg_dumpall`) so it is reversible.

## Scope of validation (important)

**Validated on this machine:** data-migration _mechanics_ — schema / extension / hypertable+chunk /
index / topic / realm data survive the upgrade, and the app connects to the new major. Chunk-data
migration was exercised by inserting time-series rows (31 chunks) and confirming they survive the
`pre_restore`/`post_restore` cycle.

**NOT validated here (requires staging, QM-12/16):** production-scale zero-downtime / blue-green
cutover, rollback under traffic, and measured RTO/RPO — these scale with production data volume and
load, which a dev volume cannot represent. A test machine proves _the procedure works_; staging
proves _it meets the SLO numbers_. Blue-green/canary + DR drills on production-representative data
remain a pre-production gate.

## Consequences

### Positive

- All stateful stores current; per-store migration runbooks proven end-to-end.

### Negative / Follow-up

- Production rollout still requires the QM-12/16 staging DR drill for RTO/RPO + zero-downtime.
- Confluent 8 `metadata.version` can be bumped (kafka-features) after all brokers are on 8 — deferred.

## References

- QM-12 (DR), QM-16 (deployment safety); docker-library/postgres#1259; TimescaleDB dump/restore;
  Keycloak 26 + Kafka 4 (Confluent 8) upgrade notes
