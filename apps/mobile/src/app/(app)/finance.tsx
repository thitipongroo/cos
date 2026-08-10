// Finance — the Project Manager's third tab (mockup 06_project_manager/03_finance).
//
// Portfolio Financial Summary · the AI panel · Active Projects Health, in the drawing's order.
//
// WHERE THE MONEY COMES FROM, AND WHY IT IS SUMMED HERE. The role may not call the server's own
// portfolio roll-up (`GET /finance/reports/variance` is FINANCE / EXECUTIVE / TENANT_ADMIN), and the
// one portfolio endpoint a PM may call (`GET /analytics/executive`) reads ClickHouse rather than the
// transactional tables. So this screen reads `GET /projects/mine` — the projects the signed-in
// manager is actually a member of — and then `GET /finance/budget/:projectId` for each, which §14
// grants PROJECT_MANAGER read on. `lib/portfolioFinance.ts` adds them up through decimal.js.
//
// A project with no budget row answers 404. That is not an error here: it means nobody has budgeted
// it yet. It is dropped from the totals and the count says how many projects the totals cover, so a
// portfolio figure never silently stands for fewer projects than the manager has.
//
// THREE THINGS IN THE DRAWING ARE NOT DRAWN, each because the data behind them does not exist:
//
//   - The trend arrows ("▲ 4.2%" beside Commit Costs). `project_budgets` holds current aggregates
//     and no history, and no endpoint returns a previous period, so an arrow here would be a
//     direction this app made up. The slot carries the share of budget instead — same shape of
//     number, actually derived from the data (see `shareOfBudget`).
//   - "FY 2024" under Total Budget. There is no fiscal-year field on a budget or a project. The
//     slot says how many projects the total covers, which is the thing that qualifies the figure.
//   - A chevron on the three bento tiles. The drawing puts one on each; there is no per-figure
//     screen to open — "Total Budget" is already the sum of the cards below it. The project cards
//     DO have one, because they now open that project's analytics (PO decision 2026-08-10).
//
// THE FAB CREATES A PURCHASE REQUEST, and that is the whole of what it can honestly do. The drawing
// puts a "+" here; creating a BUDGET is `POST /finance/budget/:id`, which §6.4 gives FINANCE and
// TENANT_ADMIN only, so a budget action would be a button whose one outcome is 403. Purchase
// requests are the one thing this role may CREATE (§6.4: PM = RW) that starts the spend this
// dashboard measures, and `/material-request` is a screen that already exists.

import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { get } from '../../api/client';
import { getMyProjects } from '../../api/projects';
import { compactMoney, type MoneyScale } from '../../lib/compactMoney';
import { budgetHealth, budgetFraction, type BudgetHealth } from '../../lib/budgetHealth';
import { portfolioTotals, type ProjectFinance } from '../../lib/portfolioFinance';
import { spendTrend, type CostTransaction, type SpendTrend } from '../../lib/spendTrend';
import { ProjectPicker } from '../../components/ProjectPicker';
import { PortfolioInsight } from '../../components/PortfolioInsight';
import { useT } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette, type Palette } from '../../theme/usePalette';

interface BudgetResponse {
  budget: {
    total_budget_amount: string;
    total_budget_currency: string;
    allocated_amount: string;
    committed_amount: string;
    actual_amount: string;
  };
}

/** i18n key for the magnitude `compactMoney` scaled to — "M"/"B" in English, ล้าน/พันล้าน in Thai. */
const SCALE_KEY: Record<MoneyScale, string | null> = {
  none: null,
  million: 'pm.finance.scaleMillion',
  billion: 'pm.finance.scaleBillion',
};

const HEALTH_KEY: Record<BudgetHealth, string> = {
  HEALTHY: 'pm.finance.healthy',
  WARNING: 'pm.finance.warning',
  OVERRUN: 'pm.finance.overrun',
  UNKNOWN: 'pm.finance.healthUnknown',
};

export default function FinanceScreen(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(p), [p]);

  const [rows, setRows] = useState<ProjectFinance[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [insightProject, setInsightProject] = useState('');
  const [costs, setCosts] = useState<CostTransaction[]>([]);
  // Where the Active Projects Health section starts, so the Total Budget tile can scroll to the
  // breakdown of its own figure.
  const [healthY, setHealthY] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // Cheap ref, not state: it only decides whether the focus hook refetches, and writing it must not
  // re-render the screen it is measuring.
  const loadedOnce = useRef(false);

  const load = useCallback(() => {
    let cancelled = false;
    void (async () => {
      try {
        setFailed(false);
        const projects = await getMyProjects();
        // Budgets are fetched together rather than in sequence — a manager with eight projects would
        // otherwise wait eight round trips for a screen that is read at a glance.
        const budgets = await Promise.allSettled(
          projects.map((project) => get<BudgetResponse>(`/finance/budget/${project.project_id}`)),
        );
        if (cancelled) return;
        setRows(
          projects.flatMap((project, i) => {
            const result = budgets[i];
            // Rejected = 404 (never budgeted) or offline. Either way there is no figure to show for
            // this project, and a zero would read as "budgeted at nothing".
            if (result === undefined || result.status !== 'fulfilled') return [];
            const b = result.value.budget;
            return [
              {
                projectId: project.project_id,
                projectName: project.project_name,
                projectCode: project.project_code,
                currency: b.total_budget_currency,
                totalBudget: b.total_budget_amount,
                allocated: b.allocated_amount,
                committed: b.committed_amount,
                actual: b.actual_amount,
              },
            ];
          }),
        );
        // The dated ledger behind the two trend arrows. Paged: the endpoint caps `limit` at 100, and
        // two 30-day windows across five projects run past that.
        const ledger: CostTransaction[] = [];
        for (let page = 1; page <= 10; page++) {
          const res = await get<{ items?: CostTransaction[] } | CostTransaction[]>(
            '/finance/cost-transactions',
            { page: String(page), limit: '100' },
          );
          const items = Array.isArray(res) ? res : (res.items ?? []);
          ledger.push(...items);
          if (items.length < 100) break;
        }
        if (!cancelled) setCosts(ledger);
        loadedOnce.current = true;
      } catch {
        // `/projects/mine` did not answer. THIS IS NOT AN EMPTY PORTFOLIO and must not be drawn as
        // one: an earlier version set `rows` to [] here, and the manager Home — which loads the same
        // way — was captured showing "you are not a member of any project" to a manager with three.
        // Zeroed tiles are a claim about someone's money; a request that failed supports no claim.
        if (!cancelled) {
          setRows([]);
          setFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ON FOCUS, NOT ON MOUNT — so a load that lost the race with sign-in is retried when the manager
  // opens the tab again, rather than leaving the screen permanently blank. Only until the first
  // success: this screen costs one budget request per project.
  useFocusEffect(
    useCallback(() => {
      if (loadedOnce.current) return;
      return load();
    }, [load]),
  );

  const totals = useMemo(() => portfolioTotals(rows), [rows]);
  const currency = totals.currency ?? 'THB';

  /** A money figure at tile size: compact text plus its localised magnitude suffix. */
  const money = useCallback(
    (amount: Parameters<typeof compactMoney>[0]): string => {
      const { text, scale } = compactMoney(amount, currency);
      const key = SCALE_KEY[scale];
      // `฿ 805` + a gap + the localised magnitude — `฿ 805 M`, the project standard (PO
      // 2026-08-10). Thai's suffixes already carry their own leading space in the message file, so
      // the gap is added only where the key has none.
      if (key === null) return text;
      const suffix = t(key);
      return `${text}${suffix.startsWith(' ') ? '' : ' '}${suffix}`;
    },
    [currency, t],
  );

  // One clock per render, so the two tiles cannot land in different windows.
  const now = useMemo(() => new Date(), [costs]);
  const committedTrend = useMemo(() => spendTrend(costs, ['PURCHASE_ORDER'], now), [costs, now]);
  const actualTrend = useMemo(() => spendTrend(costs, ['INVOICE'], now), [costs, now]);

  /**
   * The drawing's arrow: "4.2%", a gap, then `trending_up` / `trending_down` at 14px.
   *
   * IT IS A REAL PERIOD-OVER-PERIOD CHANGE. An earlier version of this screen put a share-of-budget
   * figure here and argued a trend "is not computable" — true of `project_budgets`, which keeps no
   * history, and false of the product: `cost_transactions` is dated and typed, and §14 grants this
   * role read on it. See lib/spendTrend.ts.
   *
   * RISING SPEND IS THE WARNING DIRECTION, whichever tile it sits on. The mockup happens to draw
   * Commit Costs up/orange and Actual Spent down/green, but those are its sample figures — the
   * colour here follows what the arrow says, so it cannot tell a manager that a jump in spending is
   * the good news.
   */
  /** The colour a trend reads in — and, with it, the colour of its tile's accent stripe. */
  const trendTone = (trend: SpendTrend | null): string =>
    trend === null
      ? p.muted
      : trend.direction === 'up'
        ? p.warning
        : trend.direction === 'down'
          ? p.success
          : p.muted;

  const trendRow = (trend: SpendTrend | null): React.JSX.Element => {
    if (trend === null) {
      return (
        <Text
          style={[styles.tileShare, { color: p.muted }]}
          accessibilityLabel={t('pm.finance.noBaseline')}
        >
          —
        </Text>
      );
    }
    const tone = trendTone(trend);
    const percent = `${trend.percent > 0 ? '+' : ''}${String(trend.percent)}`;
    return (
      <View style={styles.shareRow} accessibilityLabel={t('pm.finance.trendLong', { percent })}>
        <Text style={[styles.tileShare, { color: tone }]}>
          {t('pm.finance.trend', { percent })}
        </Text>
        <MaterialIcons
          name={
            trend.direction === 'up'
              ? 'trending-up'
              : trend.direction === 'down'
                ? 'trending-down'
                : 'trending-flat'
          }
          size={14}
          color={tone}
        />
      </View>
    );
  };

  const healthColor = (health: BudgetHealth): string =>
    health === 'OVERRUN'
      ? p.danger
      : health === 'WARNING'
        ? p.warning
        : health === 'HEALTHY'
          ? p.success
          : p.muted;

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        testID="finance-screen"
        style={{ backgroundColor: p.bg }}
        contentContainerStyle={styles.page}
      >
        <Text style={styles.sectionTitle}>{t('pm.finance.portfolioSummary')}</Text>

        {loading ? <ActivityIndicator testID="finance-loading" color={p.primary} /> : null}

        <View style={styles.bento}>
          {/* Each tile opens where its own figure comes from: the budget total is broken down by the
            health list on this screen, commitments are purchase orders, actual spend is the
            invoices behind them. Nothing here opens a screen this role may not read (§6.4). */}
          <Pressable
            testID="tile-total-budget"
            accessibilityRole="button"
            accessibilityLabel={t('pm.finance.totalBudget')}
            onPress={() => scrollRef.current?.scrollTo({ y: healthY, animated: true })}
            style={[styles.tile, { borderLeftColor: p.primary }]}
          >
            <MaterialIcons
              name="chevron-right"
              size={16}
              color={p.muted}
              style={styles.tileChevron}
            />
            <Text style={styles.tileLabel}>{t('pm.finance.totalBudget')}</Text>
            <Text style={styles.tileHero}>{money(totals.totalBudget)}</Text>
            <Text style={styles.tileFoot}>
              {t('pm.finance.acrossProjects', { count: String(totals.included) })}
            </Text>
          </Pressable>

          <View style={styles.bentoColumn}>
            <Pressable
              testID="tile-committed"
              accessibilityRole="button"
              accessibilityLabel={t('pm.finance.commitCosts')}
              onPress={() => router.push('/orders')}
              // The stripe is the same colour as the figure it belongs to (PO decision
              // 2026-08-10). A card striped orange with a green number inside states two different
              // verdicts about one measurement.
              style={[styles.tile, { borderLeftColor: trendTone(committedTrend) }]}
            >
              <MaterialIcons
                name="chevron-right"
                size={16}
                color={p.muted}
                style={styles.tileChevron}
              />
              <Text style={styles.tileLabel}>{t('pm.finance.commitCosts')}</Text>
              <View style={styles.tileRow}>
                <Text style={styles.tileValue}>{money(totals.committed)}</Text>
                {trendRow(committedTrend)}
              </View>
            </Pressable>
            <Pressable
              testID="tile-actual"
              accessibilityRole="button"
              accessibilityLabel={t('pm.finance.actualSpent')}
              onPress={() => router.push('/invoices')}
              style={[styles.tile, { borderLeftColor: trendTone(actualTrend) }]}
            >
              <MaterialIcons
                name="chevron-right"
                size={16}
                color={p.muted}
                style={styles.tileChevron}
              />
              <Text style={styles.tileLabel}>{t('pm.finance.actualSpent')}</Text>
              <View style={styles.tileRow}>
                <Text style={styles.tileValue}>{money(totals.actual)}</Text>
                {trendRow(actualTrend)}
              </View>
            </Pressable>
          </View>
        </View>

        {/* Only shown when it is true: some project is budgeted in another currency and is therefore
          NOT in the figures above. Silence here would let three tiles stand for a portfolio they do
          not cover. */}
        {totals.excluded > 0 ? (
          <Text testID="finance-mixed-currency" style={styles.notice}>
            {t('pm.finance.otherCurrencies', { count: String(totals.excluded) })}
          </Text>
        ) : null}

        <ProjectPicker selectedId={insightProject} onSelect={setInsightProject} />
        {/* No "Review Adjustments" button (PO decision 2026-08-10, reversing the request that added
          it): there is no budget-adjustment screen, and editing a budget is `POST /finance/budget/
          :id`, which §6.4 gives FINANCE and TENANT_ADMIN only — this role could not act on one if it
          existed. The panel's own GENERATE REPORT carries the chevron instead. */}
        <PortfolioInsight projectId={insightProject} />

        <Text style={styles.sectionTitle} onLayout={(e) => setHealthY(e.nativeEvent.layout.y)}>
          {t('pm.finance.activeProjectsHealth')}
        </Text>

        {!loading && failed ? (
          <Text testID="finance-failed" style={styles.notice}>
            {t('pm.finance.loadFailed')}
          </Text>
        ) : null}

        {!loading && !failed && rows.length === 0 ? (
          <Text testID="finance-empty" style={styles.notice}>
            {t('pm.finance.noBudgets')}
          </Text>
        ) : null}

        {rows.map((row) => {
          const health = budgetHealth(row.actual, row.totalBudget);
          const colour = healthColor(health);
          return (
            <Pressable
              key={row.projectId}
              testID={`finance-project-${row.projectId}`}
              accessibilityRole="button"
              accessibilityLabel={row.projectName}
              // The manager analytics for THIS project — `/dashboard` now takes the id, so the card
              // opens the project it names instead of a picker.
              onPress={() =>
                router.push({ pathname: '/dashboard', params: { projectId: row.projectId } })
              }
              style={[styles.card, { borderLeftColor: colour }]}
            >
              <View style={styles.cardHead}>
                <View style={styles.cardTitleBlock}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {row.projectName}
                  </Text>
                  <Text style={styles.cardCode}>{row.projectCode}</Text>
                </View>
                <View style={[styles.badge, { borderColor: colour }]}>
                  <Text style={[styles.badgeText, { color: colour }]}>{t(HEALTH_KEY[health])}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={p.muted} />
              </View>

              <View style={styles.figures}>
                <Text style={styles.figure}>
                  {t('pm.finance.actualFigure', { value: money(row.actual) })}
                </Text>
                <Text style={styles.figure}>
                  {t('pm.finance.budgetFigure', { value: money(row.totalBudget) })}
                </Text>
              </View>

              <View style={styles.track}>
                <View
                  testID={`finance-bar-${row.projectId}`}
                  style={[
                    styles.fill,
                    {
                      backgroundColor: colour,
                      // `999` is the documented full-width marker used across this app's bars; the
                      // fraction is clamped at 1 in budgetFraction so an overrun cannot draw past the
                      // track — the badge already says it is over.
                      width: `${budgetFraction(row.actual, row.totalBudget) * 100}%`,
                    },
                  ]}
                />
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* The drawing's round floating action button. It creates a PURCHASE REQUEST — §6.4 gives
          PROJECT_MANAGER `RW` there and it is the one thing this role may create that starts the
          spend this dashboard measures. A budget action would be `POST /finance/budget/:id`, which
          the role does not hold, so a "+" wired to that would have one outcome: 403. */}
      <Pressable
        testID="finance-fab"
        accessibilityRole="button"
        accessibilityLabel={t('pm.finance.newRequest')}
        onPress={() => router.push('/material-request')}
        style={styles.fab}
      >
        <MaterialIcons name="add" size={28} color={p.onPrimary} />
      </Pressable>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: p.bg },
    // The list scrolls under the FAB, so the last card needs room or the button sits on its figures.
    page: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl * 3 },

    sectionTitle: {
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },

    bento: { flexDirection: 'row', gap: spacing.sm },
    bentoColumn: { flex: 1, gap: spacing.sm },
    tileChevron: { position: 'absolute', top: spacing.xs, right: spacing.xs },
    tile: {
      flex: 1,
      justifyContent: 'center',
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      backgroundColor: p.surface,
      gap: spacing.xs / 2,
    },
    tileLabel: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: 10,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    tileHero: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.title.fontSize,
      lineHeight: typography.title.lineHeight,
    },
    tileFoot: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    tileRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: spacing.xs,
    },
    tileValue: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
    },
    // The drawing's `font-tiny-web`: 11px, medium, slight tracking.
    shareRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    tileShare: { fontFamily: fontFamily.medium, fontSize: 11, letterSpacing: 0.3 },

    notice: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },

    card: {
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      backgroundColor: p.surface,
      gap: spacing.sm,
    },
    cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    cardTitleBlock: { flex: 1, gap: spacing.xs / 4 },
    cardTitle: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.body.fontSize,
    },
    cardCode: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    badge: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      // §32.7's badge radius, enforced by theme/__tests__/badgeRadius.spec.ts — every status pill in
      // the app is radius.xl, and the mockup's `rounded` on this chip is that same 8px.
      borderRadius: radius.xl,
      borderWidth: 1,
    },
    badgeText: {
      fontFamily: fontFamily.medium,
      fontSize: 10,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },

    figures: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
    figure: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    track: {
      height: 8,
      borderRadius: 999,
      backgroundColor: p.elevated,
      overflow: 'hidden',
    },
    fill: { height: '100%', borderRadius: 999 },

    fab: {
      position: 'absolute',
      right: spacing.md,
      bottom: spacing.lg,
      width: touchTarget.primaryButton,
      height: touchTarget.primaryButton,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.primary,
      // Android draws shadows from elevation only; iOS from the shadow props.
      elevation: 6,
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
    },
  });
