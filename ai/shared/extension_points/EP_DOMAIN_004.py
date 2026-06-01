"""
EP-DOMAIN-004 — BIMProjectStructureImport
Phase 3 stub — IFC BIM file → COS project structure (phases + milestones).

Source: docs/specifications/13-product-architecture.md §13.4
Spec:   BIMIntegration Phase 3 — Project Structure Import
        IFC format: ISO 16739-1:2018 (IFC4 preferred, IFC 2x3 minimum)

Trigger: first tenant with BIM workflow onboards
DECIDED: IFC.js parser (@thatopen/engine or web-ifc) — platform-agnostic
         Autodesk Forge / Trimble Connect are optional vendor-specific add-ons
         added only when a tenant requires cloud-based BIM platform sync

IFC mapping (Phase 3):
  IfcBuildingStorey → project phases
  IfcSpace          → milestones

Note: BOQ auto-population from BIM quantities (Phase 4) is a SEPARATE EP
      (EP-DOMAIN-005 — BIMQuantitiesImport), same IFC parser, different entry point.
"""

from dataclasses import dataclass, field

from ai.shared.stub_base import StubBase


@dataclass
class BIMStructureResult:
    phases_created: int = 0
    milestones_created: int = 0
    unmapped_elements: list[str] = field(default_factory=list)
    ifc_version: str = ""


class BIMProjectStructureImport(StubBase):
    """
    Parses an IFC BIM file and creates project phases + milestones in COS.

    Implement when:
    - First tenant with BIM workflow onboards, OR
    - IFC.js (@thatopen/engine) integration is approved and funded.

    Safe defaults: returns zero-count BIMStructureResult (no project structure created).
    """

    EP_ID = "EP-DOMAIN-004"
    EP_VERSION = "0.1.0"
    TRIGGER = "First tenant with BIM workflow onboards (IFC.js parser integration)"
    PHASE = "Stage 2 — Multi-project SaaS (Phase 3)"

    def import_project_structure(
        self,
        bim_file_url: str,
        project_id: str,
        tenant_id: str,
    ) -> BIMStructureResult:
        """
        Parse IFC file at bim_file_url, extract IfcBuildingStorey → phases
        and IfcSpace → milestones, create them in the COS project.
        Safe default: returns BIMStructureResult with zero counts.
        """
        self.log_stub_call(
            "import_project_structure",
            {
                "bim_file_url": bim_file_url,
                "project_id": project_id,
                "tenant_id": tenant_id,
            },
        )
        return BIMStructureResult()

    def validate_ifc_file(self, bim_file_url: str) -> dict[str, object]:
        """
        Validate IFC file format and version before import attempt.
        Returns { valid: bool, ifc_version: str, element_count: int, errors: list }.
        Safe default: returns { valid: False }.
        """
        self.log_stub_call("validate_ifc_file", {"bim_file_url": bim_file_url})
        return {"valid": False, "ifc_version": "", "element_count": 0, "errors": []}
