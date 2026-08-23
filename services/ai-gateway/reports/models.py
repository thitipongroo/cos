from typing import Literal
from pydantic import BaseModel


# ── Structured output models (LLM JSON mode) ──────────────────────────────────
#
# `sources` — TDD OQ-41. Every report model carries it, and the hallucination guard's "source
# attribution" check is now this field rather than `confidence != 0`.
#
# The old check tested `confidence == 0.0 → fail`, which check 4 (`confidence < 0.7 → fail`) already
# subsumed: a model returning 0.9 for a wholly fabricated narrative passed both. No output model had
# anywhere to put a citation, so nothing in the pipeline could tell a grounded claim from an
# invented one — the spec called that check "source attribution" and it attributed nothing.
#
# Each entry is a verbatim snippet of the retrieval context the report drew on. The guard checks the
# snippets ARE in the context, so a model cannot satisfy the check by inventing a plausible-looking
# citation.

class SiteSummaryOutput(BaseModel):
    summary: str
    key_issues: list[str]
    manpower_trend: str
    confidence: float
    data_points_used: int
    data_gaps: list[str]
    sources: list[str] = []


class ProcurementSummaryOutput(BaseModel):
    summary: str
    overdue_count: int
    risk_items: list[str]
    confidence: float
    data_points_used: int
    data_gaps: list[str]
    sources: list[str] = []


class ExecutiveSummaryOutput(BaseModel):
    executive_summary: str
    risk_flags: list[str]
    recommendations: list[str]
    confidence: float
    data_points_used: int
    sources: list[str] = []


class DelayRiskOutput(BaseModel):
    delay_risk_level: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    risk_factors: list[str]
    confidence: float
    data_points_used: int
    disclaimer: str = "AI-generated estimate — verify with project schedule"
    sources: list[str] = []


# ── Fallback response (low confidence or guard failure) ───────────────────────

class LowConfidenceResponse(BaseModel):
    status: str = "LOW_CONFIDENCE"
    summary: None = None
    message: str = "Insufficient data for reliable summary"
    raw_data_available: bool = True


# ── Prompt template variable models ───────────────────────────────────────────

class SiteSummaryVars(BaseModel):
    context: str
    project_id: str
    date_range: str = "last 7 days"


class ProcurementSummaryVars(BaseModel):
    context: str
    project_id: str


class ExecutiveSummaryVars(BaseModel):
    context: str
    project_id: str


class DelayRiskVars(BaseModel):
    context: str
    project_id: str


# ── Report type registry ───────────────────────────────────────────────────────

REPORT_TYPE_MAP: dict[str, tuple[type[BaseModel], str]] = {
    "SITE_SUMMARY":         (SiteSummaryOutput,       "report-daily-summary-v1"),
    "PROCUREMENT_SUMMARY":  (ProcurementSummaryOutput, "report-procurement-status-v1"),
    "EXECUTIVE_SUMMARY":    (ExecutiveSummaryOutput,   "report-executive-v1"),
    "DELAY_RISK":           (DelayRiskOutput,          "report-delay-risk-v1"),
}
