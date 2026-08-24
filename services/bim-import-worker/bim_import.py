"""BIM (IFC4) import → TwinEntity registration (spec §33.3, §33.4).

Parses an IFC4 (ISO 16739-1:2018) model and registers a TwinEntity per relevant building element,
mapping the IFC GlobalId to ``TwinEntity.digital_ref`` (22-character base64 GUID) and the IFC class
to the twin ``entity_type``.

Two injectable seams keep the mapping testable and honest about what is NOT built:

  - ``parse_ifc`` is injected. The real parser is ifcopenshell (a large native library) reading a
    ``.ifc`` file — NOT added here, and there are no ``.ifc`` fixtures in the repo, so the real parse
    path has never run. Tests inject a list of already-parsed elements.
  - ``register`` is injected (the DB writer). Tests capture the registrations.

MOCK-VERIFIED ONLY: the IFC→TwinEntity mapping is unit-tested against fake parsed elements; real IFC
parsing and DB writes have not run in this environment.
"""

from __future__ import annotations

from dataclasses import dataclass

# IFC class → twin entity_type (§33.4 enum: STRUCTURE / EQUIPMENT / MATERIAL_STOCK / ...).
# Only structural/spatial classes map to a twin today; others are skipped rather than guessed.
IFC_CLASS_TO_ENTITY_TYPE: dict[str, str] = {
    "IfcBuilding": "STRUCTURE",
    "IfcBuildingStorey": "STRUCTURE",
    "IfcSpace": "INSPECTION_ZONE",
    "IfcWall": "STRUCTURE",
    "IfcColumn": "STRUCTURE",
    "IfcBeam": "STRUCTURE",
    "IfcSlab": "STRUCTURE",
}


@dataclass
class IfcElement:
    global_id: str  # 22-char base64 IFC GlobalId
    ifc_class: str  # e.g. "IfcWall"
    name: str | None


@dataclass
class TwinEntityRegistration:
    tenant_id: str
    project_id: str
    entity_type: str
    digital_ref: str  # the IFC GlobalId
    name: str | None


def _valid_global_id(gid: str) -> bool:
    # IFC GlobalId is a 22-character base64 GUID (ISO 16739-1). Reject anything else so a malformed
    # model does not create entities with unusable digital refs.
    return isinstance(gid, str) and len(gid) == 22


def map_element(element: IfcElement, tenant_id: str, project_id: str) -> TwinEntityRegistration | None:
    """Map one IFC element to a TwinEntity registration, or None if it is not a twinnable class.

    Raises ValueError for an element of a twinnable class with an invalid GlobalId — that is a
    malformed model, not a skip.
    """
    entity_type = IFC_CLASS_TO_ENTITY_TYPE.get(element.ifc_class)
    if entity_type is None:
        return None  # not a class we track — skip, not an error
    if not _valid_global_id(element.global_id):
        raise ValueError(
            f"{element.ifc_class} has an invalid IFC GlobalId {element.global_id!r} (want 22 chars)"
        )
    return TwinEntityRegistration(
        tenant_id=tenant_id,
        project_id=project_id,
        entity_type=entity_type,
        digital_ref=element.global_id,
        name=element.name,
    )


async def import_model(
    *,
    tenant_id: str,
    project_id: str,
    ifc_bytes: bytes,
    parse_ifc,
    register,
) -> int:
    """Parse an IFC model and register a TwinEntity per twinnable element. Returns the count.

    ``parse_ifc(ifc_bytes) -> list[IfcElement]`` and ``register(TwinEntityRegistration) -> Awaitable``
    are injected. Non-twinnable classes are skipped; a twinnable element with a bad GlobalId aborts
    the import (the model is malformed).
    """
    elements = parse_ifc(ifc_bytes)
    registered = 0
    for element in elements:
        reg = map_element(element, tenant_id, project_id)
        if reg is None:
            continue
        await register(reg)
        registered += 1
    return registered
