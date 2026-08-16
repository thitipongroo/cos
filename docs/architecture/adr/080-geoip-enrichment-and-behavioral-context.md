# 080: Network-origin enrichment — self-hosted GeoLite2, derived at read time, never persisted

**Date:** 2026-08-04
**Status:** Accepted
**Deciders:** Product owner (thitipongroo), engineering
**Tags:** security, data, infra, mobile

---

## Context

The mockup `mockup/mobile/01_authen/05_privacy_policy/01_data_collection/03_01_ip_address_details`
shows a network-origin panel: current ingress IP, ISP provider, connection type ("5G Cellular"),
physical origin ("Seattle, WA Region"), round-trip latency, and a "Behavioral Context: Stationary
Worker" row.

Only the IP exists today. `platform.audit_logs.ip_address` is a real `INET` column, tagged
`@pdpa(category: "operational") — network identifier, personal data under GDPR Rec. 30`. Everything
else in that panel has no source: a `grep` across `docs/` for `GeoIP|MaxMind|IP2Location|ipinfo`
returns a single unrelated CSP `Permissions-Policy` line, so **no geo-IP provider is specified
anywhere** — an UNSPECIFIED item under `context.md`, which requires escalation rather than invention.

The companion mockup `03_02_network_refresh_success` compounds this: it offers a "Request Network
Refresh" action and reports the ingress IP "re-verified against project geo-fencing protocols".
Neither exists. `transparency-location.tsx` already documents, against migration
`20260705000001_geo_coordinates`, that the platform has **no geofencing and no background location
service** — coordinates are optional per saved record on five tables and nothing more.

## Decision

**Provider: MaxMind GeoLite2, self-hosted as a database file in the cluster.** The lookup runs
in-process against the local DB; the user's IP is never sent to a third party.

**Derived at read time, never persisted.** City / region / ASN (the ISP name) are computed when the
transparency screen renders, for the calling user's own record, and discarded. No new column is added
to `audit_logs` or anywhere else. This is the load-bearing part of the decision: `ip_address` is
already collected and already tagged, so deriving a label from it for the subject's own transparency
view adds **no new stored personal data** and therefore no new retention obligation.

**Latency and connection type are measured, not looked up.** Round-trip latency is the client's own
measurement of a real request. Connection type (`wifi` / `cellular` / …) comes from
`@react-native-community/netinfo`, already a dependency. Neither is inferred from the IP, and neither
is stored.

**Behavioral Context is computed from data already held**, under a rule the product owner set on
2026-08-04:

> A worker is **Stationary** when every `workforce_telemetry.attendance_logs` coordinate for that
> worker in the last **7 days** lies within **100 m** of their centroid, and there are **≥ 3** such
> points. Fewer than 3 points renders _Insufficient data_ — never "Stationary".

100 m is wider than consumer-GPS error and narrower than the distance between two construction sites,
so it separates "one site" from "moving between sites" without turning GPS jitter into a label.

**Lawful basis.** Deriving a behavioural label is **profiling**. It is gated on the `operational`
consent purpose, and coordinate collection on the `location` purpose, both per ADR-079. Without
consent the row renders _Not enabled_, not a guess.

**`03_02` is repurposed.** "Request Network Refresh" becomes a **re-attestation** action calling the
existing `POST /auth/otp/attest` (ADR-054): it re-proves device possession, refreshes the trust
window and writes an audit entry. The geo-fencing sentence is deleted rather than reworded — there is
no geofence to re-verify against.

**Retention copy is corrected.** The mockup's "Data is retained for 30 days" is replaced by the real
schedule already stated on the shipped `transparency-logs.tsx`: application logs 30 days hot / 1 year
cold in Loki, audit entries 7 years in WORM (spec §31.2, §31.4).

## Rationale

- **Self-hosted beats a SaaS lookup on three independent grounds.** It sends no user IP off-platform,
  so QM-5's cross-border rule (Thai-origin data stays in `ap-southeast-7`) is not engaged and no DPA
  is needed. It works air-gapped, which the on-premise RKE2 deployments require. And it adds no
  per-request network hop to a screen with a latency budget.
- **Read-time derivation is the smallest possible privacy footprint.** Persisting city/ASN would
  create a new PII column, a new retention row, a new data-flow-map entry and a new erasure target —
  all to cache a value that is cheap to recompute and only ever shown to its own subject.
- **A measured number beats an inferred one.** Geo-IP "connection type" and latency estimates are
  guesses about the network; the device knows both for certain. Using the device's own reading is
  both more accurate and less data.
- **A stated threshold beats a vague label.** "Stationary Worker" with no definition cannot be
  contested by the subject. The rule above is checkable, and the ≥ 3-point floor keeps a single
  check-in from producing a confident-looking label.

Alternatives rejected: **ipinfo / IP2Location SaaS** (sends user IPs to a processor, needs a DPA,
fails air-gapped, and engages the cross-border rule); **persisting city/ASN on `audit_logs`** (new
PII column for no gain); **dropping the Behavioral Context row** (the product owner chose to keep it,
2026-08-04); **inferring "stationary" from IP/ASN stability** (that describes the network, not the
worker — a category error dressed as behaviour).

## Consequences

### Positive

- The panel shows real values with a stated derivation, and the subject can check the rule.
- No new PII is stored, so the erasure and retention surfaces do not grow.

### Negative

- The GeoLite2 database is an artefact that must be shipped, refreshed and — in air-gapped
  installations — dropped in manually; a stale DB silently degrades accuracy.
- GeoLite2 download requires a MaxMind account and licence key and is distributed under MaxMind's
  own EULA. **The licence terms must be confirmed by legal before the first production deploy** —
  this ADR selects the technology, it does not clear the licence.
- Behavioral Context is only as good as attendance coverage; workers who do not check in show
  _Insufficient data_.

### Neutral

- City-level accuracy only. Street-level origin is out of scope and is not claimed on screen.

## References

- `backend/prisma/migrations/20260803000001_tag_pii_columns/` (`audit_logs.ip_address`,
  `attendance_logs.latitude/longitude`)
- `backend/prisma/migrations/20260705000001_geo_coordinates/` (the five nullable lat/lng tables)
- `apps/mobile/src/app/(app)/transparency-location.tsx` (no geofencing), `transparency-logs.tsx`
  (real retention tiers)
- `docs/specifications/31-monitoring-observability.md` §31.2, §31.4 · `context.md` QM-5, QM-8
- ADR-079 (consent purposes this depends on), ADR-054 (`/auth/otp/attest`, reused by `03_02`)
- `mockup/mobile/01_authen/05_privacy_policy/01_data_collection/03_01_ip_address_details`,
  `03_02_network_refresh_success`
- **Those drawings were withdrawn on 2026-08-15**, with the whole `01_data_collection/**` set (~114
  screens). This decision and the screen it shipped are unaffected — ADR-085.
