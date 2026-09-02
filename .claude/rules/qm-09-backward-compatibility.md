---
paths:
  - "backend/prisma/migrations/**"
  - "backend/prisma/rollbacks/**"
  - "**/*.avsc"
  - "docs/api/*.openapi.yaml"
  - "packages/@cos/kafka/**"
  - "backend/src/modules/sync/**"
  - "apps/mobile/**"
---

# QM-9 — Backward Compatibility

Indexed in: `context.md` §QUALITY MANDATES

- **Database migrations must be backward-compatible** — the old code must still work while the migration runs
  - Add columns as nullable first
  - Never rename a column in a single migration — add new + copy data + remove old (3-step)
  - Never change a column's type directly — create new column, migrate data, drop old
  - Never drop a column used by any deployed code
  - Every migration must have a verified rollback script committed in `prisma/rollbacks/` (NOT inside
    `prisma/migrations/` — Prisma `migrate deploy` treats every subdirectory of `migrations/` as a migration and fails
    P3015 on one lacking `migration.sql`)
  - Name migrations `<timestamp>_<action>_<subject>` (e.g. `add_phone_number_to_users`); **never prefix with `phaseN_`**
    — build-phase numbers are work-tracking metadata, not schema identity. The directory name is stored in
    `_prisma_migrations.migration_name`, so renaming an applied migration needs a matching `UPDATE` on every environment
    — pick the final name up front (see `docs/specifications/09-data-architecture.md`)
- **API backward compatibility** — old clients must not break during upgrades
  - Never remove a JSON field from a response — mark as deprecated with `@deprecated` in OpenAPI, keep for 6 months
  - Never change a field's type in the same version
- **Kafka schema backward compatibility** — Confluent Schema Registry is **required** infrastructure (not optional); all
  Kafka schemas must be registered before first producer use; compatibility mode: `BACKWARD_TRANSITIVE` (new schema can
  read messages from ALL previous versions — not just the immediately preceding one; source: spec §32.4) CI must
  validate schema compatibility against the registry before deployment
- **Mobile backward compatibility** — the backend must support the previous 2 major mobile app versions
- **Offline sync conflict resolution** — conflict strategy is entity-specific (authoritative spec:
  `context/00_master_construction_os.md` §Phase 6 Offline Conflict Resolution Strategy); agents must implement exactly
  the strategies below — never invent a different strategy without an ADR:
  - `site_reports`: **LAST_WRITE_WINS** on `client_submitted_at`; flag as `CONFLICT_FLAGGED` for `SITE_ENGINEER` manual
    review when server `modified_at` differs from client's `last_known_modified_at`
  - `issues`: **FIELD_LEVEL_MERGE** — `description` / `resolution_note`: last writer wins; `status`: server wins
    (authoritative); `photos`: union (additive, no conflict possible — this resolves WHICH photos are attached, not a
    photo's contents); flag `ConflictRecord` for `SITE_ENGINEER` review if `status` was changed server-side during
    client's offline edit
  - **photo annotation** (the ADR-056 stroke list on a photo): **CONFLICT_FLAGGED** — no auto-resolution. An annotation
    stays editable after sync, so two people can mark up the same photo offline; merging strokes would blend two
    readings of one defect and last-write-wins would discard one. Server detects concurrent modification on sync →
    `CONFLICT_FLAGGED` + notify `SITE_ENGINEER`; never auto-merge or overwrite (spec §17.5; PO decision 2026-07-17)
  - `safety_checklists`: **SERVER_WINS** — reject client version unconditionally; return server version with
    `CONFLICT_REJECTED` status; safety data must be authoritative, no exceptions
  - **Financial entities** (POs, vendor invoices / AR / AP, payments, budget-line mutations): **online-required — NOT
    offline-writable** (spec §17.4; dual-write risk); BOQ line items are read-only cache (§17.4). Neither is
    offline-mutated, so neither reaches sync conflict resolution — the sync push endpoint (`/sync/push`,
    `/sync/resolve`) has no financial `entity_type` case and rejects any such write (`BadRequestException`); financial
    data is never auto-merged, auto-overwritten, or silently discarded. (§17.5's conflict table has no financial row for
    this reason.)
  - Sync wire protocol (server-side endpoint): `POST /api/v1/sync/resolve` accepts `{ entity_type, entity_id,
    client_version, payload, client_submitted_at }`; returns `{ resolved_payload, conflict_status, server_version }`
    where `conflict_status ∈ { ACCEPTED | CONFLICT_FLAGGED | CONFLICT_REJECTED }`
  - `ConflictHandler` class (generated in Phase 10) must implement all three strategies; unit-tested per QM-1 (Phase 18
    mandatory coverage list)
  - **Offline write scope (spec §17.4)** — agents must NOT allow offline writes outside this list: offline read/write =
    tasks, site reports, inspections, workforce attendance, material consumption, safety checklists + incidents,
    equipment usage, deliveries received against a PO (amended 2026-08-19), purchase requests (amended 2026-08-19);
    **online-required (read-cache only)** = POs, vendor invoices / AR / receipts / payments, budget-line mutations,
    vendor master, permissions/roles, tenant settings/configuration, sync conflict resolution (§17.5); read-only
    stale-while-revalidate cache = project master, BOQ lines, room/floor reference, drawings, vendor directory. The
    pushable-type list is declared once as `SYNC_PUSHABLE_ENTITY_TYPES` in `@cos/types` and imported by both the API and
    the mobile client
  - **Sync priority order on reconnect (spec §17.6)** — flush in this exact order: 1 safety incidents → 2 attendance → 3
    inspections → 4 task progress → 5 site reports → 6 material → 7 equipment usage → 8 photo/media (deferred last)
  - **Data size limits (spec §17.7)** — enforce: local DB ≤ 500 MB · drawing cache ≤ 200 MB (LRU eviction) · photo queue
    ≤ 100 (warn user at 80) · sync batch ≤ 500 records/cycle; server-side `platform.sync_tombstones` backs `GET
    /sync/delta` `deleted[]` (schema in 00_master §Phase 10, spec §11.1)
