"""
EP-DOMAIN-002 — HubSpotAdapter (CRM Integration)
Phase 3 stub — CRM → COS project creation via HubSpot Webhooks.

Source: docs/specifications/13-product-architecture.md §13.4
Spec:   CRMIntegration, Strategy pattern, one-direction (CRM → COS only)

Trigger: first tenant that uses HubSpot onboards and requests CRM → project sync
DECIDED: HubSpot Webhooks, deal stage "Closed Won" → COS project creation

Data flow:
  HubSpot Deal (stage="closedwon") → webhook POST → COS webhook receiver
  → HubSpotAdapter.create_project_from_lead() → construction.project.created.v1

Field mapping is configured per-tenant in tenant settings (not hardcoded here).
"""

from typing import Any

from ai.shared.stub_base import StubBase

from .EP_DOMAIN_001 import ProjectCreationResult


class HubSpotAdapter(StubBase):
    """
    CRM adapter for HubSpot Webhooks.
    Converts a "Closed Won" HubSpot Deal into a COS project via
    createProjectFromLead().
    """

    EP_ID = "EP-DOMAIN-002"
    EP_VERSION = "0.1.0"
    TRIGGER = "First tenant that uses HubSpot onboards and requests CRM → project sync"
    PHASE = "Stage 2 — Multi-project SaaS (Phase 3)"

    def create_project_from_lead(
        self,
        crm_lead_id: str,
        tenant_id: str,
        raw_payload: dict[str, Any] | None = None,
    ) -> ProjectCreationResult:
        """
        Map a Closed Won HubSpot Deal to a COS project and trigger creation.
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
        client_secret: str,
    ) -> bool:
        """
        Verify HubSpot webhook signature (v2: SHA-256 of client_secret + payload).
        Safe default: returns False (deny unsigned requests).
        """
        self.log_stub_call("validate_webhook_signature", {})
        return False
