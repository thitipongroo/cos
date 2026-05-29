---
title: "Offline-first Mobile Sync"
version: "1.1.0"
status: Active
last_updated: "2026-05-25"
authors:
  - thitipongroo
related_docs:
  - 04-tech-stack.md
  - 11-database-schema.md
  - 19-notification-architecture.md
---

# 17. Offline-first Mobile Sync

## Table of Contents

- [17.1 Why Critical](#171-why-critical)
- [17.2 Offline Architecture](#172-offline-architecture)
- [17.3 Conflict Resolution](#173-conflict-resolution)
- [17.4 Entity Offline Scope](#174-entity-offline-scope)
- [17.5 Conflict Resolution Rules per Entity](#175-conflict-resolution-rules-per-entity)
- [17.6 Sync Priority Order](#176-sync-priority-order)
- [17.7 Data Size Limits](#177-data-size-limits)

---

## 17.1 Why Critical

Construction sites often have :

- Weak internet
- No connectivity
- Temporary outages

Offline capability is mandatory.

---

## 17.2 Offline Architecture

Mobile Local DB :

- WatermelonDB (SQLite-backed, offline-first)
- Local event queue
- Local media cache

Sync Engine :

- Conflict resolution
- Delta sync
- Retry sync (FIFO queue, exponential backoff, max 5 retries)
- Background sync

Max Retry Exhaustion Behavior :

When the sync queue exhausts all 5 retries for a record, the behavior depends on entity type :

| Entity Type | Behavior After Max Retries |
| --- | --- |
| Safety incidents | Moved to tenant admin review queue; push alert sent to PM and Safety Officer; record preserved on device |
| Workforce attendance | Moved to tenant admin review queue; push alert sent to PM; record preserved on device |
| Inspection results | Moved to tenant admin review queue; push alert sent to PM; record preserved on device |
| Task progress updates | Sync attempt discarded; user notified in-app; record preserved on device for manual retry |
| Site report drafts | Sync attempt discarded; user notified in-app; record preserved on device |
| Material consumption | Moved to tenant admin review queue; record preserved on device |
| Equipment usage logs | Sync attempt discarded; record preserved on device |

Manual review queue : a server-side queue visible to Tenant Admin where failed sync records
can be reviewed and manually imported. Records are never deleted from the device until
successfully synced or explicitly resolved by an admin.

---

## 17.3 Conflict Resolution

Strategies :

- Last-write-wins (simple)
- Field-level merge
- Human review queue

Depends on entity criticality.

---

## 17.4 Entity Offline Scope

### Offline-capable (full read/write offline)

These entities are critical for daily site operations and must work without connectivity :

- Tasks (progress_percent, status, notes)
- Site reports (daily report drafts)
- Inspections (checklist responses, photos)
- Workforce attendance (check-in/check-out)
- Material consumption records
- Safety checklists and incident reports
- Equipment usage logs

### Online-required (read cache only, no offline write)

These entities require server-side validation before mutation :

- Purchase orders (financial commitment — server approval required)
- Vendor Invoices (AP), Client Billing (AR), AR Receipts, and Payments (financial records — dual-write risk)
- Budget line mutations (cost accounting integrity)
- Vendor master data (shared reference data)
- User permissions and role changes

### Read-only cache (stale-while-revalidate)

These entities are cached for offline reference but not mutated offline :

- Project master data
- BOQ line items
- Room and floor reference data (required for offline task room assignment)
- Drawing files (cached on demand, size-limited)
- Vendor contact directory

---

## 17.5 Conflict Resolution Rules per Entity

| Entity | Strategy | Reason |
| --- | --- | --- |
| Task progress_percent | Last-write-wins | Simple scalar, bounded 0–100 |
| Inspection checklist | Field-level merge | Multiple inspectors may fill different fields |
| Site report | Last-write-wins per field | One author per daily report |
| Workforce attendance | Server wins on check_in | Prevents time manipulation |
| Safety incident | Human review queue | Critical record — cannot auto-resolve |
| Material consumption | Append-only | Each consumption record is a new row |

---

## 17.6 Sync Priority Order

When connectivity is restored, the sync queue flushes in this priority order :

1. Safety incidents (critical — escalation may be time-sensitive)
2. Workforce attendance (payroll dependency)
3. Inspection results (QC gate may be blocking downstream tasks)
4. Task progress updates
5. Site report drafts
6. Material consumption logs
7. Equipment usage logs
8. Photo/media uploads (largest payload — deferred last)

---

## 17.7 Data Size Limits

Local cache constraints :

- Max local DB size per device: 500 MB
- Drawing cache: 200 MB maximum, LRU eviction when full
- Photo queue: max 100 photos pending upload; user warned at 80
- Sync batch size: max 500 records per sync cycle to avoid UI blocking

---

## References

| ID | Title | Source |
| --- | --- | --- |
| [IEEE 830] | IEEE Recommended Practice for Software Requirements Specifications | IEEE Std 830-1998 |
| [CRDT] | Conflict-Free Replicated Data Types | Shapiro et al., INRIA Research Report RR-7687, 2011 |
| [WatermelonDB] | WatermelonDB — High-performance React Native Database | [nozbe.github.io/WatermelonDB](https://nozbe.github.io/WatermelonDB/) |
| [IndexedDB] | Indexed Database API 3.0 | W3C Recommendation — [w3.org/TR/IndexedDB](https://www.w3.org/TR/IndexedDB/) |
| [Expo SQLite] | Expo SQLite Documentation | [docs.expo.dev/versions/latest/sdk/sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) |
| [JWT-RFC] | JSON Web Token (JWT) | RFC 7519 |

> 📎 See also: [04-tech-stack](04-tech-stack.md) · [11-database-schema](11-database-schema.md) · [19-notification-architecture](19-notification-architecture.md)
