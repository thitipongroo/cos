// Which of the FINANCE Budget drawing's three category looks a share of the allocation takes.
//
// The drawing (09_finance/03_budget/01_fn_budget) draws a category card three ways: over its
// allocation in warning, a well-used one in primary (93 %), a lightly used one muted (21 %). It
// states no rule between the last two; the 50 % line is the product owner's (revision R21, D34,
// 2026-09-17).

export type CategoryLook = 'warning' | 'primary' | 'muted';

/** `share` is spent ÷ allocated; `null` when there is no spend to compare. */
export function categoryLook(share: number | null): CategoryLook {
  if (share === null) return 'muted';
  if (share > 1) return 'warning';
  return share >= 0.5 ? 'primary' : 'muted';
}
