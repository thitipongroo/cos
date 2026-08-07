# ADR-087: Two IFC parsers, one per runtime — ifcopenshell (Python) and web-ifc (TypeScript)

**Date:** 2026-08-07
**Status:** Accepted
**Deciders:** Product Owner
**Tags:** architecture | data

---

## Context

The platform reads IFC (ISO 16739-1) in **two separate places, for two different outputs, in two
different runtimes**. Until now neither the parser choice nor the fact that there are two of them was
recorded anywhere, which is how the runtime of one of them silently drifted.

|              | §13.4 BIM Integration                                                                     | §33.3 BIM import                                    |
| ------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Output       | `importQuantities` → BOQ line items · `importProjectStructure` → project structure        | IFC element → `TwinEntity` (Digital Twin, Phase 24) |
| Lives in     | `backend/src/modules/boq/ep/bim-boq-import.stub.ts`, `project/ep/bim-integration.stub.ts` | `services/bim-import-worker/bim_import.py`          |
| Runtime      | TypeScript, inside the NestJS monolith                                                    | Python, separate deployable                         |
| Parser named | IFC.js / `web-ifc` (`13-product-architecture` §13.4)                                      | `ifcopenshell`                                      |

`bim_import.py` contains no BOQ or quantity logic — the two paths do not overlap.

**What went wrong without this record.** On 2026-08-07, commit `8857bb1` added a Deployable Units row
declaring the BIM Import Worker to be **Go**, inferred from the three `*-worker` rows above it. The
directory has never contained a `.go` file. There was no ADR to contradict the guess, and the correct
value — Python, stated in `33-digital-twin-iot.md` since 2026-05-29 — was in a file that commit never
opened. See ADR-088 / `scripts/readiness/check-service-runtimes.sh` for the mechanical guard added in
response.

## Decision

Keep **both** parsers. Each stays in the runtime of the code that calls it:

- **`ifcopenshell`** (Python) — `services/bim-import-worker/`, the Phase 24 Digital Twin path.
- **`web-ifc`** / IFC.js (TypeScript) — the §13.4 extension-point stubs inside the monolith.

Neither path is rewritten to match the other. `docs/specifications/32-implementation-specifications.md`
§32.2 remains the single canonical declaration of each service's runtime.

## Rationale

**Why not consolidate on one parser.** Consolidating would force one of the two callers across a
process boundary for no functional gain: either the BOQ module gives up an in-process stub and starts
calling the Python worker over HTTP/Kafka, or the Digital Twin worker is rewritten in TypeScript.
Both stubs are Type A fail-fast stubs that no tenant has triggered yet (§32.9), so the cost is real
and the benefit is speculative — R-06 (premature complexity) applies.

**Why not Go**, despite the three sibling `*-worker` services being Go: no usable IFC/STEP parser
exists for Go. The mature implementations are C++, Python, C# and JS/TS (Hypar's `IFC-gen` emits C#).
Choosing Go would mean hand-writing an ISO 10303-21 parser plus the IFC 4.3 EXPRESS schema. The only
argument for it was operational symmetry with the other workers, which is not worth a bespoke parser.

**Why `ifcopenshell` for the twin worker.** It is the reference open-source IFC toolkit (C++ core,
Python bindings) with complete parsing support through **IFC4x3 Add2** — the finalised schema that
INT-004 makes normative — and it backs IfcConvert and Bonsai/BlenderBIM. The repo already runs four
other Python services with a ruff + pytest CI lane, so it adds no toolchain.

**Why `web-ifc` for the monolith stubs.** §13.4 already specifies the interface in TypeScript, and
`web-ifc` (C++ compiled to WASM, JS/TS bindings, That Open Company) runs in the same process as the
BOQ and project modules that consume it.

## Consequences

### Positive

- No rewrite: both paths keep the parser native to their runtime, and no call crosses a process
  boundary that did not already cross one.
- The Digital Twin path uses the only toolkit verified to parse the final IFC4x3 Add2 schema.

### Negative

- **INT-004 conformance now has two surfaces.** IFC 4.3 (ISO 16739-1:2023) is normative for ecosystem
  output; each parser must be validated against it independently, and a conformance gap can appear in
  one path while the other passes.
- **`web-ifc`'s IFC4x3 support is unconfirmed at the final schema.** The evidence reviewed points to
  `IFC4X3_RC4` (a release candidate), not Add2. This must be verified before the §13.4 stubs are
  implemented; if `web-ifc` cannot reach the final schema, revisit this ADR rather than shipping a
  non-conformant BOQ import.

### Neutral

- Two IFC dependencies to track for CVEs (`ifcopenshell` in `requirements.txt`, `web-ifc` in
  `apps`/`backend` once the stubs are implemented).
- `services/bim-import-worker/` remains MOCK-VERIFIED ONLY — the real parse path has never run, there
  are no `.ifc` fixtures in the repo, and there is no consumer loop yet.

## References

- `docs/specifications/13-product-architecture.md` §13.4 — BIM Integration extension point
- `docs/specifications/33-digital-twin-iot.md` §33.3, §33.4 — Digital Twin BIM import
- `docs/specifications/33-digital-twin-iot.md` § Industry Standardization Alignment — INT-004, IFC 4.3 normative
- `docs/specifications/32-implementation-specifications.md` §32.2 — canonical runtime table; §32.9 — Type A stub behaviour
- ADR-088 — canonical runtime declaration + `check-service-runtimes.sh` fitness function
- [IfcOpenShell](https://ifcopenshell.org/) — C++/Python IFC toolkit; IFC4x3 Add2 parsing
- [ThatOpen/engine_web-ifc](https://github.com/thatopen/engine_web-ifc) — IFC read/write for JS at native speed (WASM)
