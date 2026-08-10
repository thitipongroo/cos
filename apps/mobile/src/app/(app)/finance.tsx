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
//   - The chevron on each project card. There is no per-project finance screen this role can reach:
//     `/budget` is a FINANCE / VIEWER tab, so pushing a PM into it would land them on a screen with
//     no Back control and no tab of their own to leave by. A chevron that opens nothing is worse
//     than no chevron, so the cards are not pressable and the affordance is absent.
//
// The FAB is absent for the same kind of reason: creating a budget is `POST /finance/budget/:id`,
// which is FINANCE / TENANT_ADMIN only (§6.4 gives this role R on Budget/Cost). A "+" here would be
// a button whose only outcome is 403.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { get } from '../../api/client';
import { getMyProjects } from '../../api/projects';
import { compactMoney, type MoneyScale } from '../../lib/compactMoney';
import { budgetHealth, budgetFraction, type BudgetHealth } from '../../lib/budgetHealth';
import { portfolioTotals, shareOfBudget, type ProjectFinance } from '../../lib/portfolioFinance';
import { ProjectPicker } from '../../components/ProjectPicker';
import { PortfolioInsight } from '../../components/PortfolioInsight';
import { useT } from '../../i18n';
import { fontFamily, radius, spacing, typography } from '../../theme/tokens';
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
  const styles = useMemo(() => makeStyles(p), [p]);

  const [rows, setRows] = useState<ProjectFinance[]>([]);
  const [loading, setLoading] = useState(true);
  const [insightProject, setInsightProject] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
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
                committed: b.committed_amount,
                actual: b.actual_amount,
              },
            ];
          }),
        );
      } catch {
        // `/projects/mine` failed — offline. An empty portfolio is what the screen can honestly show.
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => portfolioTotals(rows), [rows]);
  const currency = totals.currency ?? 'THB';

  /** A money figure at tile size: compact text plus its localised magnitude suffix. */
  const money = useCallback(
    (amount: Parameters<typeof compactMoney>[0]): string => {
      const { text, scale } = compactMoney(amount, currency);
      const key = SCALE_KEY[scale];
      return key === null ? text : `${text}${t(key)}`;
    },
    [currency, t],
  );

  const share = useCallback(
    (part: Parameters<typeof shareOfBudget>[0]): string => {
      const pct = shareOfBudget(part, totals.totalBudget);
      return pct === null ? '—' : t('pm.finance.shareOfBudget', { percent: String(pct) });
    },
    [totals.totalBudget, t],
  );

  const healthColor = (health: BudgetHealth): string =>
    health === 'OVERRUN'
      ? p.danger
      : health === 'WARNING'
        ? p.warning
        : health === 'HEALTHY'
          ? p.success
          : p.muted;

  return (
    <ScrollView
      testID="finance-screen"
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={styles.page}
    >
      <Text style={styles.sectionTitle}>{t('pm.finance.portfolioSummary')}</Text>

      {loading ? <ActivityIndicator testID="finance-loading" color={p.primary} /> : null}

      <View style={styles.bento}>
        <View testID="tile-total-budget" style={[styles.tile, { borderLeftColor: p.primary }]}>
          <Text style={styles.tileLabel}>{t('pm.finance.totalBudget')}</Text>
          <Text style={styles.tileHero}>{money(totals.totalBudget)}</Text>
          <Text style={styles.tileFoot}>
            {t('pm.finance.acrossProjects', { count: String(totals.included) })}
          </Text>
        </View>

        <View style={styles.bentoColumn}>
          <View testID="tile-committed" style={[styles.tile, { borderLeftColor: p.warning }]}>
            <Text style={styles.tileLabel}>{t('pm.finance.commitCosts')}</Text>
            <View style={styles.tileRow}>
              <Text style={styles.tileValue}>{money(totals.committed)}</Text>
              <Text style={[styles.tileShare, { color: p.warning }]}>
                {share(totals.committed)}
              </Text>
            </View>
          </View>
          <View testID="tile-actual" style={[styles.tile, { borderLeftColor: p.success }]}>
            <Text style={styles.tileLabel}>{t('pm.finance.actualSpent')}</Text>
            <View style={styles.tileRow}>
              <Text style={styles.tileValue}>{money(totals.actual)}</Text>
              <Text style={[styles.tileShare, { color: p.success }]}>{share(totals.actual)}</Text>
            </View>
          </View>
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
      <PortfolioInsight projectId={insightProject} />

      <Text style={styles.sectionTitle}>{t('pm.finance.activeProjectsHealth')}</Text>

      {!loading && rows.length === 0 ? (
        <Text testID="finance-empty" style={styles.notice}>
          {t('pm.finance.noBudgets')}
        </Text>
      ) : null}

      {rows.map((row) => {
        const health = budgetHealth(row.actual, row.totalBudget);
        const colour = healthColor(health);
        return (
          <View
            key={row.projectId}
            testID={`finance-project-${row.projectId}`}
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
          </View>
        );
      })}

      <View style={styles.footNote}>
        <MaterialIcons name="info-outline" size={14} color={p.muted} />
        <Text style={styles.footNoteText}>{t('pm.finance.sourceNote')}</Text>
      </View>
    </ScrollView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.md },

    sectionTitle: {
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },

    bento: { flexDirection: 'row', gap: spacing.sm },
    bentoColumn: { flex: 1, gap: spacing.sm },
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
    tileShare: { fontFamily: fontFamily.medium, fontSize: 10 },

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

    footNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    footNoteText: {
      flex: 1,
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
  });
