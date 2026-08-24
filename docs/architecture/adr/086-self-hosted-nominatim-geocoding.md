# ADR-086: Self-hosted Nominatim for reverse geocoding

**Date:** 2026-08-07
**Status:** Accepted
**Deciders:** Product owner (recorded retroactively — see Context)
**Tags:** architecture | infra | data

---

## Context

`backend/src/modules/geo/` reverse-geocodes a latitude/longitude pair into a human-readable address.
Site reports, issues, photos and workforce check-ins all carry coordinates, so this runs on ordinary
field traffic rather than as an occasional lookup.

The implementation has been in the tree and in `docker-compose.yml` since the
`20260705000001_geo_coordinates` migration, but **no file under `docs/specifications/` or `context/`
named Nominatim**. It surfaced on 2026-08-07 while filling `docs/architecture/README.md`: a grep for
every element drawn in the C4 Context view found this one had no specification behind it. QM-11
requires every architectural decision to be recorded; this ADR records a decision that was already
made and shipped, rather than making a new one.

## Decision

Reverse geocoding is served by a **self-hosted Nominatim instance**, not a third-party geocoding API.

- Image `mediagis/nominatim:4.4`, `full` Compose profile, published on `${NOMINATIM_PORT:-8082}`
  (host) → `8080` (container).
- Data: the Geofabrik **Thailand** extract (`thailand-latest.osm.pbf`) with `IMPORT_STYLE: address`
  and Geofabrik's Thailand replication feed for updates.
- The backend reads `NOMINATIM_URL` (default `http://nominatim:8080`) and calls
  `/reverse?format=jsonv2`.
- The call **degrades gracefully**: a non-200 response, a network failure or a 5-second timeout logs
  at `WARN` and resolves `address` to `null` — it never throws and never blocks the write that
  carried the coordinate.

## Rationale

The header comment on `geo.service.ts` states the reason directly: _"External geocoding stays
in-tenant (no third-party call)."_

- **Data residency and PDPA.** A coordinate captured on a Thai construction site is personal data
  under QM-5 when it is attached to a worker's check-in or a user's report. Sending it to a
  third-party geocoder would be a cross-border transfer of exactly the kind §5.6 and the
  `ap-southeast-7` residency rule constrain. Self-hosting removes the transfer entirely rather than
  managing it.
- **Consistent with the platform's other enrichment choice.** ADR-080 resolved network-origin
  enrichment the same way — self-hosted GeoLite2, derived at read time, never persisted. Geocoding
  follows that precedent instead of contradicting it.
- **No per-call cost or rate limit** on a lookup that runs on ordinary field traffic.
- **Degrading to `null` is the correct failure mode.** The address is a convenience rendering of a
  coordinate that is already stored; losing it must never cost the underlying record.

> **Alternatives considered are not on record.** The decision predates this ADR and no comparison of
> Google/Mapbox/HERE against self-hosting was written down at the time. This section states the
> rationale evidenced in the code and the surrounding decisions — it does not reconstruct a
> trade-off study that may never have happened.

## Consequences

### Positive

- No coordinate leaves the deployment; the PDPA/GDPR data-flow map has one fewer processor and no DPA
  is required for geocoding.
- No API key to rotate (QM-4) and no third-party quota to monitor.
- Works in an air-gapped on-premise deployment, which a hosted geocoding API cannot.

### Negative

- Operational weight: the Thailand OSM import is slow on first boot (`start_period: 60s` on the
  healthcheck is explicitly there because the HTTP port does not listen until the import finishes),
  needs `shm_size: 1gb`, and carries its own PostgreSQL volume.
- **Coverage is Thailand only.** The configured extract is `asia/thailand-latest`. A project outside
  Thailand reverse-geocodes to `null`, silently, because that is the graceful-degrade path. Serving
  another region means adding its extract and re-importing.
- Address quality is OSM's, which is uneven for Thai rural addresses compared with a commercial
  provider.

### Neutral

- The service sits in the `full` Compose profile, so the default local `make docker-up` does not
  start it; `GeoService` then degrades to `null` addresses, which is expected in dev.
- Port `8082`, not `8081` — Schema Registry owns `8081` and both are in the `full` profile, so they
  raced for the port. Schema Registry is required infrastructure (QM-9), so Nominatim moved.

## References

- `backend/src/modules/geo/geo.service.ts` — the implementation and its stated rationale
- `docker-compose.yml` — the `nominatim` service definition
- `.env.example` — `NOMINATIM_URL`, `NOMINATIM_PORT`, `NOMINATIM_PASSWORD`
- `backend/prisma/migrations/20260705000001_geo_coordinates/` — the coordinate columns this serves
- [ADR-080](080-geoip-enrichment-and-behavioral-context.md) — self-hosted GeoLite2, the same
  in-tenant-enrichment stance
- [`05-security-compliance.md`](../../specifications/05-security-compliance.md) §5.6 — data residency
- `docs/registers/data-flow-map.md` — where geocoding appears in the PDPA data flow
