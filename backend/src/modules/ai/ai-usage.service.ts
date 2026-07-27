// AI token metering (§26 pricing · §22.10 COST-001 · §31.3 budget signal).
//
// The single source of truth for "how many AI tokens has this tenant used this billing month, and how
// close is that to the plan quota". The LLM gateway calls recordUsage() after every metered call;
// GET /ai/usage (Tenant Admin home widget) calls getUsage(). All figures are REAL — a tenant with no
// LLM calls this month reads 0, never a placeholder (ห้ามเดา).

import { Injectable } from '@nestjs/common';
import type { PlanType } from '@prisma/client';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { clsTenantId } from '../../shared/context/cls-context';

/** §31.3 / COST-001 bands: soft alert at 80 % of quota, hard cap at 100 %. */
export type AiAlertLevel = 'none' | 'warning' | 'critical';

export interface AiUsageSummary {
  /** Tokens consumed this billing month (input + output). */
  tokensUsed: number;
  /** Monthly quota from the plan tier; null = ENTERPRISE (custom / uncapped in-app). */
  quota: number | null;
  /** tokensUsed / quota as 0–100 (rounded); null when quota is null. */
  percentUsed: number | null;
  /** Billing period this figure covers, `YYYY-MM`. */
  periodMonth: string;
  /** §31.3 budget signal: warning ≥80 %, critical ≥100 %; none otherwise (or uncapped). */
  alertLevel: AiAlertLevel;
}

/**
 * Monthly token quota by plan tier (§26 pricing — "Included Quota"): SMB=STARTER 500K, Mid-market=
 * PROFESSIONAL 5M. ENTERPRISE is contract-custom, so it is uncapped in-app (null) — cost is governed by
 * the enterprise agreement, not a hard in-product cap.
 */
const QUOTA_BY_PLAN: Record<PlanType, number | null> = {
  STARTER: 500_000,
  PROFESSIONAL: 5_000_000,
  ENTERPRISE: null,
};

const SOFT_ALERT_PCT = 80; // §31.3 "AI token budget near limit"
const HARD_CAP_PCT = 100; // §22.10 COST-001 hard cap

@Injectable()
export class AiUsageService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenants: TenantService,
  ) {}

  /** First day of the current UTC billing month as `YYYY-MM-01`, plus the `YYYY-MM` label. */
  private currentPeriod(): { monthStart: string; label: string } {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    return { monthStart: `${y}-${m}-01`, label: `${y}-${m}` };
  }

  /** Accumulate a metered LLM call for the current tenant + billing month + model. */
  async recordUsage(model: string, inputTokens: number, outputTokens: number): Promise<void> {
    const tenantId = clsTenantId();
    if (!tenantId) return; // no tenant context → nothing to meter (never invent a tenant)
    const { monthStart } = this.currentPeriod();
    await this.db.run(
      (tx) =>
        tx.$executeRaw`
        INSERT INTO ai.token_usage (tenant_id, period_month, model, input_tokens, output_tokens)
        VALUES (${tenantId}::uuid, ${monthStart}::date, ${model}, ${inputTokens}, ${outputTokens})
        ON CONFLICT (tenant_id, period_month, model) DO UPDATE SET
          input_tokens  = ai.token_usage.input_tokens  + EXCLUDED.input_tokens,
          output_tokens = ai.token_usage.output_tokens + EXCLUDED.output_tokens,
          updated_at    = now()
      `,
    );
  }

  /** Current-month usage vs the plan quota for the authenticated tenant. */
  async getUsage(): Promise<AiUsageSummary> {
    const tenantId = clsTenantId();
    const { monthStart, label } = this.currentPeriod();

    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<Array<{ used: bigint }>>`
        SELECT COALESCE(SUM(input_tokens + output_tokens), 0)::bigint AS used
        FROM ai.token_usage
        WHERE tenant_id = ${tenantId}::uuid AND period_month = ${monthStart}::date
      `,
    );
    const tokensUsed = Number(rows[0]?.used ?? 0);

    const planType = await this.tenants.getPlanType(tenantId);
    const quota = QUOTA_BY_PLAN[planType];

    if (quota === null) {
      return { tokensUsed, quota: null, percentUsed: null, periodMonth: label, alertLevel: 'none' };
    }
    const percentUsed = quota > 0 ? Math.round((tokensUsed / quota) * 100) : 0;
    const alertLevel: AiAlertLevel =
      percentUsed >= HARD_CAP_PCT ? 'critical' : percentUsed >= SOFT_ALERT_PCT ? 'warning' : 'none';
    return { tokensUsed, quota, percentUsed, periodMonth: label, alertLevel };
  }

  /** True when the tenant is at/over the hard cap (§22.10 COST-001) — the gateway rejects further calls. */
  async isOverHardCap(): Promise<boolean> {
    const { quota, percentUsed } = await this.getUsage();
    return quota !== null && (percentUsed ?? 0) >= HARD_CAP_PCT;
  }
}
