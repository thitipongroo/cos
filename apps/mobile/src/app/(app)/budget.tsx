// Budget screen — FINANCE: what a project was given, what it has spent, and where.
// Implements mockup/mobile/09_finance/03_budget/01_fn_budget.
//
// REBUILT 2026-09-08 for that drawing. What was here was a `<ProjectPicker />` over five key/value
// rows printing raw `1000000.0000` strings, in the STATIC LIGHT palette. The drawing gives the
// screen the project bar every other working screen opens with, three KPI cards, a forecast module
// and a per-category breakdown.
//
// WHAT IS REAL.
//   The three KPI cards  `GET /finance/budget/:projectId` — `total_budget_amount`, `actual_amount`,
//                        and the remainder between them. The drawing's own arithmetic checks out
//                        against the total rather than the allocation: 84.2 / 124.5 = 68% and
//                        40.3 / 124.5 = 32%, which are the two percentages it prints.
//   The category rows    the budget's own `lines` carry what was ALLOCATED. `budget_lines` has no
//                        actual column at all, so a category's SPEND is
//                        `GET /finance/cost-transactions` summed by `budget_line_id` — the PO's
//                        decision of 2026-09-08, and the reason `resolveBudgetLine` fills that
//                        column on PO commit.
//   The forecast module  `GET /finance/cashflow-forecast/:projectId`, read by the same
//                        `projectedShortfall` / `gradeCashflowRisk` the nightly alert sweep grades
//                        with — as on Home and on Payments, so the three cannot disagree.
//
// THE SPEND SUM IS WALKED TO THE END OF THE LIST, and says so when it cannot be. That endpoint is
// an AIP-132 page of at most 100 rows; a project's costs run to thousands, and summing page one
// would print a category's "spent to date" that is neither the spend nor to date. `api/finance.ts`
// walks it and returns `complete`; a partial answer is captioned as one rather than shown as a
// figure. Costs recorded in another currency are EXCLUDED from every category — adding baht to
// dollars is not a sum — and counted in the same caption.
//
// NO CONFIDENCE ON THE FORECAST MODULE. The drawing puts "Conf: 94%" and "Source: ERP & Schedule"
// on it. The forecast is a deterministic sum of scheduled inflows and outflows, so a confidence
// would claim a model that never ran; the footer names the project instead, which is the carve-out
// ADR-098's second amendment and ADR-099 already record for every AI-shaped card in this app.
//
// WHAT IS DRAWN (lib/mockupFigures.ts, ADR-099): "Code: 02-100" under a category name.
// `budget_lines.boq_category_id` is a UUID and no coding standard exists to derive a short code
// from — see `BUDGET_CATEGORY_CODE`.
//
// ONE GLYPH FOR EVERY CATEGORY, where the drawing gives each its own (`foundation`,
// `electrical_services`, `format_paint`). Picking a glyph per category needs a category TAXONOMY,
// and this schema has a name and a UUID; a name-to-icon guess would be a classification standard
// invented on a budget screen. What does vary is the TONE, exactly as the drawing varies it: a
// category over its allocation is drawn in warning, which is the distinction the drawing's three
// cards are actually making.
//
// DRAWN ACTIONS, each saying so on tap: the amendment FAB (`POST /finance/budget/:projectId` is a
// FINANCE/TENANT_ADMIN create-or-update, not a request-and-approve amendment flow), "Expand all"
// (nothing on the card is collapsed), "View details" (no per-line screen exists), the forecast
// module's deep-report button, and the three KPI footer links. COMING SOON, in this comment and in
// a dialog — never as a label on screen.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  Decimal,
  firstShortfallWeek,
  gradeCashflowRisk,
  projectedShortfall,
  type CashflowPeriod,
} from '@cos/financial';
import {
  getCashflowForecast,
  getProjectBudget,
  listCostTransactions,
  type BudgetLineRow,
  type CostTransactionPage,
  type ProjectBudgetResponse,
} from '../../api/finance';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { AiCardFooter } from '../../components/AiCardFooter';
import { ProjectContextBar } from '../../components/ProjectContextBar';
import { useProjectStore } from '../../store/projectStore';
import { compactMoneyLabel, spacedMoney } from '../../lib/compactMoney';
import {
  BUDGET_CATEGORY_CODE,
  BUDGET_CATEGORY_GLYPHS,
  FORECAST_CONFIDENCE,
} from '../../lib/mockupFigures';
import { useT } from '../../i18n';
import { useComingSoon } from '../../lib/useComingSoon';
import type { TranslateFn } from '../../i18n';
import {
  fontFamily,
  plateRadius,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../theme/tokens';
import { usePalette, useIsDark, type Palette } from '../../theme/usePalette';

/** The drawing's square category plate. Named so the plate and its radius cannot drift apart. */
const PLATE = 40;

export default function BudgetScreen(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(p), [p]);
  const active = useProjectStore((s) => s.active);
  const projectId = active?.projectId ?? '';

  const [budget, setBudget] = useState<ProjectBudgetResponse | null>(null);
  const [costs, setCosts] = useState<CostTransactionPage | null>(null);
  const [periods, setPeriods] = useState<CashflowPeriod[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  /**
   * Everything this screen reads, for the project that is active.
   *
   * The budget decides whether the screen has anything to show, so its failure clears the figures —
   * `GET /finance/budget/:id` answers 404 for a project nobody has budgeted, and leaving the last
   * project's numbers up under a new project's name is the one wrong thing this screen could do.
   * The costs and the forecast are ADDITIONS to it and fail quietly: a category without its spend
   * still has an allocation worth reading.
   */
  const load = useCallback(async (): Promise<void> => {
    if (projectId === '') {
      setBudget(null);
      setCosts(null);
      setPeriods(null);
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      setBudget(await getProjectBudget(projectId));
    } catch {
      setBudget(null);
      setFailed(true);
    } finally {
      setLoading(false);
    }
    try {
      setCosts(await listCostTransactions(projectId));
    } catch {
      setCosts(null);
    }
    try {
      setPeriods(await getCashflowForecast(projectId));
    } catch {
      setPeriods(null);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const soon = useComingSoon();

  const currency = budget?.budget.total_budget_currency ?? 'THB';
  const spend = useMemo(() => summariseSpend(costs, currency), [costs, currency]);

  const total = budget === null ? null : new Decimal(budget.budget.total_budget_amount);
  const actual = budget === null ? null : new Decimal(budget.budget.actual_amount);
  const remaining = total === null || actual === null ? null : total.minus(actual);

  const money = useCallback(
    (value: Decimal | null): string =>
      value === null ? '—' : compactMoneyLabel(value, currency, t, { maxScale: 'million' }),
    [currency, t],
  );

  return (
    <View testID="budget-screen" style={styles.page}>
      <ProjectContextBar />

      <LoadingBoundary
        loading={loading && budget === null}
        variant="widget"
        theme={isDark ? 'dark' : 'light'}
        style={styles.fill}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        >
          {budget === null ? (
            <Text testID="budget-empty" style={styles.empty}>
              {projectId === ''
                ? t('finance.budget.selectPrompt')
                : failed
                  ? t('finance.budget.loadError')
                  : t('finance.budget.noBudget')}
            </Text>
          ) : (
            <>
              {/* The drawing's three KPI cards. Each carries a footer link that this platform has
                  no screen for; they open a dialog rather than a route. */}
              <View testID="budget-figures" style={styles.kpis}>
                <KpiCard
                  testID="budget-kpi-total"
                  glyph="account-balance-wallet"
                  tone={p.muted}
                  label={t('finance.budget.totalBudget')}
                  value={money(total)}
                  caption={t('finance.budget.totalBudgetSub')}
                  link={t('finance.budget.openBudget')}
                  onLink={() => soon('finance.budget.openBudget')}
                  styles={styles}
                />
                <KpiCard
                  testID="budget-kpi-actual"
                  glyph="payments"
                  tone={p.warning}
                  label={t('finance.budget.actualSpent')}
                  value={money(actual)}
                  caption={t('finance.budget.actualSpentSub')}
                  link={t('finance.budget.checkPayments')}
                  onLink={() => soon('finance.budget.checkPayments')}
                  badge={percentText(actual, total)}
                  ratio={ratio(actual, total)}
                  styles={styles}
                />
                <KpiCard
                  testID="budget-kpi-remaining"
                  glyph="savings"
                  tone={p.success}
                  label={t('finance.budget.remaining')}
                  value={money(remaining)}
                  caption={t('finance.budget.remainingSub', {
                    // A budget of zero leaves 0% of itself, which is a fact rather than a gap.
                    percent: percentText(remaining, total) ?? '0%',
                  })}
                  link={t('finance.budget.analyseCashflow')}
                  onLink={() => soon('finance.budget.analyseCashflow')}
                  styles={styles}
                />
              </View>

              <ForecastModule
                periods={periods}
                projectName={active?.projectName ?? null}
                styles={styles}
                palette={p}
                t={t}
                onDeepReport={() => soon('finance.budget.deepReport')}
              />

              <View style={styles.breakdownHead}>
                <Text style={styles.heading} accessibilityRole="header">
                  {t('finance.budget.breakdown')}
                </Text>
                {/* Drawn — nothing on a category card is collapsed, so there is nothing to expand. */}
                <Pressable
                  testID="budget-expand-all"
                  accessibilityRole="button"
                  accessibilityLabel={t('finance.budget.expandAll')}
                  onPress={() => soon('finance.budget.expandAll')}
                  style={styles.headLink}
                >
                  <Text style={styles.headLinkText}>{t('finance.budget.expandAll')}</Text>
                  <MaterialIcons name="unfold-more" size={15} color={p.accent} />
                </Pressable>
              </View>

              {/* What the category figures below are and are not computed from. Rendered ONLY when
                  something was left out — a caption that is always there stops being read. */}
              {spend.caveats.length === 0 ? null : (
                <View testID="budget-coverage" style={styles.coverage}>
                  <MaterialIcons name="info-outline" size={14} color={p.muted} />
                  <Text style={styles.coverageText}>
                    {spend.caveats.map((c) => t(`finance.budget.${c.key}`, c.params)).join(' ')}
                  </Text>
                </View>
              )}

              {budget.lines.length === 0 ? (
                <Text testID="budget-no-lines" style={styles.empty}>
                  {t('finance.budget.noLines')}
                </Text>
              ) : (
                <View testID="budget-lines" style={styles.lines}>
                  {budget.lines.map((line, index) => (
                    <CategoryCard
                      key={line.line_id}
                      line={line}
                      // ZERO, NOT AN EM DASH, once the costs have actually been read. The walk
                      // covers every recorded cost on the project, so a line with no entry in the
                      // map is a line nothing has been charged to — a measured zero. The dash is
                      // kept for the one case that really is unknown: the request failed.
                      spent={costs === null ? null : (spend.byLine.get(line.line_id) ?? ZERO)}
                      code={BUDGET_CATEGORY_CODE.value[index % BUDGET_CATEGORY_CODE.value.length]}
                      icon={
                        BUDGET_CATEGORY_GLYPHS.value[index % BUDGET_CATEGORY_GLYPHS.value.length]!
                      }
                      styles={styles}
                      palette={p}
                      t={t}
                      onDetails={() => soon('finance.budget.viewDetails')}
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </LoadingBoundary>

      {/* Drawn, and it says so on tap. `POST /finance/budget/:projectId` overwrites a budget; the
          drawing asks for an amendment REQUEST, which has no endpoint and no approval flow. */}
      <Pressable
        testID="budget-amend"
        accessibilityRole="button"
        accessibilityLabel={t('finance.budget.amend')}
        onPress={() => soon('finance.budget.amend')}
        style={styles.fab}
      >
        <MaterialIcons name="add" size={26} color={p.onPrimary} />
      </Pressable>
    </View>
  );
}

/** One of the drawing's three summary cards. `ratio` draws the progress bar; omit it for none. */
function KpiCard({
  testID,
  glyph,
  tone,
  label,
  value,
  caption,
  link,
  onLink,
  badge,
  ratio: fill,
  styles,
}: {
  testID: string;
  glyph: React.ComponentProps<typeof MaterialIcons>['name'];
  tone: string;
  label: string;
  value: string;
  caption: string;
  link: string;
  onLink: () => void;
  badge?: string | null;
  ratio?: number | null;
  styles: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  return (
    <View testID={testID} style={[styles.card, { borderLeftColor: tone }]}>
      <View style={styles.kpiHead}>
        <View style={styles.kpiLabel}>
          <MaterialIcons name={glyph} size={16} color={tone} />
          <Text style={styles.eyebrow}>{label}</Text>
        </View>
        <View style={styles.kpiTrail}>
          {badge == null ? null : (
            <View style={[styles.badge, { borderColor: `${tone}66` }]}>
              <MaterialIcons name="arrow-upward" size={12} color={tone} />
              <Text style={[styles.badgeText, { color: tone }]}>{badge}</Text>
            </View>
          )}
          {/* The drawing puts one on every KPI card — the mark that the tile opens something. */}
          <MaterialIcons name="chevron-right" size={16} color={tone} />
        </View>
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      {fill == null ? null : <ProgressBar ratio={fill} tone={tone} styles={styles} />}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={link}
        onPress={onLink}
        style={styles.kpiFoot}
      >
        <Text style={styles.caption} numberOfLines={2}>
          {caption}
        </Text>
        <View style={styles.kpiLink}>
          <Text style={[styles.kpiLinkText, { color: tone }]} numberOfLines={1}>
            {link}
          </Text>
          <MaterialIcons name="arrow-forward" size={13} color={tone} />
        </View>
      </Pressable>
    </View>
  );
}

/**
 * The drawing's "Cash Flow Projection" module.
 *
 * IT IS THE 13-WEEK FORECAST, and it says the same thing here that it says on Home and on the
 * payment queue, because all three read it through the same functions. The drawing's own prose —
 * "5.2% variance in MEP services due to supply chain fluctuations" — is a per-category projection
 * that no endpoint produces; what this platform can say about the next 45 days is which week the
 * position turns negative and by how much.
 */
function ForecastModule({
  periods,
  projectName,
  styles,
  palette,
  t,
  onDeepReport,
}: {
  periods: CashflowPeriod[] | null;
  projectName: string | null;
  styles: ReturnType<typeof makeStyles>;
  palette: Palette;
  t: TranslateFn;
  onDeepReport: () => void;
}): React.JSX.Element {
  const week = periods === null ? null : firstShortfallWeek(periods);
  const risk = periods === null ? null : gradeCashflowRisk(periods);
  const shortfall = periods === null ? null : projectedShortfall(periods);
  return (
    <View testID="budget-forecast" style={[styles.card, styles.forecast]}>
      <View style={styles.forecastHead}>
        <MaterialIcons name="bolt" size={16} color={palette.accent} />
        <Text style={styles.forecastTitle}>{t('finance.budget.forecast')}</Text>
      </View>
      <Text style={styles.body}>
        {periods === null || periods.length === 0
          ? t('home.finance.forecastNone')
          : week === null
            ? t('home.finance.forecastClear')
            : t('home.finance.forecastShortfall', {
                amount: shortfall === null ? '—' : spacedMoney(shortfall),
                week: week + 1,
              })}
      </Text>
      {risk === null ? null : (
        <Text testID="budget-forecast-risk" style={[styles.riskWord, { color: palette.warning }]}>
          {t(`home.finance.risk.${risk}`)}
        </Text>
      )}
      {/* The drawing's footer: a rule, then two labelled readings side by side — `analytics` +
          the confidence, `database` + the source.
          THE CONFIDENCE IS DRAWN and is the entry ADR-099 is least comfortable with: this card
          reads a DETERMINISTIC forecast, so a percentage claims a model that never ran. Drawn on
          the product owner's instruction of 2026-09-08 and registered.
          THE SOURCE TEXT NAMES THE PROJECT, not the drawing's "ERP & Schedule" — naming systems
          this platform does not integrate with is a claim about provenance, and it is the carve-out
          ADR-098's second amendment and ADR-099 both keep. */}
      {/* THE PROJECT'S STANDARD AI-CARD FOOT (spec §32.7, PO decision 2026-09-08). This card had
          the shape first — CONF and SOURCE on one line — and now shares the component every AI card
          uses, so the next change to the pattern reaches all of them at once. */}
      <AiCardFooter
        testID="budget-forecast-foot"
        percent={FORECAST_CONFIDENCE.value.budget}
        source={projectName ?? '—'}
        confLabel={t('insight.confShort')}
        sourceLabel={t('insight.sourceShort')}
        palette={palette}
      />
      {/* Drawn — there is no deep forecast report and no contract review screen. */}
      <Pressable
        testID="budget-deep-report"
        accessibilityRole="button"
        accessibilityLabel={t('finance.budget.deepReport')}
        onPress={onDeepReport}
        style={styles.forecastButton}
      >
        <Text style={styles.forecastButtonText} numberOfLines={1}>
          {t('finance.budget.deepReport')}
        </Text>
        <MaterialIcons name="arrow-forward" size={16} color={palette.accent} />
      </Pressable>
    </View>
  );
}

/** One category of the breakdown: its allocation, what has been spent against it, and by how much. */
function CategoryCard({
  line,
  spent,
  code,
  icon,
  styles,
  palette,
  t,
  onDetails,
}: {
  line: BudgetLineRow;
  spent: Decimal | null;
  code: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  styles: ReturnType<typeof makeStyles>;
  palette: Palette;
  t: TranslateFn;
  onDetails: () => void;
}): React.JSX.Element {
  const allocated = new Decimal(line.allocated_amount);
  const share = spent === null ? null : ratio(spent, allocated);
  // Over its allocation is the distinction the drawing's three cards make, and the only one this
  // schema supports making. `over` is null when there is no spend to compare, not false.
  const over = share === null ? null : share > 1;
  const tone = over === true ? palette.warning : palette.muted;
  return (
    <View testID={`budget-line-${line.line_id}`} style={[styles.card, { borderLeftColor: tone }]}>
      <View style={styles.lineHead}>
        {/* DRAWN — one glyph per card, cycled by position, exactly as the code above it is.
            The drawing gives each category its own (`foundation`, `electrical_services`,
            `format_paint`) and this schema has a NAME and a UUID: reading a glyph off a name would
            be inventing a classification standard on a budget screen. See the register. */}
        <View style={[styles.plate, { borderColor: `${tone}55` }]}>
          <MaterialIcons name={icon} size={20} color={tone} />
        </View>
        <View style={styles.lineText}>
          <Text style={styles.lineName} numberOfLines={1}>
            {line.line_name}
          </Text>
          {over === true ? (
            <Text style={[styles.lineCode, { color: palette.warning }]} numberOfLines={1}>
              {t('finance.budget.overBy', {
                percent: percentText(spent!.minus(allocated), allocated) ?? '—',
              })}
            </Text>
          ) : (
            // DRAWN — `boq_category_id` is a UUID. See the register.
            <Text style={styles.lineCode} numberOfLines={1}>
              {t('finance.budget.code', { code })}
            </Text>
          )}
        </View>
        <View style={styles.lineFigures}>
          <Text style={[styles.lineSpent, over === true ? { color: palette.warning } : null]}>
            {spent === null ? '—' : spacedMoney(spent, line.currency_code)}
          </Text>
          <Text style={styles.lineOf} numberOfLines={1}>
            {t('finance.budget.ofAllocated', {
              allocated: spacedMoney(allocated, line.currency_code),
              percent: (spent === null ? null : (percentText(spent, allocated) ?? '0%')) ?? '—',
            })}
          </Text>
        </View>
      </View>
      {/* Clamped at the bar, not at the figure: a category at 105% draws a full bar and still reads
          105% beside it. A bar wider than its track is a rendering bug, a percentage over 100 is
          the news. */}
      <ProgressBar ratio={share ?? 0} tone={tone} styles={styles} />
      <Pressable
        testID={`budget-line-details-${line.line_id}`}
        accessibilityRole="button"
        accessibilityLabel={t('finance.budget.viewDetails')}
        onPress={onDetails}
        style={styles.detailsButton}
      >
        <Text style={[styles.detailsText, { color: tone }]}>{t('finance.budget.viewDetails')}</Text>
        <MaterialIcons name="arrow-forward" size={15} color={tone} />
      </Pressable>
    </View>
  );
}

/** The drawing's 6px track. `ratio` may exceed 1; the FILL is clamped, the caller's figure is not. */
function ProgressBar({
  ratio: value,
  tone,
  styles,
}: {
  ratio: number;
  tone: string;
  styles: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  const width = `${Math.min(100, Math.max(0, value * 100))}%` as const;
  return (
    <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no">
      <View style={[styles.fillBar, { width, backgroundColor: tone }]} />
    </View>
  );
}

/** Nothing charged to a line, as a Decimal — distinct from "we could not read the costs". */
const ZERO = new Decimal(0);

/** One reason a category figure is not the whole story, ready for `t()`. */
interface SpendCaveat {
  key: 'partial' | 'otherCurrency' | 'unattributed';
  params: Record<string, string | number>;
}

interface SpendSummary {
  byLine: Map<string, Decimal>;
  caveats: SpendCaveat[];
}

/**
 * Recorded costs, grouped into the category each was attributed to.
 *
 * THREE THINGS ARE DELIBERATELY LEFT OUT OF THE SUMS, and each one that applies is captioned rather
 * than absorbed:
 *   · costs in a currency other than the budget's — baht added to dollars is not an amount
 *   · costs with no `budget_line_id` — `resolveBudgetLine` returns null when a PO's items map to no
 *     line, and those belong to the project total and to no category
 *   · everything past the paging cap — the walk returns the most recent rows first, so a partial
 *     answer understates every category and must not be read as a spend to date
 */
function summariseSpend(page: CostTransactionPage | null, currency: string): SpendSummary {
  const byLine = new Map<string, Decimal>();
  const caveats: SpendCaveat[] = [];
  if (page === null) return { byLine, caveats };

  let otherCurrency = 0;

  for (const row of page.rows) {
    if (row.currency_code !== currency) {
      otherCurrency += 1;
      continue;
    }
    const amount = new Decimal(row.amount);
    // A cost with no `budget_line_id` belongs to the project and to no category — which is what
    // every category showing zero already says. It is no longer captioned; see below.
    if (row.budget_line_id === null) continue;
    byLine.set(row.budget_line_id, (byLine.get(row.budget_line_id) ?? new Decimal(0)).plus(amount));
  }

  if (!page.complete) {
    caveats.push({ key: 'partial', params: { shown: page.rows.length, total: page.total } });
  }
  if (otherCurrency > 0) {
    caveats.push({ key: 'otherCurrency', params: { count: otherCurrency } });
  }
  // UNATTRIBUTED SPEND IS NO LONGER CAPTIONED (PO decision 2026-09-08). It said nothing about
  // whether the category figures are right — a cost with no `budget_line_id` belongs to the project
  // and to no category, which is exactly what the categories already show — and it was on screen on
  // every run because `resolveBudgetLine` only fills that column on PO commit.
  //
  // THE OTHER TWO STAY, and the difference is the point: a capped walk and a foreign currency both
  // mean the figures above are UNDERSTATED. Those are not notes about the data, they are warnings
  // that the numbers are wrong, and dropping them would make the screen quietly lie.
  return { byLine, caveats };
}

/** `part / whole` as a plain number, or null when the denominator cannot carry a share. */
function ratio(part: Decimal | null, whole: Decimal | null): number | null {
  if (part === null || whole === null || whole.isZero()) return null;
  return part.dividedBy(whole).toNumber();
}

/** The same share, rounded to whole percent for a reader — "68%". Null propagates. */
function percentText(part: Decimal | null, whole: Decimal | null): string | null {
  const value = ratio(part, whole);
  return value === null ? null : `${Math.round(value * 100)}%`;
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: p.bg, padding: spacing.md, gap: spacing.sm },
    fill: { flex: 1 },
    scroll: { gap: spacing.sm, paddingBottom: spacing.xl * 3 },

    card: {
      backgroundColor: p.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      borderLeftColor: p.border,
      padding: spacing.md,
      gap: spacing.xs,
    },
    kpis: { gap: spacing.sm },
    kpiHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    kpiLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2, flexShrink: 1 },
    kpiTrail: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    eyebrow: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 1,
      paddingHorizontal: spacing.xs / 2,
      paddingVertical: 1,
      // §32.7: every status pill, badge and chip takes xl. The drawing's 0.25rem is overridden by
      // that platform ruling, not by a preference — badgeRadius.spec.ts holds it.
      borderRadius: radius.xl,
      borderWidth: 1,
    },
    badgeText: { fontFamily: fontFamily.semibold, fontSize: 10 },
    kpiValue: { color: p.text, fontFamily: fontFamily.bold, fontSize: typography.hero.fontSize },
    kpiFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      minHeight: touchTarget.iconButton,
    },
    caption: {
      flexShrink: 1,
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    kpiLink: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1 },
    kpiLinkText: { fontFamily: fontFamily.semibold, fontSize: typography.label.fontSize },

    track: {
      height: 6,
      borderRadius: radius.sm,
      backgroundColor: p.surfaceBright,
      overflow: 'hidden',
    },
    fillBar: { height: 6, borderRadius: radius.sm },

    forecast: { borderLeftColor: p.accent, borderColor: p.accent },
    forecastHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    forecastTitle: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    body: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.fontSize * 1.5,
    },
    riskWord: { fontFamily: fontFamily.medium, fontSize: typography.label.fontSize },
    forecastFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      // ONE LINE. `flexWrap` let the source drop under the confidence on a long project name; the
      // drawing keeps both readings side by side and clips the longer one.
      borderTopWidth: 1,
      borderTopColor: `${p.accent}33`,
      paddingTop: spacing.xs,
      marginTop: spacing.xs / 2,
    },
    // The confidence is short and fixed, so it holds its width; the source is what gives way.
    footItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2, flexShrink: 0 },
    footItemWide: { flexShrink: 1 },
    source: {
      flexShrink: 1,
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: 10,
      // The drawing sets both readings `uppercase`. Done in the style so the message files keep
      // ordinary words — Thai has no case, and an uppercase source string reads as shouting in
      // every language that does.
      textTransform: 'uppercase',
    },
    forecastButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      minHeight: touchTarget.primaryButton,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: `${p.accent}66`,
      marginTop: spacing.xs,
      paddingHorizontal: spacing.sm,
    },
    forecastButtonText: {
      flexShrink: 1,
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },

    breakdownHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.sm,
    },
    heading: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.body.fontSize,
    },
    headLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      minHeight: touchTarget.iconButton,
      paddingLeft: spacing.sm,
    },
    headLinkText: {
      color: p.accent,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },

    coverage: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs / 2 },
    coverageText: {
      flexShrink: 1,
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },

    lines: { gap: spacing.sm },
    lineHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    plate: {
      width: PLATE,
      height: PLATE,
      borderRadius: plateRadius(PLATE),
      borderWidth: 1,
      backgroundColor: p.surfaceBright,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lineText: { flex: 1, gap: 2 },
    lineName: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
    },
    lineCode: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 10 },
    lineFigures: { alignItems: 'flex-end', gap: 2, flexShrink: 1 },
    lineSpent: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
    },
    lineOf: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 10 },
    detailsButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs / 2,
      minHeight: touchTarget.iconButton,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      marginTop: spacing.xs / 2,
    },
    detailsText: {
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },

    empty: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      textAlign: 'center',
      paddingVertical: spacing.xl,
    },

    fab: {
      position: 'absolute',
      right: spacing.md,
      bottom: spacing.xl,
      width: touchTarget.primaryButton,
      height: touchTarget.primaryButton,
      borderRadius: touchTarget.primaryButton / 2,
      backgroundColor: p.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
