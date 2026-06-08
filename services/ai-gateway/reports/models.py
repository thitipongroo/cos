from typing import Literal
from pydantic import BaseModel


# ── Structured output models (LLM JSON mode) ──────────────────────────────────

class SiteSummaryOutput(BaseModel):
    summary: str
    key_issues: list[str]
    manpower_trend: str
    confidence: float
    data_points_used: int
    data_gaps: list[str]


class ProcurementSummaryOutput(BaseModel):
    summary: str
    overdue_count: int
    risk_items: list[str]
    confidence: float
    data_points_used: int
    data_gaps: list[str]


class ExecutiveSummaryOutput(BaseModel):
    executive_summary: str
    risk_flags: list[str]
    recommendations: list[str]
    confidence: float
    data_points_used: int


class DelayRiskOutput(BaseModel):
    delay_risk_level: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    risk_factors: list[str]
    confidence: float
    data_points_used: int
    disclaimer: str = "AI-generated estimate — verify with project schedule"


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
