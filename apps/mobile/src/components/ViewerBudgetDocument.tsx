// Budget — what the project was given, what it has absorbed, and who certified each release.
//
// DRAWING: mockup/mobile/role_viewer/07_budget/01_budget (Stitch screen
// "งบประมาณและต้นทุน - Viewer (Budget Mobile)"), created 2026-09-11 and downloaded the same day; the
// repo copy is sha256-identical to what Stitch serves. At 4,206px it is the tallest screen in this
// role's set.
//
// ── WHY IT IS A BRANCH OF `(app)/budget.tsx` RATHER THAN A ROUTE OF ITS OWN ─────────────────────
//
// `/budget` is VIEWER's fourth tab and FINANCE's third, and it is also a drawer row for five more
// roles — seven in total reach it. Until today every one of them got the FINANCE screen, including
// its "request an amendment" control. §20.7.9 forbids rendering a create/edit action to a VIEWER.
// The route branches on role now (product-owner decision F1 = A, 2026-09-11), which is the pattern
// `home.tsx` has always used; FINANCE and the other five keep their screen untouched.
//
// ── EVERY FIGURE IS DRAWN, AND IT IS MISSING AUTHORITY RATHER THAN MISSING DATA ─────────────────
//
// `budget.tsx` reads `GET /finance/budget/{id}`, `/finance/cost-transactions` and
// `/finance/cashflow-forecast/{id}` and renders them for FINANCE. Measured 2026-09-11 with a real
// VIEWER token, all three answer **403** — while §6.8 grants this role "Finance (all) R". The three
// routes are opened in this same round (F3 = C); until this screen is rewired onto them,
// VIEWER_BUDGET_SUMMARY, VIEWER_BUDGET_ABSORPTION, VIEWER_BUDGET_FORECAST, VIEWER_BOQ_CATEGORIES,
// VIEWER_BUDGET_PROGRESS_PHOTO, VIEWER_BUDGET_LOG and VIEWER_BUDGET_CONTEXT stand in.
//
// MONEY GOES THROUGH `@cos/financial`, in both of its forms and for the reason the drawing itself
// shows: the summary cards are compact (`฿ 124.5 M`) and the BOQ rows are exact
// (`฿ 45,000,000.00`). Those are `compactMoneyLabel` and `formatMoney`. Hardcoding either would
// hardcode the symbol and the separator, which belong to the reader's locale.
//
// THE FORECAST CARD'S CONFIDENCE SITS IN THE FOOT, not the header chip the drawing draws — the
// 2026-09-08 standard (§32.7, `<AiCardFooter />`), chosen by the product owner every time this
// conflict has come up. Its SOURCE names a record set this repository has.
//
// ── READ-ONLY IS NOT UNTAPPABLE ─────────────────────────────────────────────────────────────────
//
// The first version of this file carried no `onPress` at all and treated that as what "read-only"
// means. It is not what §20.7.9 says: create, edit and approve are forbidden, and opening a detail
// is a read. What that version shipped was `DETAILS ›`, an `EXPAND` chip, a chevron in each summary
// card's head and a round chevron plate on every BOQ division and log row — nine affordances
// answering nothing. The first Android capture is what showed it, side by side with Home and
// Insights where the same shapes respond. Each now raises `useComingSoon()`, and the spec counts
// the handlers against the register so a card cannot be added without one or lose the one it has.

import { useMemo } from 'react';
import { View, Text, Image, Pressable, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { formatMoney } from '@cos/financial';
import site1 from '../../assets/crm/construction-site-1.jpg';
import { AiCardFooter } from './AiCardFooter';
import { useComingSoon } from './useComingSoon';
import { compactMoneyLabel } from '../lib/compactMoney';
import {
  VIEWER_BOQ_CATEGORIES,
  VIEWER_BUDGET_ABSORPTION,
  VIEWER_BUDGET_CONTEXT,
  VIEWER_BUDGET_FORECAST,
  VIEWER_BUDGET_LOG,
  VIEWER_BUDGET_PROGRESS_PHOTO,
  VIEWER_BUDGET_SUMMARY,
} from '../lib/mockupFigures';
import { useT } from '../i18n';
import { fontFamily, plateRadius, radius, spacing, typography } from '../theme/tokens';
import { usePalette, type Palette } from '../theme/usePalette';

/** The context row's glyph plate, and the log rows'. */
const PLATE = 28;

/** The absorption bar's segment colours, in the drawing's order. */
const SEGMENT_TONE = ['primary', 'accent', 'accentSoft', 'warning'] as const;

/**
 * The bundled photograph the progress block draws.
 *
 * `import`, not `require`: the repo's precedent is `opportunities.tsx` and the lint rule forbids
 * require-style imports. The assertion keeps the register and the bundled file from drifting.
 */
if (!VIEWER_BUDGET_PROGRESS_PHOTO.value.file.endsWith('.jpg')) {
  throw new Error('VIEWER_BUDGET_PROGRESS_PHOTO no longer names a bundled file');
}

export function ViewerBudgetDocument(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  const soon = useComingSoon();

  const sum = VIEWER_BUDGET_SUMMARY.value;
  const fc = VIEWER_BUDGET_FORECAST.value;
  const compact = (amount: number): string =>
    compactMoneyLabel(amount, sum.currency, t, { maxScale: 'million' });
  const segmentColor = (name: (typeof SEGMENT_TONE)[number]): string =>
    name === 'primary'
      ? p.primary
      : name === 'accent'
        ? p.accent
        : name === 'warning'
          ? p.warning
          : p.surfaceBright;
  const stateTone = (state: string): string =>
    state === 'onTrack' ? p.success : state === 'allocated' ? p.warning : p.muted;
  const logTone = (tone: string): string =>
    tone === 'success' ? p.success : tone === 'accent' ? p.accent : p.primary;

  return (
    <ScrollView testID="viewer-budget" style={styles.root} contentContainerStyle={styles.page}>
      {/* ── CONTEXT ───────────────────────────────────────────────────────────────────────────── */}
      <View testID="budget-context" style={styles.contextRow}>
        <View style={styles.contextLeft}>
          <View style={styles.contextPlate}>
            <MaterialIcons name="apartment" size={18} color={p.accent} />
          </View>
          <Text style={styles.contextName} numberOfLines={1} ellipsizeMode="tail">
            {VIEWER_BUDGET_CONTEXT.value.project}
          </Text>
          <MaterialIcons name="unfold-more" size={15} color={p.muted} />
        </View>
        <View style={styles.rolePill}>
          <MaterialIcons name="visibility" size={14} color={p.primary} />
          <Text style={styles.roleText}>{t('finance.viewer.readOnlyRole')}</Text>
        </View>
      </View>

      {/* ── TOTAL BUDGET ──────────────────────────────────────────────────────────────────────── */}
      <Pressable
        testID="budget-total"
        accessibilityRole="button"
        accessibilityLabel={t('finance.viewer.totalBudget')}
        onPress={() => soon('finance.viewer.totalBudget')}
        style={styles.card}
      >
        <View style={styles.cardHead}>
          <View style={styles.cardHeadLeft}>
            <MaterialIcons name="account-balance-wallet" size={16} color={p.muted} />
            <Text style={styles.cardLabel}>{t('finance.viewer.totalBudget')}</Text>
          </View>
          <MaterialIcons name="chevron-right" size={16} color={p.muted} />
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalValue}>{compact(sum.total)}</Text>
          <View style={styles.detailsRow}>
            <Text style={styles.detailsText}>{t('finance.viewer.details')}</Text>
            <MaterialIcons name="chevron-right" size={13} color={p.accent} />
          </View>
        </View>
        <View style={styles.totalFoot}>
          <Text style={styles.footMuted}>
            {t('finance.viewer.reserved', { amount: compact(sum.reserved) })}
          </Text>
          <Text style={styles.footAccent}>
            {t('finance.viewer.allocated', { pct: sum.allocatedPct })}
          </Text>
        </View>
      </Pressable>

      {/* ── COMMITTED · ACTUAL ────────────────────────────────────────────────────────────────── */}
      <View style={styles.pairRow}>
        <Pressable
          testID="budget-committed"
          accessibilityRole="button"
          accessibilityLabel={t('finance.viewer.committed')}
          onPress={() => soon('finance.viewer.committed')}
          style={styles.halfCard}
        >
          <View style={styles.cardHead}>
            <View style={styles.cardHeadLeft}>
              <MaterialIcons name="assignment" size={15} color={p.accent} />
              <Text style={styles.cardLabel} numberOfLines={1}>
                {t('finance.viewer.committed')}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={15} color={p.muted} />
          </View>
          <Text style={styles.halfValue}>{compact(sum.committed)}</Text>
          <View style={styles.dotRow}>
            <View style={[styles.dot, { backgroundColor: p.accent }]} />
            <Text style={styles.dotText}>
              {t('finance.viewer.ofCap', { pct: sum.committedPctOfCap })}
            </Text>
          </View>
        </Pressable>

        <Pressable
          testID="budget-actual"
          accessibilityRole="button"
          accessibilityLabel={t('finance.viewer.actualSpent')}
          onPress={() => soon('finance.viewer.actualSpent')}
          style={styles.halfCard}
        >
          <View style={styles.cardHead}>
            <View style={styles.cardHeadLeft}>
              <MaterialIcons name="payments" size={15} color={p.success} />
              <Text style={styles.cardLabel} numberOfLines={1}>
                {t('finance.viewer.actualSpent')}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={15} color={p.muted} />
          </View>
          <Text style={styles.halfValue}>{compact(sum.actual)}</Text>
          <View style={styles.actualFoot}>
            <Text style={styles.dotText}>{t('finance.viewer.burned', { pct: sum.burnedPct })}</Text>
            {/* A NEGATIVE VARIANCE IS FAVOURABLE on a spend line — under budget. The drawing marks
                it so, and the tone follows the meaning rather than the sign. */}
            <View style={styles.varianceChip}>
              <Text style={styles.varianceText}>
                {t('finance.viewer.favourable', { pct: sum.variancePct })}
              </Text>
            </View>
          </View>
        </Pressable>
      </View>

      {/* ── ABSORPTION ────────────────────────────────────────────────────────────────────────── */}
      <View testID="budget-absorption" style={styles.card}>
        <View style={styles.cardHead}>
          <View style={styles.cardHeadLeft}>
            <MaterialIcons name="stacked-bar-chart" size={16} color={p.accent} />
            <Text style={styles.sectionLabel}>{t('finance.viewer.absorption')}</Text>
          </View>
          <View style={styles.consumeRow}>
            <Text style={styles.footMuted}>
              {t('finance.viewer.consume', { amount: compact(sum.actual) })}
            </Text>
            <Text style={styles.footAccent}>{`(${sum.burnedPct}%)`}</Text>
          </View>
        </View>

        <View style={styles.stackBar}>
          {VIEWER_BUDGET_ABSORPTION.value.map((seg, index) => (
            <View
              key={seg.key}
              testID={`budget-segment-${seg.key}`}
              style={{
                width: `${seg.pct}%`,
                backgroundColor: segmentColor(SEGMENT_TONE[index] ?? 'primary'),
              }}
            />
          ))}
        </View>

        <View style={styles.legendGrid}>
          {VIEWER_BUDGET_ABSORPTION.value.map((seg, index) => (
            <View key={seg.key} style={styles.legendItem}>
              <View style={styles.legendLeft}>
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: segmentColor(SEGMENT_TONE[index] ?? 'primary') },
                  ]}
                />
                <Text style={styles.legendLabel} numberOfLines={1}>
                  {t(`finance.viewer.category.${seg.key}`)}
                </Text>
              </View>
              <Text style={styles.legendValue} numberOfLines={1}>
                {t('finance.viewer.legendValue', {
                  pct: seg.pct,
                  amount: compact(seg.amount),
                })}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── AUDIT & FORECAST ──────────────────────────────────────────────────────────────────── */}
      <View testID="budget-forecast" style={styles.aiCard}>
        <View style={styles.cardHeadLeft}>
          <View style={styles.aiPlate}>
            <MaterialIcons name="smart-toy" size={16} color={p.accent} />
          </View>
          <Text style={styles.aiTitle}>{t('finance.viewer.auditForecast')}</Text>
        </View>
        <Text style={styles.aiBody}>{fc.body}</Text>

        <View style={styles.metricRow}>
          <View style={styles.metricCell}>
            <Text style={styles.metricLabel}>{t('finance.viewer.burnVelocity')}</Text>
            <Text style={styles.metricValue} numberOfLines={1}>
              {t('finance.viewer.perWeek', { amount: compact(fc.burnVelocity) })}
            </Text>
          </View>
          <View style={styles.metricCell}>
            <Text style={styles.metricLabel}>{t('finance.viewer.eacTarget')}</Text>
            <Text style={styles.metricValue} numberOfLines={1}>
              {compact(fc.eacTarget)}
            </Text>
          </View>
          <View style={styles.metricCell}>
            <Text style={styles.metricLabel}>{t('finance.viewer.riskIndex')}</Text>
            <Text style={[styles.metricValue, { color: p.success }]} numberOfLines={1}>
              {t('finance.viewer.riskValue', {
                band: t(`finance.viewer.riskBand.${fc.riskBand}`),
                value: fc.riskIndex,
              })}
            </Text>
          </View>
        </View>

        <AiCardFooter
          testID="budget-forecast-foot"
          percent={fc.confidence}
          source={t('insight.sourcePortfolio')}
          confLabel={t('insight.confShort')}
          sourceLabel={t('insight.sourceShort')}
          palette={p}
        />
      </View>

      {/* ── BOQ WORK CATEGORIES ───────────────────────────────────────────────────────────────── */}
      <View style={styles.sectionHead}>
        <View style={styles.cardHeadLeft}>
          <MaterialIcons name="account-tree" size={17} color={p.muted} />
          <Text style={styles.sectionTitle}>{t('finance.viewer.boqCategories')}</Text>
        </View>
        <Text style={styles.footMuted}>
          {t('finance.viewer.divisions', { count: VIEWER_BOQ_CATEGORIES.value.length })}
        </Text>
      </View>

      {VIEWER_BOQ_CATEGORIES.value.map((cat) => {
        const color = stateTone(cat.state);
        return (
          <Pressable
            key={cat.key}
            testID={`budget-boq-${cat.key}`}
            accessibilityRole="button"
            accessibilityLabel={t(`finance.viewer.category.${cat.key}Full`)}
            onPress={() => soon(`finance.viewer.category.${cat.key}Full`)}
            style={styles.card}
          >
            <View style={styles.boqHead}>
              <View style={styles.boqTitleBlock}>
                <Text style={styles.boqDivision} numberOfLines={1}>
                  {cat.division}
                </Text>
                <Text style={styles.boqTitle} numberOfLines={1} ellipsizeMode="tail">
                  {t(`finance.viewer.category.${cat.key}Full`)}
                </Text>
              </View>
              <View style={styles.boqTrail}>
                <View style={styles.boqStateChip}>
                  {cat.state === 'allocated' ? (
                    <MaterialIcons name="warning" size={13} color={color} />
                  ) : null}
                  <Text style={[styles.boqStateText, { color }]}>
                    {cat.state === 'allocated'
                      ? t('finance.viewer.pctAllocated', { pct: cat.pct })
                      : t(`finance.viewer.boqState.${cat.state}`)}
                  </Text>
                </View>
                <View style={styles.boqChevron}>
                  <MaterialIcons name="chevron-right" size={16} color={p.muted} />
                </View>
              </View>
            </View>

            <View style={styles.boqAmounts}>
              <View>
                <Text style={styles.boqAmountLabel}>{t('finance.viewer.budgetLabel')}</Text>
                {/* EXACT, not compact — the drawing prints the full figure on these rows and a
                    budget line is read to the satang. `formatMoney` is the invoice format. */}
                <Text style={styles.boqAmount}>{formatMoney(cat.budget, sum.currency)}</Text>
              </View>
              <View style={styles.boqAmountRight}>
                <Text style={styles.boqAmountLabel}>
                  {t('finance.viewer.disbursed', { pct: cat.pct })}
                </Text>
                <Text style={[styles.boqAmount, cat.state === 'allocated' && { color }]}>
                  {formatMoney(cat.disbursed, sum.currency)}
                </Text>
              </View>
            </View>

            <View style={styles.boqTrack}>
              <View style={[styles.boqFill, { width: `${cat.pct}%`, backgroundColor: color }]} />
            </View>
          </Pressable>
        );
      })}

      {/* ── ON-SITE PROGRESS ──────────────────────────────────────────────────────────────────── */}
      <View testID="budget-progress" style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardLabelPlain}>{t('finance.viewer.onSiteProgress')}</Text>
          <Text style={styles.footMuted}>{t('finance.viewer.surveyedToday')}</Text>
        </View>
        {/* DRAWN — a bundled stock photograph, not this project's level 18. See
            VIEWER_BUDGET_PROGRESS_PHOTO, and `opportunities.tsx` for the same treatment. */}
        <View style={styles.photoWrap}>
          <Image source={site1} style={styles.photo} resizeMode="cover" accessible={false} />
          <View style={styles.photoStrip}>
            <View style={styles.photoCaptionBlock}>
              <Text style={styles.photoCaption} numberOfLines={1}>
                {VIEWER_BUDGET_PROGRESS_PHOTO.value.caption}
              </Text>
              <Text style={styles.photoMilestone} numberOfLines={1}>
                {VIEWER_BUDGET_PROGRESS_PHOTO.value.milestone}
              </Text>
            </View>
            <Pressable
              testID="budget-expand"
              accessibilityRole="button"
              accessibilityLabel={t('finance.viewer.expand')}
              onPress={() => soon('finance.viewer.expand')}
              style={styles.expandChip}
            >
              <MaterialIcons name="open-in-full" size={14} color={p.primary} />
              <Text style={styles.expandText}>{t('finance.viewer.expand')}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* ── VERIFIED LOG ──────────────────────────────────────────────────────────────────────── */}
      <View testID="budget-log" style={styles.card}>
        <View style={styles.cardHead}>
          <View style={styles.cardHeadLeft}>
            <MaterialIcons name="history-edu" size={17} color={p.muted} />
            <Text style={styles.sectionTitle}>{t('finance.viewer.verifiedLog')}</Text>
          </View>
          <Text style={styles.footMuted}>{t('finance.viewer.auditTrail')}</Text>
        </View>

        {VIEWER_BUDGET_LOG.value.map((entry) => (
          <Pressable
            key={entry.key}
            testID={`budget-log-${entry.key}`}
            accessibilityRole="button"
            accessibilityLabel={t(`finance.viewer.log.${entry.key}`)}
            onPress={() => soon(`finance.viewer.log.${entry.key}`)}
            style={styles.logRow}
          >
            <View style={styles.logLeft}>
              <View style={styles.logPlate}>
                <MaterialIcons name={entry.icon} size={16} color={logTone(entry.tone)} />
              </View>
              <View style={styles.logTextBlock}>
                <Text style={styles.logTitle} numberOfLines={1} ellipsizeMode="tail">
                  {t(`finance.viewer.log.${entry.key}`)}
                </Text>
                <Text style={styles.logMeta} numberOfLines={1}>
                  {entry.party}
                </Text>
                <Text style={styles.logMeta} numberOfLines={1}>
                  {t('finance.viewer.certifier', { who: entry.certifier })}
                </Text>
              </View>
            </View>
            <View style={styles.logTrail}>
              <View style={styles.logAmountBlock}>
                <Text style={styles.logAmount}>{compact(entry.amount)}</Text>
                <Text style={[styles.logState, { color: logTone(entry.tone) }]}>
                  {t(`finance.viewer.logState.${entry.state}`)}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={16} color={p.muted} />
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: p.bg },
    page: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl * 3 },

    // ── context ───────────────────────────────────────────────────────────────────────────────
    contextRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.xl,
      backgroundColor: p.surfaceSunk,
    },
    contextLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    contextPlate: {
      width: PLATE,
      height: PLATE,
      borderRadius: plateRadius(PLATE),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.surfaceBright,
    },
    contextName: {
      flexShrink: 1,
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    rolePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      // §32.7's platform ruling: every status pill, badge and chip takes radius.xl — one token,
      // no exceptions. `badgeRadius.spec.ts` reads the stylesheet and refuses anything else.
      borderRadius: radius.xl,
      backgroundColor: p.surfaceBright,
    },
    roleText: {
      color: p.primary,
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },

    // ── cards ─────────────────────────────────────────────────────────────────────────────────
    card: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    pairRow: { flexDirection: 'row', gap: spacing.sm },
    halfCard: {
      flex: 1,
      gap: spacing.xs,
      padding: spacing.sm,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    cardHeadLeft: {
      flexShrink: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
    },
    cardLabel: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    cardLabelPlain: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    sectionLabel: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },

    totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    totalValue: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.hero.fontSize,
      lineHeight: typography.hero.lineHeight,
    },
    detailsRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    detailsText: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
    },
    totalFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    footMuted: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    footAccent: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
    },

    halfValue: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.title.fontSize,
      lineHeight: typography.title.lineHeight,
    },
    dotRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
    dot: { width: 6, height: 6, borderRadius: 999 },
    dotText: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    actualFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs / 2,
    },
    varianceChip: {
      paddingHorizontal: spacing.xs / 2,
      paddingVertical: 2,
      // §32.7's platform ruling: every status pill, badge and chip takes radius.xl — one token,
      // no exceptions. `badgeRadius.spec.ts` reads the stylesheet and refuses anything else.
      borderRadius: radius.xl,
      backgroundColor: p.surfaceBright,
    },
    varianceText: {
      color: p.success,
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
    },

    // ── absorption ────────────────────────────────────────────────────────────────────────────
    consumeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
    stackBar: {
      flexDirection: 'row',
      height: 12,
      borderRadius: 999,
      backgroundColor: p.surfaceSunk,
      overflow: 'hidden',
    },
    legendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    legendItem: {
      flexBasis: '48%',
      flexGrow: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs / 2,
    },
    legendLeft: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
    legendDot: { width: 8, height: 8, borderRadius: 999 },
    legendLabel: {
      flexShrink: 1,
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    legendValue: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },

    // ── AI card ───────────────────────────────────────────────────────────────────────────────
    aiCard: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    aiPlate: {
      width: 24,
      height: 24,
      borderRadius: plateRadius(24),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.surfaceBright,
    },
    aiTitle: {
      color: p.accent,
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    aiBody: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    metricRow: {
      flexDirection: 'row',
      gap: spacing.xs,
      padding: spacing.xs,
      borderRadius: radius.lg,
      backgroundColor: p.surfaceSunk,
    },
    metricCell: { flex: 1, gap: 2 },
    metricLabel: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    metricValue: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },

    // ── BOQ ───────────────────────────────────────────────────────────────────────────────────
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    sectionTitle: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.title.fontSize,
      lineHeight: typography.title.lineHeight,
      textTransform: 'uppercase',
    },
    boqHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    boqTitleBlock: { flex: 1, gap: 2 },
    boqDivision: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    boqTitle: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
    },
    boqTrail: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    boqStateChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      backgroundColor: p.surfaceBright,
    },
    boqStateText: {
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    boqChevron: {
      width: 24,
      height: 24,
      borderRadius: plateRadius(24),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.surfaceBright,
    },
    boqAmounts: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    boqAmountRight: { alignItems: 'flex-end' },
    boqAmountLabel: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
    },
    boqAmount: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
    },
    boqTrack: {
      height: 6,
      borderRadius: 999,
      backgroundColor: p.surfaceSunk,
      overflow: 'hidden',
    },
    boqFill: { height: '100%', borderRadius: 999 },

    // ── progress photo ────────────────────────────────────────────────────────────────────────
    photoWrap: { borderRadius: radius.lg, overflow: 'hidden' },
    photo: { width: '100%', height: 144 },
    photoStrip: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs,
      padding: spacing.sm,
      backgroundColor: p.surfaceSunk,
    },
    photoCaptionBlock: { flexShrink: 1 },
    photoCaption: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    photoMilestone: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    expandChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      // §32.7's platform ruling: every status pill, badge and chip takes radius.xl — one token,
      // no exceptions. `badgeRadius.spec.ts` reads the stylesheet and refuses anything else.
      borderRadius: radius.xl,
      backgroundColor: p.surfaceBright,
    },
    expandText: {
      color: p.primary,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
    },

    // ── verified log ──────────────────────────────────────────────────────────────────────────
    logRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: p.surfaceSunk,
    },
    logLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
    logPlate: {
      width: PLATE,
      height: PLATE,
      borderRadius: plateRadius(PLATE),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.surfaceBright,
    },
    logTextBlock: { flex: 1, gap: 2 },
    logTitle: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    logMeta: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    logTrail: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
    logAmountBlock: { alignItems: 'flex-end' },
    logAmount: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
    },
    logState: {
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
    },
  });
