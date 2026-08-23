# geo

NestJS module providing reverse geocoding from a self-hosted Nominatim instance.

## Purpose

Turns GPS coordinates captured in the field (site reports, issues, attendance check-in,
`LocationPicker`) into a human-readable address **without calling any third-party geocoding
service** — the Nominatim container (Geofabrik Thailand extract) runs in-tenant, so coordinates
never leave the deployment.

## Public API

```text
GET /api/v1/geo/reverse?lat=<number>&lon=<number>   — reverse-geocode to an address
```

Response:

```json
{ "latitude": 13.7563, "longitude": 100.5018, "address": "…" }
```

## Dependencies

- Nominatim container (`nominatim` service in `docker-compose.yml`)
- `JwtAuthGuard` — authenticated callers only
- `@cos/logger` — structured logging

## Configuration

| Variable        | Default                 | Description                        |
| --------------- | ----------------------- | ---------------------------------- |
| `NOMINATIM_URL` | `http://nominatim:8080` | Base URL of the Nominatim instance |

## Usage

```text
GET /api/v1/geo/reverse?lat=13.7563&lon=100.5018
```

## Notes

- **Degrades gracefully:** when Nominatim is unreachable or returns non-200, `address` resolves to
  `null` and the request still succeeds — callers must handle a null address.
- Upstream call timeout: 5 s (`AbortSignal.timeout`).
- Validation errors use the QM-10 error taxonomy: `COS-GEO-001` (missing/non-numeric `lat`/`lon`),
  `COS-GEO-002` (out of range). Register: `docs/api/error-codes.md`.
- Coordinates are not persisted by this module; it is a stateless lookup.
