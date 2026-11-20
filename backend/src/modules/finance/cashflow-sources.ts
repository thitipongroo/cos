// The direct-method cash flow's expected AR inflow, one query for both readers (plan DG): the forecast
// (FinanceRepository.findUnpaidBillingsDue → GET /finance/cashflow-forecast/:projectId) and the daily risk sweep
// (CashflowRiskService.gradeProject). An ISSUED billing may be part-received since plan DF, so what is still
// expected is its amount less its receipts, at its original due date; one with nothing left is not expected at all.
// The tenant is filtered on both tables explicitly: the risk sweep runs on a client that is not tenant-scoped.

import type { CashflowDueRow } from './finance.rows';

/** Anything that runs a tagged raw query — a Prisma client or an interactive transaction. */
interface RawQuery {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/** Unpaid AR inflow: what remains on each ISSUED billing, by due date (project-scoped). */
export function unpaidBillingsDue(
  db: RawQuery,
  tenantId: string,
  projectId: string,
): Promise<CashflowDueRow[]> {
  return db.$queryRaw<CashflowDueRow[]>`
    SELECT b.due_date,
           (b.amount - COALESCE(SUM(r.amount_received), 0))::decimal(19,4)::text AS amount
    FROM finance.billings b
    LEFT JOIN finance.ar_receipts r
      ON r.billing_id = b.billing_id AND r.tenant_id = b.tenant_id
    WHERE b.tenant_id = ${tenantId}::uuid
      AND b.project_id = ${projectId}::uuid
      AND b.status = 'ISSUED'
    GROUP BY b.billing_id, b.due_date, b.amount
    HAVING b.amount - COALESCE(SUM(r.amount_received), 0) > 0
    ORDER BY b.due_date ASC
  `;
}
