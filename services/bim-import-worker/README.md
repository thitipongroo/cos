# Construction OS — BIM Import Worker (Python)

**Runtime:** Python 3.12
**Deployable:** Separate from the NestJS monolith
**Spec:** [`33-digital-twin-iot`](../../docs/specifications/33-digital-twin-iot.md) §33.3, §33.4 ·
BIM extension point: [`13-*`](../../docs/specifications/) §13.4

> **Runtime note.** This service is Python. `32-implementation-specifications.md` §Deployable Units
> and `context/00_master_construction_os.md` currently list it as **Go** — that row was written from
> the sibling `*-worker` entries rather than from this directory, which has never contained a `.go`
> file. `33-digital-twin-iot.md` (§33.3, §33.4 and the service table) has said Python since the specs
> were first written, and matches the `python:3.12-slim` Dockerfile and `ifcopenshell` requirement.

## Purpose

Parses an **IFC4** model (ISO 16739-1:2018) and registers one **TwinEntity** per relevant building
element, so the Digital Twin has a digital counterpart for each physical structure.

The mapping it owns:

- IFC `GlobalId` (22-character base64 GUID) → `TwinEntity.digital_ref`
- IFC class → twin `entity_type` (§33.4 enum), via `IFC_CLASS_TO_ENTITY_TYPE`:
  `IfcBuilding` / `IfcBuildingStorey` / `IfcWall` / `IfcColumn` / `IfcBeam` → `STRUCTURE`,
  `IfcSpace` → `INSPECTION_ZONE`

Classes with no defined mapping are **skipped, not guessed**.

> ⚠️ **MOCK-VERIFIED ONLY.** The IFC→TwinEntity mapping is unit-tested against fake parsed elements.
> Real IFC parsing and real DB writes have not run in this environment: there are no `.ifc` fixtures
> in the repo, and there is **no consumer loop yet** — the container entrypoint only imports the
> module and prints a readiness line.

## Public API

This is a **library module** (`bim_import.py`), not a server. Two seams are injected by the caller,
which is what keeps the mapping testable without a native parser or a database:

| Symbol                                        | Kind      | Contract                                                                                          |
| --------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| `IfcElement`                                  | dataclass | One parsed IFC element (input)                                                                    |
| `TwinEntityRegistration`                      | dataclass | One twin registration (output)                                                                    |
| `map_element(element, tenant_id, project_id)` | function  | Returns a `TwinEntityRegistration`, or `None` if the class is unmapped or the GlobalId is invalid |
| `parse_ifc`                                   | injected  | Real implementation is `ifcopenshell` reading a `.ifc` file                                       |
| `register`                                    | injected  | Real implementation is the `asyncpg` writer                                                       |

## Dependencies

**Runtime** (`requirements.txt`) — `ifcopenshell>=0.8` (native IFC parser), `asyncpg>=0.29`
(TwinEntity registration).

**Test** (`requirements-dev.txt`) — `pytest`, `pytest-asyncio`, `pytest-cov` only. This file
deliberately does **not** `-r requirements.txt`, unlike the sibling services: `bim_import.py` imports
nothing from `ifcopenshell` or `asyncpg` because both seams are injected, so pulling a large native
wheel into every CI run would buy nothing. Add the include the moment a test needs the real parser.

## Configuration

None. The module reads no environment variables — `tenant_id` and `project_id` are passed as
arguments by the caller, and the DB writer is injected. Configuration arrives when the consumer loop
is built.

## Usage example

```python
from bim_import import IfcElement, map_element

element = IfcElement(global_id="3vB2YO$MX3$uPqBFvQ_0Zj", ifc_class="IfcColumn", name="C-12")
registration = map_element(element, tenant_id=TENANT_ID, project_id=PROJECT_ID)
# -> TwinEntityRegistration(entity_type="STRUCTURE", digital_ref="3vB2YO$MX3$uPqBFvQ_0Zj", ...)
# -> None for an unmapped IFC class or a malformed GlobalId
```

## Tests

```bash
cd services/bim-import-worker
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
pytest        # pytest.ini enforces the QM-1 coverage gate via addopts
```
