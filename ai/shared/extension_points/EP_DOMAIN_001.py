"""
EP-DOMAIN-001 — SalesforceAdapter (CRM Integration)
Phase 3 stub — CRM → COS project creation via Salesforce REST API.

Source: docs/specifications/13-product-architecture.md §13.4
Spec:   CRMIntegration, Strategy pattern, one-direction (CRM → COS only)

Trigger: first tenant that uses Salesforce onboards and requests CRM → project sync
DECIDED: Salesforce REST API, won Opportunity → COS project creation

Data flow:
  Salesforce Opportunity (stage="Closed Won") → webhook POST → COS webhook receiver
  → SalesforceAdapter.create_project_from_lead() → construction.project.created.v1

Field mapping is configured per-tenant in tenant settings (not hardcoded here).
"""

from dataclasses import dataclass
from typing import Any

from ai.shared.stub_base import StubBase


@dataclass
class CRMLeadContext:
    crm_lead_id: str
    tenant_id: str
    raw_payload: dict[str, Any]


@dataclass
class ProjectCreationResult:
    project_id: str
    project_code: str
    project_name: str


class SalesforceAdapter(StubBase):
    """
    CRM adapter for Salesforce REST API.
    Converts a won Salesforce Opportunity into a COS project via
    createProjectFromLead().
    """

    EP_ID = "EP-DOMAIN-001"
    EP_VERSION = "0.1.0"
    TRIGGER = "First tenant that uses Salesforce onboards and requests CRM → project sync"
    PHASE = "Stage 2 — Multi-project SaaS (Phase 3)"

    def create_project_from_lead(
        self,
        crm_lead_id: str,
        tenant_id: str,
        raw_payload: dict[str, Any] | None = None,
    ) -> ProjectCreationResult:
        """
        Map a won Salesforce Opportunity to a COS project and trigger creation.
        Safe default: returns empty ProjectCreationResult.
        """
        self.log_stub_call(
            "create_project_from_lead",
            {"crm_lead_id": crm_lead_id, "tenant_id": tenant_id},
        )
        return ProjectCreationResult(
            project_id="",
            project_code="",
            project_name="",
        )

    def validate_webhook_signature(
        self,
        payload: bytes,
        signature_header: str,
        secret: str,
    ) -> bool:
        """
        Verify HMAC-SHA256 webhook signature from Salesforce.
        Safe default: returns False (deny unsigned requests).
        """
        self.log_stub_call("validate_webhook_signature", {})
        return False
