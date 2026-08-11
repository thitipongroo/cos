// AI usage — the Tenant Admin home's "AI Token Usage" + "AI Insights" widgets.
//
// §26 pricing: AI is metered per tenant (input + output tokens) against a monthly quota by plan tier
// (STARTER 500K / PROFESSIONAL 5M / ENTERPRISE uncapped). §31.3 raises the "AI token budget near limit"
// signal at ≥80 % of quota. `GET /ai/usage` returns the real figure the backend meters — never a mock:
// until the LLM gateway records real consumption, `tokensUsed` is genuinely 0, not a placeholder %.
//
// `alertLevel` is the authoritative §31.3 band (computed server-side); the widget localises the insight
// message from it + `percentUsed` so Thai/English render correctly (no server-side English strings).

import { get, post } from './client';

export type AiAlertLevel = 'none' | 'warning' | 'critical';

export interface AiUsage {
  /** Tokens consumed this billing month (input + output), per §26 metering. */
  tokensUsed: number;
  /** Monthly quota resolved from the tenant plan; null = ENTERPRISE custom / uncapped. */
  quota: number | null;
  /** tokensUsed / quota, 0–100 (null when quota is null). */
  percentUsed: number | null;
  /** Billing period this figure covers, `YYYY-MM`. */
  periodMonth: string;
  /** §31.3 budget band: warning ≥80 %, critical ≥100 %; none otherwise (or uncapped). */
  alertLevel: AiAlertLevel;
}

export async function getAiUsage(): Promise<AiUsage> {
  return get<AiUsage>('/ai/usage');
}

/**
 * A procurement-summary report — the manager dashboard's Insights panel
 * (mockup 06_project_manager/01_home).
 *
 * PER PROJECT, because the endpoint is: `ProjectReportRequest` requires `project_id`, so the screen
 * asks which project first (PO decision 2026-08-10) rather than picking one and presenting its
 * findings as if they covered the tenant.
 *
 * `tenant_id` is in the body because the request model requires it, but the gateway takes the tenant
 * it TRUSTS from the verified token (`get_verified_tenant`), never from the body — so this value
 * cannot be used to read another tenant's data. It is read from the access token's own claim for the
 * same reason: it is the only tenant this client can honestly claim to be.
 *
 * `low_confidence` is REQUIRED on the response and is the server's own verdict on its output; the
 * screen leads with it (see lib/aiConfidence.ts).
 */
export interface AiReport {
  report_id: string | null;
  report_type: string;
  /** Structured body — free-form per report type. */
  content: Record<string, unknown>;
  confidence: number | null;
  low_confidence: boolean;
}

export async function generateProcurementSummary(params: {
  projectId: string;
  tenantId: string;
}): Promise<AiReport> {
  return post<AiReport>('/ai/reports/procurement-summary', {
    project_id: params.projectId,
    tenant_id: params.tenantId,
  });
}

/**
 * An executive-summary report — the Finance dashboard's insight panel
 * (mockup 06_project_manager/03_finance).
 *
 * WHY THIS REPORT TYPE AND NOT A BUDGET ONE. The gateway serves exactly four:
 * SITE_SUMMARY, PROCUREMENT_SUMMARY, EXECUTIVE_SUMMARY, DELAY_RISK (`reports/models.py`
 * REPORT_TYPE_MAP). There is NO budget report. The mockup draws a "Budget Insight" panel, so one of
 * the four has to stand behind it or the panel has to be left out; this is the one whose prompt
 * (`ai/prompts/report-executive-v1.j2`) asks for "aggregated project health … suitable for C-level
 * or project owner", which is what a manager reads a finance dashboard for. Its content is
 * `executive_summary` + `risk_flags` + `recommendations`.
 *
 * The panel is therefore labelled for what this actually returns — a project health summary — and
 * not as a budget analysis the model was never asked to produce. That prompt also carries the line
 * "Do NOT fabricate budget figures, percentages, or dates not present in the context", which is the
 * reason the figures on this screen come from the finance API and never from the report text.
 *
 * Project-scoped for the same reason as the procurement summary: `ExecutiveSummaryRequest` requires
 * `project_id`, so the screen asks which project rather than presenting one project's findings as a
 * portfolio-wide statement.
 */
export async function generateExecutiveSummary(params: {
  projectId: string;
  tenantId: string;
}): Promise<AiReport> {
  return post<AiReport>('/ai/reports/executive-summary', {
    project_id: params.projectId,
    tenant_id: params.tenantId,
  });
}

/**
 * A site-summary report — the Site Engineer issue dashboard's Insight card
 * (mockup 03_site_engineer/02_issues/02_se_issue_dashboard).
 *
 * NO NEW ENDPOINT WAS BUILT FOR THIS PANEL, AND NONE SHOULD BE. The drawing's card talks about open
 * issues and site conditions, and SITE_SUMMARY is the Phase 12 report whose declared input is exactly
 * that — "site_reports (last 7 days), issues (open), manpower_logs" (master §Phase 12 capability 1)
 * — returning `summary` + `key_issues` + `manpower_trend`. The gateway serves exactly four report
 * types and `ai_generated_reports.report_type` is a locked ENUM over the same four, so a fifth
 * "issue insight" type would be a new enum value, a new migration and an AI capability the spec does
 * not define. Rule 20 and §Never "invent business logic not specified" both land on that.
 *
 * `summary` is the first string field on SiteSummaryOutput, so `<InsightPanel />`'s `summaryText`
 * picks up prose rather than an enum word — unlike DELAY_RISK, whose first string is
 * `delay_risk_level` (see the note in app/(app)/more.tsx for where that was ruled on before).
 *
 * WHAT THE DRAWING CLAIMS THAT THIS DOES NOT. The mockup's card cites "Data Source: BIM & Sensor
 * Telemetry" at 94% confidence. There is no sensor feed behind it — IoT ingestion is Phase 24 — and
 * the confidence rendered here is always the model's own, via the band in lib/aiConfidence.ts.
 *
 * `date_range` is the endpoint's own default ("last 7 days", SiteSummaryVars) and is left to the
 * server rather than restated here, so the window cannot drift between client and prompt.
 */
export async function generateSiteSummary(params: {
  projectId: string;
  tenantId: string;
}): Promise<AiReport> {
  return post<AiReport>('/ai/reports/site-summary', {
    project_id: params.projectId,
    tenant_id: params.tenantId,
  });
}

/**
 * A delay-risk report — the Site Engineer task list's Insight card
 * (mockup 03_site_engineer/03_tasks/01_se_tasks).
 *
 * THE ONLY SCHEDULE REPORT THE GATEWAY SERVES, and the drawing's card is about schedule: it argues
 * for pulling a pour forward to save days off a phase. DELAY_RISK's declared inputs are the project
 * end date, the PM's estimated completion date, procurement delivery dates and open critical issues
 * (master §Phase 12 capability 4), and the gateway assembles real context for it — workforce,
 * procurement and manpower signals plus site weather (services/ai-gateway/risk/context.py, ADR-072).
 *
 * ITS SHAPE IS NOT THE OTHER THREE REPORTS' SHAPE, which is why the panel had to grow to read it.
 * `DelayRiskOutput` carries NO prose: `delay_risk_level` + `risk_factors` + `confidence` +
 * `data_points_used` + a constant `disclaimer`. The panel therefore takes the level as a chip and
 * the risk factors as the body (see ScheduleInsight.tsx). Product-owner decision 2026-08-12, taken
 * over the alternative of pointing this card at EXECUTIVE_SUMMARY for the sake of a paragraph — that
 * would have answered a schedule question with a project-health report.
 *
 * The `disclaimer` field is deliberately NOT rendered as the body: it is a constant the model never
 * chose, so printing it as the report's text would present boilerplate as a finding.
 */
export async function generateDelayRisk(params: {
  projectId: string;
  tenantId: string;
}): Promise<AiReport> {
  return post<AiReport>('/ai/reports/delay-risk', {
    project_id: params.projectId,
    tenant_id: params.tenantId,
  });
}
