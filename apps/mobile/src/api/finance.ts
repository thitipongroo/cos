// Finance API client — the payment queue, the project budget, and the cash flow forecast.
//
// WHY A MODULE RATHER THAN `get()` AT EACH SCREEN. Three FINANCE screens read these endpoints and
// two of them read the same one; `api/analytics.ts` was written after three executive screens each
// called `/analytics/executive` their own way and all three got it wrong. The shapes below are the
// API's, written once.
//
// EVERY DECIMAL IS A STRING, exactly as the API returned it — never parsed to a JS number. A
// project budget runs to hundreds of millions of baht and a double's 2^-53 relative error stops
// being invisible there. Sum and compare with `@cos/financial`.

import { get } from './client';
import type { CashflowPeriod } from '@cos/financial';

/**
 * One row of the tenant-wide AP payment queue (`GET /finance/payments`).
 *
 * IT NAMES NOBODY. A payment carries `invoice_id` and no readable reference, and finance may not
 * query `procurement.*` to add one — master §PHASE 7 line 3216, held by two test suites. The
 * screens that draw this row resolve the vendor and the invoice number through
 * `invoiceIndex()` in `api/procurement.ts` and match on `invoice_id`. A join into this endpoint
 * was written on 2026-09-08 and reverted the same day when those suites caught it.
 */
export interface PaymentRow {
  payment_id: string;
  invoice_id: string;
  project_id: string;
  amount: string;
  currency_code: string;
  /** The date the payment is scheduled for — what the drawing's "Due" line reads. */
  payment_date: string;
  payment_reference: string | null;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
}

/** `GET /finance/budget/:projectId`. `lines` carry what was ALLOCATED; the actual is elsewhere. */
export interface ProjectBudgetResponse {
  budget: {
    total_budget_amount: string;
    total_budget_currency: string;
    allocated_amount: string;
    committed_amount: string;
    actual_amount: string;
  };
  lines: BudgetLineRow[];
  variance_percentage: string;
}

/**
 * One allocation line of a project budget.
 *
 * `boq_category_id` IS A UUID, NOT A CODE. The budget drawing prints "Code: 02-100" under a
 * category name; this column is the foreign key to a BOQ category row and there is no CSI-style
 * code anywhere in the schema. See `BUDGET_CATEGORY_CODE` in `lib/mockupFigures.ts`.
 */
export interface BudgetLineRow {
  line_id: string;
  line_name: string;
  allocated_amount: string;
  currency_code: string;
  boq_category_id: string | null;
}

/**
 * One recorded cost (`GET /finance/cost-transactions`).
 *
 * `budget_line_id` IS THE POINT OF READING THIS. `budget_lines` carries no actual, so the per
 * category "spent of allocated" the budget screen draws is this column summed per line. It is
 * nullable — a cost that could not be attributed to a line has none — and such rows belong to the
 * project total and to no category, which is exactly how the screen treats them.
 */
export interface CostTransactionRow {
  transaction_id: string;
  project_id: string;
  budget_line_id: string | null;
  amount: string;
  currency_code: string;
  transaction_date: string;
  description: string | null;
}

/** Either shape the list endpoints answer with — some page, some return a bare array. */
function asList<T>(res: { items?: T[] } | T[]): T[] {
  return Array.isArray(res) ? res : (res.items ?? []);
}

/**
 * The AP payment queue. `status` narrows it server-side.
 *
 * FILTERED BY THE SERVER, NOT BY THE PAGE. The endpoint pages at thirty-odd rows, so counting
 * PENDING over page one is not a count — the defect `finance.repository.ts` records against its own
 * query. Callers that want a count pass the status.
 */
export async function listPayments(status?: PaymentRow['status']): Promise<PaymentRow[]> {
  const query = status === undefined ? undefined : { status };
  return asList(await get<{ items?: PaymentRow[] } | PaymentRow[]>('/finance/payments', query));
}

export async function getProjectBudget(projectId: string): Promise<ProjectBudgetResponse> {
  return get<ProjectBudgetResponse>(`/finance/budget/${projectId}`);
}

/** The largest page `parseLimit` in `finance.controller.ts` will grant. Asking for more returns 100. */
const COST_PAGE = 100;

/**
 * How many pages this client will walk before it stops and says the answer is partial.
 *
 * 20 x 100 = 2,000 recorded costs, which is a large project's full history and about two seconds of
 * requests on a field connection. The cap exists so a pathological project cannot turn opening a
 * screen into a hundred round trips; it is not a limit anyone is expected to hit.
 */
const COST_PAGE_CAP = 20;

export interface CostTransactionPage {
  rows: CostTransactionRow[];
  /** `false` when the walk stopped at the cap — `rows` is then the most recent slice, not the lot. */
  complete: boolean;
  /** What the server says the project has, whether or not it was all fetched. */
  total: number;
}

/**
 * EVERY recorded cost on a project, walked page by page.
 *
 * WHY IT PAGES AT ALL. `GET /finance/cost-transactions` is an AIP-132 list that defaults to 20 rows
 * and caps at 100 (`parseLimit`, finance.controller.ts). The budget screen sums these per
 * `budget_line_id` to get a category's actual — `budget_lines` carries only what was ALLOCATED —
 * and a sum over the first page is a sum over the first page, not over the project. That is the
 * same defect the payment queue's count would have had, and the answer is the same: get the whole
 * set, or say the answer is partial.
 *
 * ROWS COME BACK `transaction_date DESC`, so a partial answer is the MOST RECENT slice and
 * understates every category. `complete` is what the screen must check before presenting a figure
 * as the spend to date.
 *
 * THE ORDER IS NOT A TOTAL ORDER — `ORDER BY transaction_date DESC, recorded_at DESC` leaves two
 * costs recorded in the same instant free to swap between pages. That can double-count or drop one
 * row of such a pair. Left as it is rather than papered over here: the fix belongs in the query,
 * which needs `transaction_id` as the final tiebreak, and inventing a client-side dedupe would hide
 * a server bug behind a screen.
 */
export async function listCostTransactions(projectId: string): Promise<CostTransactionPage> {
  const rows: CostTransactionRow[] = [];
  let total = 0;

  for (let page = 1; page <= COST_PAGE_CAP; page += 1) {
    const res = await get<{ items?: CostTransactionRow[]; total?: number } | CostTransactionRow[]>(
      '/finance/cost-transactions',
      { project_id: projectId, page: String(page), limit: String(COST_PAGE) },
    );
    const batch = asList(res);
    rows.push(...batch);
    if (!Array.isArray(res) && typeof res.total === 'number') total = res.total;
    // A short page is the last page. An exactly-full one may or may not be, so ask again — the
    // reported total is not trusted to decide it, because it is counted by a second query and can
    // disagree with the rows when a cost is recorded between the two.
    if (batch.length < COST_PAGE) return { rows, complete: true, total: total || rows.length };
  }

  return { rows, complete: false, total: total || rows.length };
}

/**
 * The 13-week direct-method forecast for one project.
 *
 * IT IS NOT AN AI OUTPUT, and the screens must not dress it as one. The drawing puts
 * "CONFIDENCE: 92%" on the card that shows it; this is a deterministic sum of scheduled inflows and
 * outflows, so a confidence would be claiming a model that never ran. Read it with
 * `projectedShortfall` / `gradeCashflowRisk` / `firstShortfallWeek` from `@cos/financial`, which are
 * the same functions the nightly alert sweep grades with.
 */
export async function getCashflowForecast(projectId: string): Promise<CashflowPeriod[]> {
  return asList(
    await get<{ items?: CashflowPeriod[] } | CashflowPeriod[]>(
      `/finance/cashflow-forecast/${projectId}`,
    ),
  );
}
