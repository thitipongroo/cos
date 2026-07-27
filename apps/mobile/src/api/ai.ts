// AI usage — the Tenant Admin home's "AI Token Usage" + "AI Insights" widgets.
//
// §26 pricing: AI is metered per tenant (input + output tokens) against a monthly quota by plan tier
// (STARTER 500K / PROFESSIONAL 5M / ENTERPRISE custom). §31.3 raises the "AI token budget near limit"
// signal at >80% of quota. `GET /ai/usage` returns the real figure the backend meters — never a mock:
// until the LLM gateway records real consumption, `tokensUsed` is genuinely 0, not a placeholder %.

import { get } from './client';

export interface AiUsage {
  /** Tokens consumed this billing month (input + output), per §26 metering. */
  tokensUsed: number;
  /** Monthly quota resolved from the tenant plan; null = ENTERPRISE custom / uncapped. */
  quota: number | null;
  /** tokensUsed / quota, 0–100 (null when quota is null). */
  percentUsed: number | null;
  /** Billing period this figure covers, `YYYY-MM`. */
  periodMonth: string;
  /**
   * The >80% budget signal (§31.3 AIHighTokenUsage), surfaced as the home's "AI Insights" line.
   * null when usage is within budget — the widget shows the all-clear state, never a fabricated anomaly.
   */
  insight: { level: 'warning' | 'critical'; message: string } | null;
}

export async function getAiUsage(): Promise<AiUsage> {
  return get<AiUsage>('/ai/usage');
}
