# 28. Tenant settings store

Date: 2026-06-19

## Status

Accepted

## Context

§20.7.8 (Tenant Admin) defines a `/settings/tenant` page for "variance thresholds, retention %,
LINE channel token, notification prefs". §19.4 states the LINE Channel Access Token "lives in
tenant settings". But **no `TenantSettings` entity exists in §11**, there is no §14 endpoint, and
`platform.tenants` carries only identity columns — the settings the UX references are not modelled
anywhere. User management (`/settings/users`) was already complete (§14.3, `user.controller`).

## Decision

Introduce `platform.tenant_settings` (one row per tenant, `tenant_id` PK) with the fields implied
by the §20.7.8 list:

- `variance_alert_threshold DECIMAL(5,2)` — tenant default budget-variance alert threshold (%).
- `retention_percentage DECIMAL(5,2)` — tenant default retention percentage (%).
- `line_channel_token VARCHAR(512)` — LINE Channel Access Token (§19.4).
- `notifications_enabled BOOLEAN` — tenant-level notifications toggle.

Two endpoints, both `TENANT_ADMIN`-gated:

- `GET /api/v1/tenant/settings` — returns the row, or **service-level defaults** (10.00 / 5.00 /
  null / true) when no row exists yet (read never writes).
- `PATCH /api/v1/tenant/settings` — partial update; merges with current values and upserts.

RLS keys the table by `tenant_id`. The defaults mirror the existing finance budget default
(`DEFAULT_VARIANCE_THRESHOLD = 10`).

## Consequences

- `/settings/tenant` has a real backend; §14, §11, and the tenant OpenAPI are updated.
- The field set is derived from the UX list, not a prior §11 entity. If the product owner later
  formalises a richer settings model (per-channel notification matrix, multiple LINE channels,
  approval-limit defaults), it supersedes this minimal store.
- Per-user notification preferences remain in `notifications.notification_preferences`;
  `notifications_enabled` here is the tenant-level master toggle, not a replacement.
- Existing per-budget `variance_alert_threshold` and per-PO retention values are unchanged; these
  are tenant **defaults** for new records, applied by the relevant services when adopted.
