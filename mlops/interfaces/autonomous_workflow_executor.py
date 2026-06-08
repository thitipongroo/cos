"""
AutonomousWorkflowExecutor stub — Phase 23
Status: Phase 23+ — DO NOT activate in Phase 23 itself.
Governance review required before any activation.

CONSTRAINT: NEVER trigger financial transactions, human-approval workflows,
or data deletions — stub only. Source: spec §Phase 23 Stubs.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@dataclass
class AutonomousResult:
    workflow_type: str
    status: str
    message: str


@runtime_checkable
class AutonomousWorkflowExecutorPort(Protocol):
    def execute(
        self,
        workflow_type: str,
        payload: dict,
        tenant_id: str,
    ) -> AutonomousResult: ...


class AutonomousWorkflowExecutorStub:
    """
    Stub — NOT to be activated in Phase 23.
    Governance review and explicit product-owner approval required before implementing.
    Allowed actions: notifications, report generation, risk flagging only.
    NEVER: financial transactions, approvals, data deletions.
    """

    def execute(
        self,
        workflow_type: str,
        payload: dict,
        tenant_id: str,
    ) -> AutonomousResult:
        raise NotImplementedError(
            "AutonomousWorkflowExecutor.execute — intentionally not implemented in Phase 23; "
            "requires governance review and explicit product-owner approval"
        )
