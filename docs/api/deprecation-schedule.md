# Construction OS — API Deprecation Schedule

> **Purpose:** Track API endpoint and Kafka schema deprecations with sunset dates and tenant
> notification log. Source: QM-2; spec §14.4.
>
> **Minimum notice period: 90 days** before any endpoint or schema is removed.
> This file must be updated before any `@deprecated` tag is added to an OpenAPI spec.

---

## Active deprecations

| Endpoint / Schema          | Version deprecated in | Deprecation date | Sunset date | Notice sent | Replacement |
| -------------------------- | --------------------- | ---------------- | ----------- | ----------- | ----------- |
| _(no active deprecations)_ |                       |                  |             |             |             |

---

## Completed deprecations (removed)

| Endpoint / Schema | Deprecated | Sunset | Removed in |
| ----------------- | ---------- | ------ | ---------- |
| _(none yet)_      |            |        |            |

---

## Deprecation protocol

### Step 1 — Announce deprecation (Day 0)

1. Add `@deprecated` to the endpoint in OpenAPI YAML (`docs/api/{service}.openapi.yaml`)
2. Add a row to **Active deprecations** table above with:
   - Deprecation date = today
   - Sunset date = today + 90 days (minimum)
   - Replacement = the new endpoint or schema version
3. Send tenant notification (see format below)
4. Add `Deprecation` and `Sunset` HTTP response headers to the endpoint:

   ```http
   Deprecation: Sat, 01 Jan 2027 00:00:00 GMT
   Sunset: Mon, 01 Apr 2027 00:00:00 GMT
   Link: <https://docs.construction-os.app/api/v2/procurement>; rel="successor-version"
   ```

5. Add `BREAKING CHANGE:` entry to `CHANGELOG.md` if the endpoint is removed (not just deprecated)

### Step 2 — Remind tenants (Day 60)

Send a second notification to tenants who have not yet migrated (check API usage analytics for
deprecated endpoint calls by tenant).

### Step 3 — Final warning (Day 75)

Send final 15-day warning to tenants still calling the deprecated endpoint.

### Step 4 — Sunset (Day 90+)

1. Remove the endpoint / schema from code
2. Return `410 Gone` with error body `COS-API-410` for any calls to the removed endpoint
   for 30 days after sunset (grace period)
3. Move row to **Completed deprecations** table
4. Remove `@deprecated` tag from OpenAPI spec; remove endpoint handler

---

## Tenant notification format

Notifications are sent via:

- In-platform notification (SSE push to all ADMIN users of affected tenants)
- Email to the tenant's registered admin email

```text
Subject: [Action Required] API Endpoint Deprecation — {endpoint} — Sunset {date}

Dear {tenant_name} Administrator,

Construction OS will sunset the following API endpoint on {sunset_date}:

  Endpoint: {HTTP_METHOD} /api/v1/{path}
  Deprecated: {deprecation_date}
  Sunset: {sunset_date} (90 days from deprecation)
  Replacement: {HTTP_METHOD} /api/v1/{replacement_path}

Migration guide: {link_to_docs}

Please update your integrations before the sunset date. After {sunset_date}, the endpoint
will return HTTP 410 Gone.

If you have questions, contact support at support@construction-os.app.
```

---

## Kafka schema deprecations

Kafka schema changes follow QM-9 backward compatibility rules:

- Compatibility mode: `BACKWARD_TRANSITIVE` (all versions readable by new consumer)
- Schema Registry: Confluent Schema Registry at `http://schema-registry:8081`

| Topic                             | Schema version | Deprecated version | Sunset date | Notes |
| --------------------------------- | -------------- | ------------------ | ----------- | ----- |
| _(no active schema deprecations)_ |                |                    |             |       |

Procedure for schema deprecation:

1. Register new schema version in Schema Registry
2. Update all producers to emit new version
3. Keep old consumer support for 90 days (BACKWARD_TRANSITIVE guarantees this automatically)
4. After 90 days, remove old schema registration and update this table

---

## API versioning policy (QM-2)

- All endpoints are prefixed `/api/v1/` from first commit
- New incompatible API version → introduce `/api/v2/` alongside `/api/v1/`
- `/api/v1/` remains operational for minimum 90 days after `/api/v2/` GA
- Version sunset requires this document to be updated and tenants notified

---

## Review schedule

| Trigger                                 | Action                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------- |
| Any `@deprecated` added to OpenAPI spec | Add row to Active deprecations; send tenant notification               |
| Every 30 days                           | Check Active deprecations table; send reminder to non-migrated tenants |
| Sunset date reached                     | Remove endpoint; update table; send final notice                       |
