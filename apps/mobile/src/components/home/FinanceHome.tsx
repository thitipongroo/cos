// ── FINANCE — the approval queue, the cash position, and the forecast ─────────
//
// Implements mockup/mobile/09_finance/01_home/01_fn_dashboard.
//
// REBUILT 2026-09-08 for that drawing. What was here was two count tiles — pending payments and
// overdue invoices — and nothing else; the drawing adds the money the approvals are worth, two cash
// tiles, a forecast card and the priority queue itself.
//
// THE OVERDUE-INVOICE TILE READ `0` FOR EVERY TENANT UNTIL 2026-09-06, and it looked like data.
// `GET /analytics/executive` filters `project_id IN ({projectIds})`; its controller turns a missing
// `projectIds` query parameter into an empty array, so the endpoint answers `200` with `[]` and
// `reduce` over no rows is zero. Not an em dash, not an error — a confident, wrong number on a
// finance dashboard. The rule lives once now, in `api/analytics.ts`, which has no parameterless
// form to call. That tile is gone from this screen with the rewrite, but the note stays: it is the
// reason nothing here renders a zero it did not receive.
//
// WHAT IS REAL.
//   Total Pending Approvals   Σ `amount` over `GET /finance/payments?status=PENDING`, in decimal.js.
//                             FILTERED BY THE SERVER: the endpoint pages at 20 and this tenant holds
//                             more than that, so summing the page would be summing a page.
//   Priority queue            those same rows, worst-dated first, each with the vendor and invoice
//                             number joined in by the backend change of 2026-09-08.
//   Approve                   `PATCH /finance/payments/:id/approve`, behind a biometric prompt.
//   Cash Flow                 the final `cumulative_net` of `GET /finance/cashflow-forecast/:id` —
//                             the closing position of the 13-week horizon.
//   "Healthy" / the risk word `gradeCashflowRisk`, the SAME function the nightly alert sweep grades
//                             with. It moved to `@cos/financial` in this change so the phone, the
//                             screen and the alert cannot disagree about when the money runs out.
//   The forecast card         `projectedShortfall` and `firstShortfallWeek` over the same periods.
//
// THE FORECAST IS NOT AN AI OUTPUT, and this screen must not dress it as one. The drawing puts
// `{auto_awesome}` and "CONFIDENCE: 92%" on that card. `GET /finance/cashflow-forecast/:projectId`
// is a deterministic direct-method sum of scheduled inflows and outflows — there is no model — so a
// confidence chip would be claiming one that never ran, which is the single thing ADR-099's third
// amendment still refuses. The card keeps the drawing's shape and drops the two marks that assert a
// model.
//
// WHAT IS DRAWN (lib/mockupFigures.ts, ADR-099): the "+12% vs last week" delta and the Burn Rate
// tile. COMING SOON on both — see the register for what each needs.
//
// WHAT COVERS EVERY PROJECT, AND WHAT DELIBERATELY DOES NOT (PO decisions 2026-09-08).
//
// THE MONEY AND THE QUEUE ARE THE WHOLE PORTFOLIO. The pending total, its delta and the priority
// queue read `GET /finance/payments?status=PENDING` with NO `project_id`, so the endpoint's project
// predicate is null and matches every one. Verified against the seeded tenant: ฿9,822,524.00 is the
// sum of five projects' pending payments, to the baht. That is why `<ProjectContextBar />` was
// removed from this screen — a bar announcing ONE active project sat above figures covering them all.
//
// THE FORECAST IS ONE PROJECT, ON PURPOSE. It is not a portfolio position that happens to be scoped
// too narrowly; it is ADVICE, and advice has to be about somewhere — "delay the secondary material
// orders" means nothing addressed to five sites at once. A portfolio sum was built on 2026-09-08 and
// removed the same day for that reason (`sumCashflow` went with it). The card names its project in
// its own footer, which is where a reader finds out which one.
//
// Switching project stays where it belongs, on the screens that ARE about one project: Payments and
// Budget both keep `<ProjectContextBar />`, and `<SelectProjectSheet />` still asks once on launch.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import {
  Decimal,
  firstShortfallWeek,
  gradeCashflowRisk,
  projectedShortfall,
  sumDecimals,
  toDecimal,
  type CashflowPeriod,
} from '@cos/financial';
import { getCashflowForecast, listPayments, type PaymentRow } from '../../api/finance';
import { invoiceIndex, type VendorInvoice } from '../../api/procurement';
import { useProjectStore } from '../../store/projectStore';
import { compactMoneyLabel, spacedMoney } from '../../lib/compactMoney';
import { countSettled } from '../../lib/loadingState';
import { APPROVALS_TREND, FINANCE_BURN_RATE, FORECAST_CONFIDENCE } from '../../lib/mockupFigures';
import { useT } from '../../i18n';
import type { TranslateFn } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette, type Palette } from '../../theme/usePalette';
import { Screen, KpiRegion } from './HomeKit';

/** How many of the pending payments the priority queue lists. The drawing shows two. */
const PRIORITY_ROWS = 3;

export default function FinanceHome(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  const router = useRouter();
  const active = useProjectStore((s) => s.active);

  const [pending, setPending] = useState<PaymentRow[] | null>(null);
  const [periods, setPeriods] = useState<CashflowPeriod[] | null>(null);
  const [loading, setLoading] = useState(true);
  // Rule 40 — TWO independent steps. The payment queue is tenant-wide and the forecast is per
  // project; neither waits on the other, so `loadProgress` has two to count and the bar reports a
  // real percentage rather than sitting at 0 and jumping to 100.
  const [settled, setSettled] = useState(0);
  // Three since 2026-09-08: the queue, the forecast, and the vendor-invoice index the queue needs
  // to name anybody. A payment carries `invoice_id` and finance may not join `procurement.*` to
  // resolve it (master PHASE 7 line 3216), so the name comes from procurement's own endpoint.
  const LOAD_STEPS = 3;
  const [invoices, setInvoices] = useState<Map<string, VendorInvoice>>(new Map());

  const projectId = active?.projectId ?? '';

  useEffect(() => {
    let cancelled = false;
    const step = <T,>(promise: Promise<T>): Promise<T> =>
      countSettled(promise, () => {
        if (!cancelled) setSettled((n) => n + 1);
      });

    // `status: 'PENDING'` goes to the SERVER. The endpoint pages at 20 and this tenant holds more,
    // so filtering the page this screen received would be a total of one page.
    const payments = step(listPayments('PENDING'))
      .then((rows) => {
        if (!cancelled) setPending(rows);
      })
      .catch(() => {
        /* offline — the tiles keep their em dashes rather than claiming nothing is pending */
      });

    // `invoiceIndex` resolves rather than rejects when it is offline: a queue that cannot name
    // its vendors is still a queue, and an em dash beside a real amount is the honest rendering.
    const names = step(invoiceIndex()).then((index) => {
      if (!cancelled) setInvoices(index);
    });

    const forecast = step(
      projectId === '' ? Promise.resolve<CashflowPeriod[]>([]) : getCashflowForecast(projectId),
    )
      .then((rows) => {
        if (!cancelled) setPeriods(rows);
      })
      .catch(() => {
        /* offline — the forecast card says it has nothing rather than showing a stale position */
      });

    void Promise.allSettled([payments, names, forecast]).then(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  /** Σ of what is waiting for approval. Null until the queue answers — never a zero it did not get. */
  const pendingTotal = useMemo(
    () => (pending === null ? null : sumDecimals(pending.map((row) => toDecimal(row.amount)))),
    [pending],
  );

  /** The closing position of the 13-week horizon — the last bucket's cumulative net. */
  const closingPosition = useMemo(() => {
    if (periods === null || periods.length === 0) return null;
    return toDecimal(periods[periods.length - 1]?.cumulative_net ?? '0');
  }, [periods]);

  const risk = periods === null ? null : gradeCashflowRisk(periods);
  const shortfall = periods === null ? null : projectedShortfall(periods);
  const shortfallWeek = periods === null ? null : firstShortfallWeek(periods);

  // `signAfterSymbol` puts the minus behind the ฿ — `฿ -712,524.00` (PO decision 2026-09-08).
  // These figures sit in a column where every other one starts with the symbol.
  const money = (value: Decimal | null): string =>
    value === null
      ? '—'
      : compactMoneyLabel(value, 'THB', t, { maxScale: 'million', signAfterSymbol: true });

  /**
   * The hero figure, in full — `฿ 9,820,000.00`, not `฿ 9.82 M` (PO decision 2026-09-08).
   *
   * The two tiles below it are half-width and keep the compact form; this card is the width of the
   * screen and has room for every digit, and this is the one figure on the screen someone reads
   * before deciding what to approve. `spacedMoney` is `formatMoney` with the project's gap after
   * the symbol — the same full amount the payment queue and the detail print, so a reader comparing
   * the two sees one number written one way.
   */
  const fullMoney = (value: Decimal | null): string =>
    value === null ? '—' : spacedMoney(value, 'THB');

  const priority = (pending ?? [])
    // Worst-dated first: the drawing's queue reads "Due Today", then "Tomorrow".
    .slice()
    .sort((a, b) => a.payment_date.localeCompare(b.payment_date))
    .slice(0, PRIORITY_ROWS);

  const soon = useCallback(
    (labelKey: string) => {
      Alert.alert(t(labelKey), t('more.comingSoon'));
    },
    [t],
  );

  return (
    <Screen testID="home-screen" scroll>
      <KpiRegion loading={loading} settled={settled} steps={LOAD_STEPS}>
        {/* ── The main KPI: what is waiting for this person ──────────────────────────────── */}
        {/* THE WHOLE CARD IS THE CONTROL, as the drawing has it (`role="button"` on the tile).
            A filled REVIEW QUEUE button stood here until 2026-09-08 and was never in the drawing —
            what the drawing puts at the bottom-right is a small trailing affordance, and its label
            is `hidden md:inline`, so on a phone it is the arrow alone. The label is kept beside it
            because a screen reader needs the words and 44pt needs the width. */}
        <Pressable
          testID="kpi-pending-approvals"
          accessibilityRole="button"
          accessibilityLabel={t('home.finance.reviewQueue')}
          onPress={() => router.push('/payments')}
          style={[styles.card, styles.hero]}
        >
          <View style={styles.heroHead}>
            <Text style={styles.eyebrow}>{t('home.finance.pendingApprovals')}</Text>
            <View style={styles.headTrail}>
              <View style={styles.heroPlate}>
                <MaterialIcons name="pending-actions" size={20} color={p.accent} />
              </View>
              <MaterialIcons name="chevron-right" size={18} color={p.muted} />
            </View>
          </View>
          <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
            {fullMoney(pendingTotal)}
          </Text>
          {/* DRAWN — there is no historical series of approval totals. See the register.
              The "Review queue" affordance that stood beside it went on 2026-09-08 (PO): the card
              is the control and the plated chevron above already says so, so a second label for the
              same tap was one mark too many. The words survive as this card's accessibility label. */}
          <View style={styles.deltaRow}>
            <MaterialIcons name="trending-up" size={14} color={p.success} />
            <Text style={styles.delta}>
              {t('home.finance.vsLastWeek', { value: APPROVALS_TREND.value })}
            </Text>
          </View>
        </Pressable>

        {/* ── Two cash tiles ─────────────────────────────────────────────────────────────── */}
        <View style={styles.tileRow}>
          <View testID="kpi-cash-flow" style={[styles.card, styles.tile]}>
            <View style={styles.tileHead}>
              <Text style={styles.eyebrow}>{t('home.finance.cashFlow')}</Text>
              <MaterialIcons name="chevron-right" size={16} color={p.muted} />
            </View>
            <Text style={styles.tileValue}>{money(closingPosition)}</Text>
            {/* `gradeCashflowRisk` returns null when the money never runs out inside the horizon,
                which is what the drawing's "Healthy" means. Any other value is a level, and it is
                the SAME level the nightly alert raises — one function, one answer.
                The DOT before the word is the drawing's, and it carries the same colour. */}
            <View testID="finance-cash-risk" style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: risk === null ? p.success : p.warning },
                ]}
              />
              <Text style={[styles.tileNote, { color: risk === null ? p.success : p.warning }]}>
                {periods === null
                  ? '—'
                  : risk === null
                    ? t('home.finance.healthy')
                    : t(`home.finance.risk.${risk}`)}
              </Text>
            </View>
          </View>

          {/* DRAWN — no formula for a monthly burn rate is specified anywhere, and the drawing's
              bar has nothing behind it either. See the register. The period is part of the LABEL
              here, as the drawing writes it ("Burn Rate / MO"), not a line under the figure. */}
          <View testID="kpi-burn-rate" style={[styles.card, styles.tile]}>
            <View style={styles.tileHead}>
              <Text style={styles.eyebrow} numberOfLines={1}>
                {t('home.finance.burnRate')} / {t('home.finance.perMonthShort')}
              </Text>
              <MaterialIcons name="chevron-right" size={16} color={p.muted} />
            </View>
            <Text style={styles.tileValue}>{FINANCE_BURN_RATE.value.text}</Text>
            <View style={styles.track}>
              <View style={[styles.trackFill, { width: `${FINANCE_BURN_RATE.value.percent}%` }]} />
            </View>
          </View>
        </View>

        {/* ── The forecast. Real, deterministic, and NOT labelled as a model — see the header. ── */}
        <View testID="finance-forecast" style={[styles.card, styles.forecast]}>
          <View style={styles.forecastHead}>
            <View style={styles.forecastTitleRow}>
              <MaterialIcons name="insights" size={18} color={p.accent} />
              <Text style={styles.forecastTitle}>{t('home.finance.forecastTitle')}</Text>
            </View>
            <View style={styles.headTrail}>
              {/* DRAWN, and it is the entry ADR-099 is least comfortable with — this card reads a
                  DETERMINISTIC forecast, so a confidence claims a model that never ran. Drawn on
                  the product owner's instruction of 2026-09-08 and registered; see the register and
                  ADR-099's fourth amendment. */}
              <View style={styles.confChip}>
                <Text style={styles.confText}>
                  {t('home.finance.confidence', { percent: FORECAST_CONFIDENCE.value.home })}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={18} color={p.accent} />
            </View>
          </View>
          <Text style={styles.body}>
            {periods === null || periods.length === 0
              ? t('home.finance.forecastNone')
              : shortfallWeek === null
                ? t('home.finance.forecastClear')
                : t('home.finance.forecastShortfall', {
                    amount: shortfall === null ? '—' : spacedMoney(shortfall),
                    // ZERO-BASED in the data, one-based for a reader — the register of that
                    // conversion is `firstShortfallWeek`'s own contract.
                    week: shortfallWeek + 1,
                  })}
          </Text>
          {/* The drawing's footer: a rule, then the source on the left and the model link on the
              right. The SOURCE TEXT stays the project's name rather than the drawing's "ERP &
              Milestone data" — naming systems this platform does not integrate with is the one
              carve-out ADR-098's second amendment and ADR-099 both keep. */}
          <View style={styles.forecastFoot}>
            <View style={styles.sourceRow}>
              <MaterialIcons name="storage" size={13} color={p.muted} />
              <Text style={styles.source} numberOfLines={1}>
                {t('insight.source', { project: active?.projectName ?? '—' })}
              </Text>
            </View>
            {/* Drawn — there is no model to open. It says so on tap.
                A CHEVRON ALONE (PO 2026-09-08): the words and a long project name were competing
                for the same row and ran together. The label survives on the control for a screen
                reader, which is where it was doing the real work anyway. */}
            <Pressable
              testID="finance-view-model"
              accessibilityRole="button"
              accessibilityLabel={t('home.finance.viewModel')}
              onPress={() => soon('home.finance.viewModel')}
              style={styles.modelLink}
            >
              <MaterialIcons name="chevron-right" size={18} color={p.accent} />
            </Pressable>
          </View>
        </View>

        {/* ── Priority approval queue ────────────────────────────────────────────────────── */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionLabel} accessibilityRole="header">
            {t('home.finance.priorityQueue')}
          </Text>
          <Pressable
            testID="finance-view-all"
            accessibilityRole="button"
            accessibilityLabel={t('home.finance.viewAll')}
            onPress={() => router.push('/payments')}
            style={styles.viewAll}
          >
            <Text style={styles.viewAllText}>{t('home.finance.viewAll')}</Text>
            <MaterialIcons name="arrow-forward" size={14} color={p.accent} />
          </Pressable>
        </View>

        {priority.length === 0 ? (
          <View testID="finance-queue-empty" style={styles.card}>
            <Text style={styles.body}>
              {pending === null ? t('home.finance.queueUnknown') : t('home.finance.queueEmpty')}
            </Text>
          </View>
        ) : (
          priority.map((row) => (
            <PaymentQueueRow
              key={row.payment_id}
              row={row}
              invoice={invoices.get(row.invoice_id) ?? null}
              styles={styles}
              palette={p}
              t={t}
              onOpen={() => router.push('/payments')}
              onApprove={() => soon('home.finance.approve')}
            />
          ))
        )}
      </KpiRegion>
    </Screen>
  );
}

/**
 * One payment awaiting approval.
 *
 * The vendor and the invoice number come from `GET /procurement/vendor-invoices`, matched on
 * `invoice_id`; both are absent when that request failed or the invoice is off the page this screen
 * fetched. A payment nobody can name still belongs in this queue and drops an em dash rather than
 * dropping out.
 */
function PaymentQueueRow({
  row,
  invoice,
  styles,
  palette,
  t,
  onOpen,
  onApprove,
}: {
  row: PaymentRow;
  invoice: VendorInvoice | null;
  styles: ReturnType<typeof makeStyles>;
  palette: Palette;
  t: TranslateFn;
  onOpen: () => void;
  onApprove: () => void;
}): React.JSX.Element {
  return (
    <View testID={`finance-queue-${row.payment_id}`} style={[styles.card, styles.queueRow]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={invoice?.vendor_name ?? row.payment_id}
        onPress={onOpen}
        style={styles.queueMain}
      >
        <View style={styles.queueText}>
          <Text style={styles.queueVendor} numberOfLines={1}>
            {invoice?.vendor_name ?? '—'}
          </Text>
          <Text style={styles.queueMeta} numberOfLines={1}>
            {`${invoice?.invoice_number ?? '—'} • ${row.payment_date}`}
          </Text>
        </View>
        <Text style={styles.queueAmount}>{spacedMoney(row.amount, row.currency_code)}</Text>
        <MaterialIcons
          name="chevron-right"
          size={18}
          color={palette.muted}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </Pressable>
      <View style={styles.queueActions}>
        <Pressable
          testID={`finance-queue-${row.payment_id}-review`}
          accessibilityRole="button"
          accessibilityLabel={t('home.finance.review')}
          onPress={onOpen}
          style={styles.queueButton}
        >
          <Text style={styles.queueButtonText}>{t('home.finance.review')}</Text>
        </Pressable>
        {/* APPROVING FROM HERE IS COMING SOON. The endpoint exists and the Payments screen calls it,
            but the drawing's biometric confirmation belongs with the detail a reviewer approves
            against — approving from a two-line summary is a write this role should not make blind.
            The control is drawn because the drawing draws it, and it opens the queue instead. */}
        <Pressable
          testID={`finance-queue-${row.payment_id}-approve`}
          accessibilityRole="button"
          accessibilityLabel={t('home.finance.approve')}
          onPress={onApprove}
          style={[styles.queueButton, styles.queueButtonPrimary]}
        >
          <Text style={[styles.queueButtonText, styles.queueButtonTextPrimary]}>
            {t('home.finance.approve')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: p.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },

    hero: { gap: spacing.xs },
    heroHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    headTrail: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    heroFoot: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    heroLink: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1 },
    heroLinkText: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: 10,
      letterSpacing: 0.4,
    },
    tileHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs / 2,
    },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
    // 999 is the documented capsule marker (§32.7) — a status dot is a circle, not a step on the
    // radius scale.
    statusDot: { width: 8, height: 8, borderRadius: 999 },
    track: {
      height: 8,
      borderRadius: radius.sm,
      backgroundColor: p.surfaceBright,
      overflow: 'hidden',
      marginTop: spacing.xs,
    },
    trackFill: { height: 8, borderRadius: radius.sm, backgroundColor: p.primary },
    forecastTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    confChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: `${p.accent}66`,
    },
    confText: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      textTransform: 'uppercase',
    },
    forecastFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: `${p.accent}33`,
      paddingTop: spacing.xs,
      marginTop: spacing.xs / 2,
    },
    sourceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2, flexShrink: 1 },
    modelLink: {
      flexDirection: 'row',
      alignItems: 'center',
      // The floor the two halves of this row may never cross, whatever the project is called.
      marginLeft: spacing.sm,
      flexShrink: 0,
    },
    heroPlate: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surfaceBright,
    },
    heroValue: { color: p.text, fontFamily: fontFamily.bold, fontSize: typography.hero.fontSize },
    deltaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
    delta: { color: p.success, fontFamily: fontFamily.medium, fontSize: typography.label.fontSize },
    heroAction: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      minHeight: touchTarget.secondaryButton,
      marginTop: spacing.xs,
      borderRadius: radius.md,
      backgroundColor: p.primary,
    },
    heroActionText: {
      color: p.onPrimary,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },

    tileRow: { flexDirection: 'row', gap: spacing.sm },
    tile: { flex: 1, gap: 2 },
    tileValue: { color: p.text, fontFamily: fontFamily.bold, fontSize: typography.title.fontSize },
    tileNote: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },

    forecast: { borderColor: p.accent, gap: spacing.xs },
    forecastHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs,
    },
    forecastTitle: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },

    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xs,
    },
    sectionLabel: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    viewAll: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      minHeight: touchTarget.iconButton,
    },
    viewAllText: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },

    queueRow: { gap: spacing.xs },
    queueMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    queueText: { flex: 1, gap: 2 },
    queueVendor: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
    },
    queueMeta: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    queueAmount: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    queueActions: { flexDirection: 'row', gap: spacing.xs },
    queueButton: {
      flex: 1,
      minHeight: touchTarget.secondaryButton,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
    },
    queueButtonPrimary: { borderColor: `${p.accent}66`, backgroundColor: `${p.accent}1A` },
    queueButtonText: {
      color: p.text,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    queueButtonTextPrimary: { color: p.accent },

    eyebrow: {
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    body: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    source: {
      // WITHOUT `flexShrink` THE TEXT DOES NOT SHRINK, it overflows: a <Text> in a row keeps its
      // measured width unless told otherwise, so a long project name ran straight into the control
      // beside it and `numberOfLines` clipped at the screen edge rather than at the gap.
      flexShrink: 1,
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
  });
