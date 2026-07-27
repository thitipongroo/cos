// AI usage — the Tenant Admin home's "AI Token Usage" + "AI Insights" widgets.
//
// §26 pricing: AI is metered per tenant (input + output tokens) against a monthly quota by plan tier
// (STARTER 500K / PROFESSIONAL 5M / ENTERPRISE uncapped). §31.3 raises the "AI token budget near limit"
// signal at ≥80 % of quota. `GET /ai/usage` returns the real figure the backend meters — never a mock:
// until the LLM gateway records real consumption, `tokensUsed` is genuinely 0, not a placeholder %.
//
// `alertLevel` is the authoritative §31.3 band (computed server-side); the widget localises the insight
// message from it + `percentUsed` so Thai/English render correctly (no server-side English strings).

import { get } from './client';

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
