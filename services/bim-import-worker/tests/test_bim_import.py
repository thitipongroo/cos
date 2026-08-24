"""T4 — BIM (IFC4) → TwinEntity mapping, MOCK-verified only.

No ifcopenshell and no .ifc fixtures in this env, so real IFC parsing has never run. These tests
inject already-parsed elements to verify the class→entity_type mapping, GlobalId validation, and the
skip/register decisions.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from bim_import import IfcElement, import_model, map_element

VALID_GID = "1hJK2eR9nA$xY7zQ3bC0dE"  # 22 chars


def test_maps_structural_class():
    reg = map_element(IfcElement(VALID_GID, "IfcWall", "West Wall"), "t1", "p1")
    assert reg is not None
    assert reg.entity_type == "STRUCTURE"
    assert reg.digital_ref == VALID_GID
    assert reg.name == "West Wall"


def test_space_maps_to_inspection_zone():
    reg = map_element(IfcElement(VALID_GID, "IfcSpace", "Room 101"), "t1", "p1")
    assert reg.entity_type == "INSPECTION_ZONE"


def test_untwinnable_class_is_skipped_not_errored():
    assert map_element(IfcElement(VALID_GID, "IfcFurnishingElement", "Chair"), "t1", "p1") is None


def test_invalid_global_id_on_twinnable_class_raises():
    with pytest.raises(ValueError, match="invalid IFC GlobalId"):
        map_element(IfcElement("too-short", "IfcWall", "x"), "t1", "p1")


@pytest.mark.asyncio
async def test_import_model_registers_only_twinnable_elements():
    captured = []

    async def register(reg):
        captured.append(reg)

    def fake_parse(_bytes):
        return [
            IfcElement(VALID_GID, "IfcWall", "Wall"),
            IfcElement("2hJK2eR9nA$xY7zQ3bC0dE", "IfcColumn", "Col"),  # 22 chars
            IfcElement(VALID_GID, "IfcFurnishingElement", "Chair"),  # skipped
        ]

    count = await import_model(
        tenant_id="t1", project_id="p1", ifc_bytes=b"<ifc>", parse_ifc=fake_parse, register=register
    )

    assert count == 2  # wall + column; chair skipped
    assert {r.entity_type for r in captured} == {"STRUCTURE"}
    assert len(captured) == 2
