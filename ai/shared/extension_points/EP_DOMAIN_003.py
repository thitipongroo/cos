"""
EP-DOMAIN-003 — PipedriveAdapter (CRM Integration)
Phase 3 stub — CRM → COS project creation via Pipedrive Webhooks.

Source: docs/specifications/13-product-architecture.md §13.4
Spec:   CRMIntegration, Strategy pattern, one-direction (CRM → COS only)

Trigger: first tenant that uses Pipedrive onboards and requests CRM → project sync
DECIDED: Pipedrive Webhooks, deal status "won" → COS project creation

Data flow:
  Pipedrive Deal (status="won") → webhook POST → COS webhook receiver
  → PipedriveAdapter.create_project_from_lead() → construction.project.created.v1

Field mapping is configured per-tenant in tenant settings (not hardcoded here).
"""

from typing import Any

from ai.shared.stub_base import StubBase

from .EP_DOMAIN_001 import ProjectCreationResult


class PipedriveAdapter(StubBase):
    """
    CRM adapter for Pipedrive Webhooks.
    Converts a won Pipedrive Deal into a COS project via createProjectFromLead().
    """

    EP_ID = "EP-DOMAIN-003"
    EP_VERSION = "0.1.0"
    TRIGGER = "First tenant that uses Pipedrive onboards and requests CRM → project sync"
    PHASE = "Stage 2 — Multi-project SaaS (Phase 3)"

    def create_project_from_lead(
        self,
        crm_lead_id: str,
        tenant_id: str,
        raw_payload: dict[str, Any] | None = None,
    ) -> ProjectCreationResult:
        """
        Map a won Pipedrive Deal to a COS project and trigger creation.
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
        webhook_secret: str,
    ) -> bool:
        """
        Verify Pipedrive webhook signature (HMAC-SHA256).
        Safe default: returns False (deny unsigned requests).
        """
        self.log_stub_call("validate_webhook_signature", {})
        return False
