"""Plain Python sequential report generation pipeline — Phase 12.

6 steps (Option B — no Agent Orchestrator):
  1. RAG retrieval context passed in by caller
  2. Context assembly + token budget trim
  3. LLM generation with structured output (JSON mode)
  4. Hallucination guard validation
  5. Persist report to database
  6. Return to caller

Source: context/00_master_construction_os.md §Phase 12 Orchestration
"""
import json
import logging

from pydantic import BaseModel

from providers.llm_provider import LLMProvider, Message
from reports.guard import HallucinationGuard
from reports.models import LowConfidenceResponse, REPORT_TYPE_MAP
from reports.persistence import persist_report
from reports.token_budget import TokenBudget
from templates.loader import render_template

logger = logging.getLogger(__name__)

_BUDGET = TokenBudget()
_GUARD = HallucinationGuard()


class ReportResult(BaseModel):
    report_id: str | None
    report_type: str
    content: dict
    confidence: float | None
    low_confidence: bool = False


async def generate_report(
    report_type: str,
    context_data: str,
    template_extra_vars: dict,
    provider: LLMProvider,
    db_pool,
    tenant_id: str,
    project_id: str,
    generated_by: str,
) -> ReportResult:
    """Run the full 6-step report generation pipeline."""

    if report_type not in REPORT_TYPE_MAP:
        raise ValueError(f"Unknown report_type: {report_type}")

    _, template_name = REPORT_TYPE_MAP[report_type]

    # Step 2: token budget
    context = _BUDGET.trim_context(context_data)

    # Step 3: render prompt + LLM call
    class _Vars(BaseModel):
        model_config = {"extra": "allow"}

    vars_model = _Vars(**{"context": context, "project_id": project_id, **template_extra_vars})
    prompt = render_template(template_name, vars_model)
    messages = [Message(role="user", content=prompt)]
    llm_response = await provider.complete(messages, "report-generation")

    # Parse JSON structured output
    try:
        output_data = json.loads(llm_response.content)
    except (json.JSONDecodeError, AttributeError):
        logger.warning("LLM returned non-JSON output for %s", report_type)
        return ReportResult(
            report_id=None,
            report_type=report_type,
            content=LowConfidenceResponse().model_dump(),
            confidence=None,
            low_confidence=True,
        )

    # Step 4: hallucination guard
    guard_result = _GUARD.validate(output_data, context)
    if not guard_result.passed:
        if guard_result.reason == "LOW_CONFIDENCE":
            return ReportResult(
                report_id=None,
                report_type=report_type,
                content=LowConfidenceResponse().model_dump(),
                confidence=output_data.get("confidence"),
                low_confidence=True,
            )
        logger.warning("HallucinationGuard failed for %s: %s", report_type, guard_result.reason)
        return ReportResult(
            report_id=None,
            report_type=report_type,
            content=LowConfidenceResponse().model_dump(),
            confidence=None,
            low_confidence=True,
        )

    if guard_result.hallucination_flagged:
        logger.warning("POTENTIAL_HALLUCINATION flagged for %s (not returned to user)", report_type)

    # Step 5: persist
    confidence = float(output_data.get("confidence", 0.0))
    report_id = await persist_report(
        db_pool=db_pool,
        tenant_id=tenant_id,
        project_id=project_id,
        report_type=report_type,
        content=output_data,
        confidence=confidence,
        model_used=llm_response.model_used,
        tokens_used=llm_response.total_tokens,
        generated_by=generated_by,
    )

    # Step 6: return
    return ReportResult(
        report_id=report_id,
        report_type=report_type,
        content=output_data,
        confidence=confidence,
        low_confidence=False,
    )
