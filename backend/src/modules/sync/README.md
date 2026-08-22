# sync

NestJS module implementing the server side of the offline sync protocol.

## Purpose

Serves the three endpoints the mobile client and the offline web app use to reconcile local state:
delta pull, batched push, and explicit conflict resolution. Conflict strategies are entity-specific
and defined in Phase 6 — this module applies them; it does not invent new ones. Source:
`00_master` §Phase 6 (conflict strategies) and §Phase 10; `17-offline-mobile-sync`.

## Public API

```text
GET  /api/v1/sync/delta?since=<timestamp>&entity_types[]=…  — delta pull
POST /api/v1/sync/push                                       — batched offline writes
POST /api/v1/sync/resolve                                    — resolve one entity
```

`/sync/resolve` wire contract:

```text
request  { entity_type, entity_id, client_version, payload, client_submitted_at }
response { resolved_payload, conflict_status, server_version }
conflict_status ∈ ACCEPTED | CONFLICT_FLAGGED | CONFLICT_REJECTED
```

`/sync/delta` response: `{ updated: [...], deleted: [...], server_timestamp }` — `deleted[]` is
backed by `platform.sync_tombstones`.

## Dependencies

- `@cos/logger` — structured logging
- `TenantPrismaService` — tenant-scoped access (RLS enforced)
- Domain services (site-ops, tasks, safety, workforce) — the sync layer delegates writes; it never
  bypasses a module's service layer
- `TombstonePruneService` — background prune of expired tombstone rows

## Configuration

| Variable                        | Description                                              |
| ------------------------------- | -------------------------------------------------------- |
| `SYNC_TOMBSTONE_RETENTION_DAYS` | Retention window before a tombstone row is pruned        |

## Usage

```typescript
// Delta pull on app foreground / after background sync
GET /api/v1/sync/delta?since=2026-06-01T00:00:00Z&entity_types[]=task&entity_types[]=site_report

// Push queued offline writes (flushed in §17.6 priority order by the client)
POST /api/v1/sync/push
```

## Notes

- **Offline write scope is closed (§17.4).** Offline read/write is allowed only for tasks, site
  reports, inspections, workforce attendance, material consumption, safety checklists + incidents and
  equipment usage. POs, vendor invoices, AR/receipts/payments, budget-line mutations, vendor master
  and permissions/roles are online-required and are rejected here.
- Sync priority order on reconnect (§17.6): safety incidents → attendance → inspections →
  task progress → site reports → material → equipment usage → photo/media (last).
- Financial entities never auto-resolve — a detected conflict is flagged `CONFLICT_FLAGGED` for
  manual `FINANCE` / `PROJECT_MANAGER` resolution (QM-9).
- Test design: `docs/specifications/35-test-design.md` §35.10.6 and §35.10.10.
