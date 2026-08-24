"""Behavioural gaps the existing suite leaves open despite 100% line coverage.

Line coverage was already 100% before this file existed, which is exactly why it is worth adding:
the uncovered risk here is not unreached lines, it is unasserted decisions.

  - Only 3 of the 7 entries in IFC_CLASS_TO_ENTITY_TYPE were exercised. A typo in any other entry
    (or a silently dropped row) would make real building elements vanish from the twin with no test
    turning red — the mapping table is data, and untested data is the easiest thing to break.
  - `import_model`'s docstring promises a malformed GlobalId "aborts the import". Nothing asserted
    that, nor what happens to elements already registered before the bad one.
  - `_valid_global_id` guards `isinstance(gid, str)`, but a non-string GlobalId was never passed.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from bim_import import (
    IFC_CLASS_TO_ENTITY_TYPE,
    IfcElement,
    TwinEntityRegistration,
    import_model,
    map_element,
)

VALID_GID = "1hJK2eR9nA$xY7zQ3bC0dE"  # 22 chars
OTHER_GID = "2hJK2eR9nA$xY7zQ3bC0dE"


class TestMappingTable:
    @pytest.mark.parametrize(
        ("ifc_class", "expected"),
        [
            ("IfcBuilding", "STRUCTURE"),
            ("IfcBuildingStorey", "STRUCTURE"),
            ("IfcSpace", "INSPECTION_ZONE"),
            ("IfcWall", "STRUCTURE"),
            ("IfcColumn", "STRUCTURE"),
            ("IfcBeam", "STRUCTURE"),
            ("IfcSlab", "STRUCTURE"),
        ],
    )
    def test_every_declared_class_maps_to_its_entity_type(self, ifc_class, expected):
        reg = map_element(IfcElement(VALID_GID, ifc_class, "el"), "t1", "p1")
        assert reg is not None
        assert reg.entity_type == expected

    def test_the_parametrised_cases_cover_the_whole_table(self):
        # Guards the test above: adding a row to the mapping without a case here must fail, otherwise
        # the "every declared class" claim quietly stops being true.
        covered = {
            "IfcBuilding",
            "IfcBuildingStorey",
            "IfcSpace",
            "IfcWall",
            "IfcColumn",
            "IfcBeam",
            "IfcSlab",
        }
        assert set(IFC_CLASS_TO_ENTITY_TYPE) == covered

    def test_entity_types_stay_within_the_spec_enum(self):
        # §33.4 TwinEntity.entity_type enum — an invented value would be rejected downstream.
        allowed = {"STRUCTURE", "EQUIPMENT", "MATERIAL_STOCK", "WORKFORCE_ZONE", "INSPECTION_ZONE"}
        assert set(IFC_CLASS_TO_ENTITY_TYPE.values()) <= allowed


class TestGlobalIdValidation:
    @pytest.mark.parametrize("bad", ["", "short", "x" * 21, "x" * 23])
    def test_wrong_length_is_rejected(self, bad):
        with pytest.raises(ValueError, match="invalid IFC GlobalId"):
            map_element(IfcElement(bad, "IfcWall", "w"), "t1", "p1")

    def test_non_string_global_id_is_rejected(self):
        # A malformed model can yield None/int here; `len()` would TypeError without the isinstance
        # guard, turning a data problem into a crash.
        with pytest.raises(ValueError, match="invalid IFC GlobalId"):
            map_element(IfcElement(None, "IfcWall", "w"), "t1", "p1")

    def test_untwinnable_class_is_skipped_before_the_id_is_validated(self):
        # Order matters: a chair with a broken GlobalId is still just a chair, not a malformed model.
        assert map_element(IfcElement("bad", "IfcFurnishingElement", "Chair"), "t1", "p1") is None


class TestRegistrationPayload:
    def test_carries_tenant_project_and_digital_ref(self):
        reg = map_element(IfcElement(VALID_GID, "IfcSlab", "Level 3 slab"), "tenant-a", "proj-b")

        assert isinstance(reg, TwinEntityRegistration)
        assert reg.tenant_id == "tenant-a"
        assert reg.project_id == "proj-b"
        # digital_ref IS the IFC GlobalId (§33.4) — the join key back to the source model.
        assert reg.digital_ref == VALID_GID

    def test_missing_name_is_preserved_as_none(self):
        # IFC elements are not required to be named; inventing a placeholder would be a fake record.
        assert map_element(IfcElement(VALID_GID, "IfcBeam", None), "t1", "p1").name is None


class TestImportModel:
    @pytest.mark.asyncio
    async def test_empty_model_registers_nothing(self):
        registered = []

        async def register(reg):
            registered.append(reg)

        count = await import_model(
            tenant_id="t1",
            project_id="p1",
            ifc_bytes=b"",
            parse_ifc=lambda _b: [],
            register=register,
        )

        assert count == 0
        assert registered == []

    @pytest.mark.asyncio
    async def test_parser_receives_the_model_bytes(self):
        seen = {}

        def fake_parse(data):
            seen["bytes"] = data
            return []

        await import_model(
            tenant_id="t1",
            project_id="p1",
            ifc_bytes=b"ISO-10303-21;",
            parse_ifc=fake_parse,
            register=lambda _r: None,
        )

        assert seen["bytes"] == b"ISO-10303-21;"

    @pytest.mark.asyncio
    async def test_a_malformed_global_id_aborts_the_import(self):
        # The docstring promises an abort rather than a skip: a model with a bad GlobalId is not
        # partially importable, because the missing elements would look like a complete twin.
        registered = []

        async def register(reg):
            registered.append(reg)

        def fake_parse(_b):
            return [
                IfcElement(VALID_GID, "IfcWall", "good"),
                IfcElement("bad", "IfcColumn", "malformed"),
                IfcElement(OTHER_GID, "IfcBeam", "never reached"),
            ]

        with pytest.raises(ValueError, match="invalid IFC GlobalId"):
            await import_model(
                tenant_id="t1",
                project_id="p1",
                ifc_bytes=b"<ifc>",
                parse_ifc=fake_parse,
                register=register,
            )

        # Elements before the bad one were already written — the caller must roll back. This asserts
        # the observable behaviour so a future change to transactional semantics is a visible break.
        assert [r.name for r in registered] == ["good"]

    @pytest.mark.asyncio
    async def test_registration_order_follows_the_parsed_order(self):
        registered = []

        async def register(reg):
            registered.append(reg)

        def fake_parse(_b):
            return [
                IfcElement(VALID_GID, "IfcBuilding", "first"),
                IfcElement(OTHER_GID, "IfcSpace", "second"),
            ]

        count = await import_model(
            tenant_id="t1",
            project_id="p1",
            ifc_bytes=b"<ifc>",
            parse_ifc=fake_parse,
            register=register,
        )

        assert count == 2
        assert [r.name for r in registered] == ["first", "second"]
