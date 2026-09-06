// Reading a DELAY_RISK report for the schedule Insight panel (mockup 03_site_engineer/03_tasks/
// 01_se_tasks).
//
// It lives beside insightAdvice.ts for the same reason that one does: it is pure logic over the
// report body, the panel that uses it drags expo-router in, and a unit test cannot import that under
// this CommonJS jest setup. Keeping the reading here keeps it testable.
//
// WHY THIS REPORT NEEDS ITS OWN READER. The other three report types the gateway serves lead with a
// prose field, so <InsightPanel />'s default — the first string in the body — finds a paragraph.
// `DelayRiskOutput` has none: `delay_risk_level` + `risk_factors` + `confidence` +
// `data_points_used` + a constant `disclaimer`. The default therefore prints the word "HIGH" as the
// panel's text. That mismatch is on record in app/(app)/more.tsx, where it was escalated in August
// and settled for THAT panel by choosing a different report type; here the type is not
// substitutable, because DELAY_RISK is the only schedule report there is (PO decision 2026-08-12).

/** The report's own level word (LOW · MEDIUM · HIGH · CRITICAL), or null if it carried none. */
export function delayLevel(content: Record<string, unknown>): string | null {
  const level = content['delay_risk_level'];
  return typeof level === 'string' && level.trim() !== '' ? level.trim() : null;
}

/**
 * The risk factors, as the panel's body — ALL of them, one bulleted line each.
 *
 * Not the first only, which is what `insightAdvice` shows on the panels whose prose has already said
 * what is wrong. Here there is no prose, so the factors ARE the finding, and showing one of four
 * would be this function choosing which risks the reader gets to see. The host passes
 * `showAdvice={false}` for the matching reason: `insightAdvice` reads `risk_factors` too and would
 * otherwise repeat the first line under a "Risk" heading.
 *
 * The `disclaimer` field is never used as the body: it is a constant the model did not choose, and
 * printing boilerplate as the report's text presents it as a finding.
 */
export function delayFactors(content: Record<string, unknown>): string | null {
  const factors = content['risk_factors'];
  if (!Array.isArray(factors)) return null;
  const lines = factors
    .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    .map((item) => `• ${item.trim()}`);
  return lines.length === 0 ? null : lines.join('\n');
}

/**
 * The risk factors as a LIST rather than one bulleted block.
 *
 * `delayFactors` above joins them for `<InsightPanel />`, which renders a single paragraph. The
 * executive Tasks screen draws mockup 08_executive/02_tasks/02_ex_tasks, whose risk alerts are one
 * CARD per finding — so it needs the items, not the paragraph. Both readers exist because the two
 * screens genuinely present the same report two ways; neither is the other's fallback.
 *
 * Same filtering as `delayFactors`: non-strings and blank entries are dropped rather than rendered
 * as empty cards, and an absent or non-array `risk_factors` yields `[]`.
 */
export function delayFactorList(content: Record<string, unknown>): string[] {
  const factors = content['risk_factors'];
  if (!Array.isArray(factors)) return [];
  return factors
    .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    .map((item) => item.trim());
}
