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
