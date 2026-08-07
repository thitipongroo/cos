# ADR-088: One canonical service-runtime table, enforced by a CI fitness function

**Date:** 2026-08-07
**Status:** Accepted
**Deciders:** Product Owner
**Tags:** architecture | infra

---

## Context

Each service's runtime was written down in four hand-maintained places: the Deployable Units table in
`32-implementation-specifications.md` §32.2, the `DEPLOYABLE UNITS` box in
`context/00_master_construction_os.md`, the Service Assignment table in `33-digital-twin-iot.md`, and
the monorepo tour in the root `README.md`. None was designated authoritative, and nothing compared
any of them to the repository.

On 2026-08-07, commit `8857bb1` — titled "close seven documentation defects while filling the
READMEs" — added a new row declaring the **BIM Import Worker** to be **Go**, in both §32.2 and the
master document. `services/bim-import-worker/` has never contained a `.go` file: it is Python
(`python:3.12-slim`, `ifcopenshell`, `asyncpg`). The value was inferred from the three `*-worker` rows
directly above it, all of which are genuinely Go. `33-digital-twin-iot.md` had said Python since the
first specs commit on 2026-05-29, but that file was not open in the same commit.

The mistake was plausible, passed review, and would have been repeated: **a fact stored in four
places with no owner and no automated check drifts on the first inference anyone makes.**

## Decision

1. **§32.2 is the canonical declaration of every service runtime.** It is the only place a runtime is
   maintained by hand.
2. **The Runtime column is deleted from `00_master_construction_os.md` §DEPLOYABLE UNITS and from
   `33-digital-twin-iot.md` §Service Assignment**, along with the runtime labels in §33's topology
   diagram and deployment list. Those documents name services; they no longer name languages.
3. **The root `README.md` may describe a runtime** (the monorepo tour is much less useful without it),
   but it is verified, not trusted.
4. **`scripts/readiness/check-service-runtimes.sh` runs in the CI lint job on every PR.** It derives
   each service's real runtime from the build file present — `go.mod` → Go, `requirements.txt` →
   Python, `package.json` → Node — and fails on:
   - a §32.2 row that disagrees with disk;
   - a service directory missing from §32.2 entirely;
   - **any** runtime reappearing in a stripped table, even a correct one (that is the duplication
     coming back);
   - a README runtime that contradicts disk.

## Rationale

Documenting the correction alone would have fixed one row and left the mechanism intact. The
literature is consistent on both halves of the fix:

- **Single source of truth.** Spotify's Backstage keeps service metadata in a `catalog-info.yaml`
  next to the code, maintained by the owning team through the normal Git workflow; Roadie describes
  running multiple catalogues as "the danger zone". Google's practice is to designate canonical
  documentation and consolidate or deprecate the duplicates.
- **Fitness functions.** Thoughtworks has carried architectural fitness functions on the Technology
  Radar since 2017: automated checks in the delivery pipeline that verify an architectural
  constraint. The distinction that matters here is between _documenting_ a decision and
  _operationalizing_ it — putting it in the path of delivery so it is checked on every change.

A full descriptor-and-generator system (a `service.yaml` per service, tables generated from it) was
considered and rejected for a ten-service repository: it is more machinery than the problem needs and
runs into R-06 (premature complexity). Stripping the duplicates and adding one comparison achieves the
same guarantee.

The mirror scan is deliberately restricted to **structured table rows**. An earlier version matched
any line naming a service and a language, which flagged a paragraph about OTel head-sampling reading
"(services/ai-gateway/otel.py) or Node (@cos/tracing)". A fitness function that reports false
positives gets switched off, which is worse than not having one.

## Consequences

### Positive

- The 2026-08-07 defect is now caught mechanically. Back-tested: reintroducing `Go` into §32.2 fails
  the check, as does re-adding a Runtime column to the master table — even with the correct value.
- A new service that is not listed in §32.2 fails CI, so the canonical table cannot silently fall
  behind the directory listing.

### Negative

- `00_master_construction_os.md` is the agent execution view, and an agent that needs a runtime must
  now open §32.2. This is the intended cost of having one copy.
- The check recognises exactly three runtimes (Go / Python / Node). A service introduced in a fourth
  language requires updating `detect_runtime` and `normalize_declared`.

### Neutral

- The check runs repo-wide rather than on changed files only: the failure it guards against is a
  table edited in isolation from the directory it describes, so scoping it to changed files would
  miss the case it exists for.

## References

- `docs/specifications/32-implementation-specifications.md` §32.2 — the canonical table
- `scripts/readiness/check-service-runtimes.sh` — the fitness function
- `context.md` § Readiness & Verification — script registry
- Rule 37 (spec/context drift) and Rule 36 (evidence before claiming completion)
- ADR-087 — the BIM parser decision whose runtime was the value that drifted
- [Backstage Software Catalog](https://backstage.io/docs/features/software-catalog/)
- [Entering the Danger Zone: Multiple Software Catalogs — Roadie](https://roadie.io/blog/entering-the-danger-zone-multiple-software-catalogs/)
- [Fitness function-driven development — Thoughtworks](https://www.thoughtworks.com/insights/articles/fitness-function-driven-development)
- [Software Engineering at Google, ch. 10 — Documentation](https://abseil.io/resources/swe-book/html/ch10.html)
