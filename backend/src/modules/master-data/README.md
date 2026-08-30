# master-data

NestJS module owning the normalized reference data every operational entity must reference.

## Purpose

Implements the Priority 0 Section D "Structured Data Schema Foundation": materials, work categories,
issue categories and cost categories. Free text is forbidden in fields that should reference master
data — site reports, procurement records and cost entries all reference these ids. Source:
`context/01_build_priority_execution.md` Priority 0 Section D.

## Public API

```text
GET    /api/v1/materials              — list materials
POST   /api/v1/materials              — create material
PATCH  /api/v1/materials/:id          — update material
DELETE /api/v1/materials/:id          — delete material

GET    /api/v1/work-categories        — list work categories
POST   /api/v1/work-categories        — create work category
PATCH  /api/v1/work-categories/:id    — update work category

GET    /api/v1/issue-categories       — list issue categories
POST   /api/v1/issue-categories       — create issue category

GET    /api/v1/cost-categories        — list cost categories
POST   /api/v1/cost-categories        — create cost category
```

Write access is `TENANT_ADMIN`; read access is available to any authenticated tenant user.

## Dependencies

- `@cos/rbac` — role guards for `TENANT_ADMIN` writes
- `@cos/types` — shared enums
- `@cos/logger` — structured logging
- `TenantPrismaService` — tenant-scoped access (RLS enforced)

## Configuration

No module-specific environment variables. Uses the shared `DATABASE_URL` (PgBouncer).

## Usage

```typescript
// Create a material (unit_of_measure and category are enums, not free text)
POST /api/v1/materials
{ "name": "Portland cement", "unit_of_measure": "bag", "category": "concrete" }
```

## Notes

- Enum sets are defined in Priority 0 Section D — `category`: concrete, steel, formwork, electrical,
  plumbing, finishes, equipment, other; `unit_of_measure`: kg, ton, m3, m2, m, unit, set, bag, roll.
- Seed data for all category tables is loaded by the seed script (`make seed`).
- Offline clients treat master data as a **read-only stale-while-revalidate cache**; on sync
  conflict the server wins (`17-offline-mobile-sync` §17.4).
- Duplicate-entity rate is a governed metric: < 1% (`09-data-architecture` §9.8).
