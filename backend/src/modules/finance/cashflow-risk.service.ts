// CashflowRiskService — emits finance.cashflow_risk.detected.v1 (TDD OQ-50).
//
// WHY A SCHEDULED SWEEP RATHER THAN A WRITE HOOK. The forecast is built from ISSUED billings and
// PENDING payments, so the obvious trigger is "recompute when one of those changes". That would miss
// the case the whole signal exists for: nothing changes in the data, a week passes, and a shortfall
// that was five weeks out is now one week out. Cash-flow risk moves on the calendar, not only on
// writes, so it is swept.
//
// WHY IT DOES NOT EMIT FROM THE PULL ENDPOINT. `GET /finance/cashflow-forecast/:projectId` already
// computes all of this, and emitting there would make a read produce an event — the alert would then
// depend on somebody opening a screen, which is the opposite of what an alert is for.
//
// THE GRADING RULE (PO decision 2026-08-23, spec §32.4 #14). Risk is HOW SOON the money runs out,
// not how much:
//
//   cumulative_net never negative across 13 weeks  → no event
//   first negative in weeks 9–13                   → LOW
//   first negative in weeks 5–8                    → MEDIUM
//   first negative in weeks 2–4                    → HIGH
//   first negative in weeks 0–1                    → CRITICAL
//
// `projected_shortfall` is the most negative `cumulative_net` across the horizon — the deepest the
// hole gets, not the depth at the moment it opens. Every figure already exists in the forecast;
// nothing here invents a number.
//
// The same `buildForecast` the endpoint uses is called here, deliberately: an alert that disagrees
// with the screen an operator opens to check it is worse than no alert.

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  firstShortfallWeek,
  gradeCashflowRisk,
  projectedShortfall,
  type CashflowRiskLevel,
} from '@cos/financial';
import { createLogger } from '@cos/logger';
import type { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../../shared/prisma/create-prisma-client';
import {
  disconnectDedicatedClients,
  forEachDedicatedTenant,
  inDedicatedTenantTx,
} from '../../shared/prisma/tenant-databases';
import { EventOutboxService } from '../../shared/events/event-outbox.service';
import { ScheduledJobLockService } from '../../shared/scheduling/scheduled-job-lock.service';
import { buildForecast } from './finance.service';
import type { CashflowDueRow } from './finance.rows';

const logger = createLogger('cashflow-risk');

/** @Cron name and the lease key in platform.scheduled_job_locks — the same string on purpose. */
export const CASHFLOW_RISK_JOB = 'finance-cashflow-risk';

/** Comfortably longer than a sweep over every project; well under the daily schedule. */
export const CASHFLOW_RISK_LEASE_SECONDS = 900;

// BOTH READERS MOVED TO `@cos/financial` ON 2026-09-08, and are re-exported here so every existing
// importer and its tests keep working unchanged. The FINANCE mobile home shows the same judgement to
// the person this sweep raises the alert for — the drawing's "Projected shortfall of X in week N" is
// these two functions — and a rule written twice is a rule that drifts. The header of
// `packages/@cos/financial/src/cashflow.ts` carries the reasoning; `buildForecast` did NOT move,
// because it reads repository-shaped rows and no client builds a forecast.
export type RiskLevel = CashflowRiskLevel;
export { gradeCashflowRisk, projectedShortfall, firstShortfallWeek };

interface ProjectRow {
  project_id: string;
  tenant_id: string;
  total_budget_currency: string;
}

@Injectable()
export class CashflowRiskService implements OnModuleDestroy {
  // The privileged connection, like every other cross-tenant sweep: no request, so no tenant context
  // and no TenantPrismaService. Scoping comes from each row's own tenant_id, carried into its event.
  private readonly prisma = createPrismaClient();

  constructor(
    private readonly outbox: EventOutboxService,
    private readonly locks: ScheduledJobLockService,
  ) {}

  /**
   * Daily at 01:00 UTC (08:00 ICT) — before the working day in Thailand, so a finance officer finds
   * the alert waiting rather than arriving mid-afternoon.
   */
  @Cron('0 1 * * *', { timeZone: 'UTC', name: CASHFLOW_RISK_JOB })
  async runRiskSweep(): Promise<number | null> {
    return this.locks.runExclusively(CASHFLOW_RISK_JOB, CASHFLOW_RISK_LEASE_SECONDS, () =>
      this.sweep(),
    );
  }

  /** Grade every project that has a budget. Returns how many events were emitted. */
  private async sweep(): Promise<number> {
    // Only projects with a budget: without one there is no currency to denominate a shortfall in,
    // and no one has said what this project is supposed to cost.
    //
    // D54 (2026-11-13): on the shared database only tenants that are active AND still there — a tenant
    // moved to a dedicated database left its old rows here, and grading them raised alerts from data it
    // no longer uses; then each dedicated database, where those tenants' live budgets are (no JOIN on
    // platform there: it is empty). Each dedicated project is graded in a transaction of its own: one
    // failed query aborts a Postgres transaction, and the tenant's other projects would all fail after
    // it. The deadline is the job lease — past it another replica may start the same sweep.
    const deadline = Date.now() + CASHFLOW_RISK_LEASE_SECONDS * 1000;
    const shared = await this.gradeAll(
      (project) => this.gradeProject(this.prisma, project),
      await this.prisma.$queryRaw<ProjectRow[]>`
        SELECT b.project_id::text, b.tenant_id::text, b.total_budget_currency
          FROM finance.project_budgets b
          JOIN platform.tenants t
            ON t.tenant_id = b.tenant_id AND t.is_active = true AND t.dedicated_db_url IS NULL
      `,
    );
    const lists = await forEachDedicatedTenant(
      this.prisma,
      CASHFLOW_RISK_JOB,
      (tx) =>
        tx.$queryRaw<ProjectRow[]>`
          SELECT b.project_id::text, b.tenant_id::text, b.total_budget_currency
            FROM finance.project_budgets b
        `,
      deadline,
    );
    const dedicated: Array<{ projects: number; emitted: number }> = [];
    for (const { tenant, result } of lists) {
      dedicated.push(
        await this.gradeAll(
          (project) =>
            inDedicatedTenantTx(
              tenant,
              (tx) => this.gradeProject(tx, project),
              Math.max(deadline - Date.now(), 1),
            ),
          result,
        ),
      );
    }

    const projects = shared.projects + dedicated.reduce((n, d) => n + d.projects, 0);
    const emitted = shared.emitted + dedicated.reduce((n, d) => n + d.emitted, 0);
    logger.info({ projects, emitted }, 'cashflow.risk.sweep');
    return emitted;
  }

  private async gradeAll(
    grade: (project: ProjectRow) => Promise<boolean>,
    projects: ProjectRow[],
  ): Promise<{ projects: number; emitted: number }> {
    let emitted = 0;
    for (const project of projects) {
      try {
        if (await grade(project)) emitted += 1;
      } catch (err) {
        // One project's failure must not end the sweep — the rest still need grading today.
        logger.error(
          { err, project_id: project.project_id, tenant_id: project.tenant_id },
          'cashflow.risk.project_failed',
        );
      }
    }
    return { projects: projects.length, emitted };
  }

  private async gradeProject(db: PrismaClient, project: ProjectRow): Promise<boolean> {
    const [inflows, outflows] = await Promise.all([
      db.$queryRaw<CashflowDueRow[]>`
        SELECT due_date, amount FROM finance.billings
         WHERE tenant_id = ${project.tenant_id}::uuid
           AND project_id = ${project.project_id}::uuid
           AND status = 'ISSUED'
         ORDER BY due_date ASC
      `,
      db.$queryRaw<CashflowDueRow[]>`
        SELECT payment_date AS due_date, amount FROM finance.payments
         WHERE tenant_id = ${project.tenant_id}::uuid
           AND project_id = ${project.project_id}::uuid
           AND status = 'PENDING'
         ORDER BY payment_date ASC
      `,
    ]);

    const periods = buildForecast(inflows, outflows);
    const risk = gradeCashflowRisk(periods);
    if (!risk) return false;

    const shortfall = projectedShortfall(periods);
    await this.outbox.publish({
      event_type: 'finance.cashflow_risk.detected.v1',
      event_version: '1.0',
      tenant_id: project.tenant_id,
      // No human triggered this — the calendar did. 'system' matches PermitExpiryService and the
      // enterprise-provisioning workflow, for the same reason.
      actor_id: 'system',
      occurred_at: new Date().toISOString(),
      correlation_id: `cashflow-risk-${project.project_id}`,
      payload: {
        project_id: project.project_id,
        risk_level: risk,
        projected_shortfall: {
          amount: shortfall.toFixed(4),
          // The project's budget currency, the same denomination finance.variance.alert.v1 uses.
          // The forecast itself sums amounts without converting — a pre-existing simplification
          // that this event inherits rather than papers over.
          currency_code: project.total_budget_currency,
        },
        projected_at: new Date().toISOString(),
        detected_by: 'RULE_ENGINE',
      },
    });

    logger.warn(
      {
        project_id: project.project_id,
        tenant_id: project.tenant_id,
        risk_level: risk,
        projected_shortfall: shortfall.toFixed(4),
      },
      'finance.cashflow_risk.detected',
    );
    return true;
  }

  async onModuleDestroy(): Promise<void> {
    await disconnectDedicatedClients();
    await this.prisma.$disconnect();
  }
}
