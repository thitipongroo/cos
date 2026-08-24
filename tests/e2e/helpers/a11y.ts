// Axe-core accessibility scanning for the E2E suite (WCAG 2.2 AA — spec §20.8).
//
// Lighthouse already gates /login, but it scans one unauthenticated route with a fixed audit set.
// Axe runs inside a real logged-in session, so it reaches the pages Lighthouse cannot: the app
// shell, list views and the forms behind them.

import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * The rule tags this project gates on.
 *
 * Deliberately WCAG A + AA only. Axe also ships `best-practice` and WCAG AAA rules; including
 * them would fail the build on findings the project has not committed to (AAA contrast is 7:1 —
 * the design system targets AA's 4.5:1, see docs/evidence/contrast-report.md).
 */
export const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** One axe violation, flattened to the fields worth printing on failure. */
interface Finding {
  id: string;
  impact: string;
  help: string;
  nodes: string[];
}

/**
 * Scan the current page and fail the test with a readable report if anything violates WCAG A/AA.
 *
 * The assertion compares against `[]` rather than a count so Playwright's diff prints the actual
 * rule ids and offending element snippets — a bare `toBe(0)` would say "expected 0, got 3" and
 * leave the developer to open the trace.
 */
export async function expectNoA11yViolations(page: Page, context?: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();

  const findings: Finding[] = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact ?? 'unknown',
    help: v.help,
    nodes: v.nodes.map((n) => n.html),
  }));

  expect(findings, `axe WCAG A/AA violations${context ? ` on ${context}` : ''}`).toEqual([]);
}

/**
 * Width of the smallest supported device, in CSS px.
 *
 * Spec §20.8 requires the 200% check "on the smallest supported device (375pt)". On iOS a point is
 * one CSS px, so 375pt is a 375px-wide viewport — an iPhone SE/mini. Running the check at the
 * default 1280px viewport would pass almost anything: a layout only overflows once the text has no
 * room left, and 1280px has plenty.
 */
export const SMALLEST_SUPPORTED_WIDTH = 375;

/**
 * WCAG 1.4.4 Resize Text (AA) — content must stay usable at 200% text size (spec §20.8).
 *
 * Doubling the root font size is the standard automated stand-in: Tailwind sizes in `rem`, so it
 * scales type without touching the viewport, which is exactly what a user raising their browser's
 * font size does. Full conformance also requires nothing to be clipped or overlapped, which no
 * script can judge — docs/evidence/screenreader-checklist.md carries that half.
 *
 * The failure mode this catches is the common one: a fixed-width container that pushes the page
 * into horizontal scrolling once the text grows. Horizontal scrolling of the whole page is what
 * 1.4.4 forbids, so `scrollWidth` is measured against `clientWidth`.
 *
 * The viewport is narrowed to 375px first and restored afterwards, so a caller can run this against
 * a page it navigated at the default size without the resize leaking into later assertions.
 */
export async function expectUsableAt200PercentText(page: Page, context?: string): Promise<void> {
  const original = page.viewportSize();
  await page.setViewportSize({
    width: SMALLEST_SUPPORTED_WIDTH,
    height: original?.height ?? 720,
  });

  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const before = root.style.fontSize;
    root.style.fontSize = '200%';
    // Force layout before measuring — reading scrollWidth already flushes, but being explicit
    // keeps this correct if a later refactor batches the reads.
    void root.offsetHeight;
    const result = { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth };
    root.style.fontSize = before;
    return result;
  });

  if (original) {
    await page.setViewportSize(original);
  }

  // 1px of slack absorbs sub-pixel rounding on fractional device pixel ratios; anything real
  // overflows by far more than that.
  expect(
    overflow.scrollWidth,
    `page scrolls horizontally at 200% text size on a ${SMALLEST_SUPPORTED_WIDTH}px viewport` +
      `${context ? ` (${context})` : ''} — scrollWidth ${overflow.scrollWidth} > clientWidth ` +
      `${overflow.clientWidth}. WCAG 1.4.4, spec §20.8.`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}
