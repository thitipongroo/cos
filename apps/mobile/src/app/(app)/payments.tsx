// Payments screen — the FINANCE approval queue.
// Implements mockup/mobile/09_finance/02_payments/01_fn_payment.
//
// REBUILT 2026-09-08 for that drawing. What was here was a list of payment references with an
// expand-in-place detail, in the STATIC LIGHT palette — one of the last screens that stayed white on
// the app's default dark theme. The drawing adds the count header, the vendor cards, an analysis
// module, and a full-screen detail with the approval behind a biometric prompt.
//
// WHAT IS REAL.
//   The queue          `GET /finance/payments?status=PENDING`. FILTERED BY THE SERVER: the endpoint
//                      pages at 20 and a tenant holds more, so "8 items awaiting your approval"
//                      counted over the page this screen received would be a count of the page —
//                      the defect `finance.repository.ts` records against its own query.
//   Vendor + invoice   `GET /procurement/vendor-invoices`, matched to a payment on `invoice_id`.
//                      NOT joined into the payments endpoint: finance may not query `procurement.*`
//                      (master PHASE 7 line 3216), and a join written there on 2026-09-08 was
//                      reverted the same day when `tests/architecture/connectivity.spec.ts` and
//                      `tests/conformance/finance/05-constraints.spec.ts` both caught it. One
//                      request for the page, never one per row. A payment whose invoice is not in
//                      the index still belongs in an approval queue and shows an em dash.
//   Amount, due date   the payment's own columns.
//   Approve            `PATCH /finance/payments/:id/approve`.
//   The analysis card  `GET /finance/cashflow-forecast/:projectId` for the active project, read by
//                      the same `projectedShortfall` / `gradeCashflowRisk` the nightly alert grades
//                      with. Outflows are what a forecast is built from, so it is the one real thing
//                      this platform can say about a queue of payouts.
//
// NO PROJECT BAR (PO decision 2026-09-08). The queue is the screen and the queue is the whole
// tenant: `listPayments('PENDING')` sends no `project_id`, so the endpoint's project predicate is
// null and matches every one — measured against the seeded tenant, ten pending rows across five
// projects. A bar announcing ONE active project above them claimed a scope this screen does not have.
//
// THE ANALYSIS MODULE IS STILL ONE PROJECT, and that is the same deliberate split the Home dashboard
// carries. It is ADVICE, not a position: "delay the secondary material orders" means nothing
// addressed to five sites at once, so it names its project in its own footer. Switching project
// lives on Budget, which IS a screen about one project, and `<SelectProjectSheet />` asks once on
// launch.
//
// APPROVING IS ONLINE-ONLY, AND THAT IS ENFORCED RATHER THAN ASSERTED. §17.4 makes financial
// entities online-required, `SYNC_PUSHABLE_ENTITY_TYPES` has no `payment`, and `mutate()` therefore
// THROWS on a network error instead of queueing — it does not promise a replay `/sync/push` would
// reject. The call stays `mutate` for exactly that guard.
//
// THE BIOMETRIC PROMPT IS A CONFIRMATION, NOT A SECURITY CONTROL, and the difference is written
// down because the drawing does not make it (PO decision 2026-09-08). `PATCH
// /finance/payments/:id/approve` carries `@Roles` + `@RequirePermissions('finance:approve')` + a
// feature flag and NO step-up guard, so nothing server-side verifies that a person was in front of
// the handset. Server-side step-up is COMING SOON. What this prompt does is make an irreversible
// money action deliberate, which is worth having on its own terms — so:
//   'unlocked'     approve
//   'cancelled'    do NOT approve — the user backed out of their own confirmation
//   'unavailable'  approve anyway. A device with nothing enrolled would otherwise lock a finance
//                  officer out of the one action the role exists for, and since the server does not
//                  check, refusing here would buy no security at all — only a broken screen.
//
// WHAT IS DRAWN (lib/mockupFigures.ts, ADR-099): the detail's "Service Period" and its "Verified
// Subcontractor" chip — neither `finance.payments` nor `procurement.vendors` carries either — and
// the "Confidence: 94%" the drawing puts on the analysis module, which is NOT drawn at all: that
// module reads a deterministic forecast, and a confidence would claim a model that never ran, which
// is the one thing ADR-099's third amendment still refuses.
//
// The `add` FAB and "Dispute" are drawn and say so on tap: raising a payout has no mobile flow, and
// disputing a PAYMENT has no endpoint (disputing an INVOICE does — that is the Invoices screen).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl, StyleSheet, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  firstShortfallWeek,
  gradeCashflowRisk,
  projectedShortfall,
  type CashflowPeriod,
} from '@cos/financial';
import { mutate } from '../../api/client';
import { getCashflowForecast, listPayments, type PaymentRow } from '../../api/finance';
import { invoiceIndex, type VendorInvoice } from '../../api/procurement';
import { getMyProjects } from '../../api/projects';
import { authenticate } from '../../lib/biometric';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { AiCardFooter } from '../../components/AiCardFooter';
import { useProjectStore } from '../../store/projectStore';
import { spacedMoney } from '../../lib/compactMoney';
import { FORECAST_CONFIDENCE, PAYMENT_DETAIL_EXTRAS } from '../../lib/mockupFigures';
import { useT, useI18n } from '../../i18n';
import { useComingSoon } from '../../components/useComingSoon';
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

export default function PaymentsScreen(): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const p = usePalette();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(p), [p]);
  const active = useProjectStore((s) => s.active);

  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [invoices, setInvoices] = useState<Map<string, VendorInvoice>>(new Map());
  // `project_id` → its CODE. A payment carries a UUID and the drawing's card wants "Project P-204";
  // this is the one request that turns one into the other.
  const [projects, setProjects] = useState<Map<string, string>>(new Map());
  const [periods, setPeriods] = useState<CashflowPeriod[] | null>(null);
  const [selected, setSelected] = useState<PaymentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const projectId = active?.projectId ?? '';

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      // Both together: the queue is the screen, and the index is what lets it name anybody.
      // `invoiceIndex` never throws — an unnameable queue is still a queue.
      const [rows, index, mine] = await Promise.all([
        listPayments('PENDING'),
        invoiceIndex(),
        // Never fails the queue: a payment nobody can place is still a payment to approve.
        getMyProjects().catch(() => []),
      ]);
      setPayments(rows);
      setInvoices(index);
      setProjects(new Map(mine.map((project) => [project.project_id, project.project_code])));
    } catch {
      /* offline — the cached list is what the screen shows */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    if (projectId === '') {
      setPeriods(null);
      return;
    }
    getCashflowForecast(projectId)
      .then((rows) => {
        if (!cancelled) setPeriods(rows);
      })
      .catch(() => {
        /* offline — the module says it has nothing rather than showing a stale position */
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  /**
   * Approve, behind a confirmation.
   *
   * `busy` guards a double tap: two OS prompts stack on Android and the second is dismissed by the
   * first, which reads as the confirmation having failed — the same guard `<BiometricLock />` keeps
   * for the same reason.
   */
  const approve = useCallback(
    async (row: PaymentRow): Promise<void> => {
      if (busy) return;
      setBusy(true);
      try {
        const outcome = await authenticate(t('finance.payments.confirmPrompt'));
        // 'cancelled' is the user backing out of their own confirmation. 'unavailable' proceeds —
        // see the header for why refusing there would buy nothing.
        if (outcome === 'cancelled') return;
        await mutate(
          'PATCH',
          `/finance/payments/${row.payment_id}/approve`,
          {},
          'payment',
          row.payment_id,
        );
        setPayments((prev) => prev.filter((item) => item.payment_id !== row.payment_id));
        setSelected(null);
      } catch {
        // §17.4 keeps financial writes online-only, so `mutate` threw rather than queueing a replay
        // `/sync/push` would reject. Say so; do not drop the row from a queue it is still in.
        Alert.alert(t('finance.payments.approve'), t('finance.payments.approveFailed'));
      } finally {
        setBusy(false);
      }
    },
    [busy, t],
  );

  const soon = useComingSoon();

  const renderItem = useCallback(
    ({ item }: { item: PaymentRow }) => (
      <PaymentCard
        row={item}
        invoice={invoices.get(item.invoice_id) ?? null}
        projectCode={projects.get(item.project_id) ?? null}
        styles={styles}
        palette={p}
        t={t}
        locale={locale}
        onOpen={setSelected}
      />
    ),
    [invoices, projects, styles, p, t, locale],
  );

  if (selected !== null) {
    return (
      <PaymentDetail
        row={selected}
        invoice={invoices.get(selected.invoice_id) ?? null}
        styles={styles}
        palette={p}
        t={t}
        locale={locale}
        busy={busy}
        projectName={active?.projectName ?? null}
        onBack={() => setSelected(null)}
        onApprove={() => void approve(selected)}
        onDispute={() => soon('finance.payments.dispute')}
      />
    );
  }

  return (
    <View testID="payments-screen" style={styles.page}>
      {/* The drawing's header: PENDING at hero size with the count under it in label type, and the
          MFA chip that says what pressing Approve will do. The count is the LIST's length and the
          list is the server's PENDING filter, so it counts the tenant rather than a page. */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} accessibilityRole="header">
            {t('finance.payments.pending')}
          </Text>
          <Text style={styles.headerCount}>
            {t('finance.payments.awaiting', { count: payments.length })}
          </Text>
        </View>
        <View style={styles.mfaChip}>
          <MaterialIcons name="security" size={14} color={p.accent} />
          <Text style={styles.mfaText}>{t('finance.payments.mfaActive')}</Text>
          <MaterialIcons name="chevron-right" size={14} color={p.accent} />
        </View>
      </View>

      <LoadingBoundary
        loading={loading && payments.length === 0}
        variant="list"
        theme={isDark ? 'dark' : 'light'}
        style={styles.fill}
      >
        <FlatList
          testID="payments-list"
          data={payments}
          keyExtractor={(row, i) => row.payment_id || String(i)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={
            <Text testID="payments-empty" style={styles.empty}>
              {t('finance.payments.empty')}
            </Text>
          }
          ListHeaderComponent={
            <AnalysisModule
              periods={periods}
              styles={styles}
              palette={p}
              t={t}
              projectName={active?.projectName ?? null}
            />
          }
          renderItem={renderItem}
        />
      </LoadingBoundary>

      {/* Drawn, and it says so on tap — raising a payout has no mobile flow. */}
      <Pressable
        testID="payments-add"
        accessibilityRole="button"
        accessibilityLabel={t('finance.payments.raise')}
        onPress={() => soon('finance.payments.raise')}
        style={styles.fab}
      >
        <MaterialIcons name="add" size={26} color={p.onPrimary} />
      </Pressable>
    </View>
  );
}

/** One payout awaiting approval — the drawing's card. */
function PaymentCard({
  row,
  invoice,
  projectCode,
  styles,
  palette,
  t,
  locale,
  onOpen,
}: {
  row: PaymentRow;
  invoice: VendorInvoice | null;
  projectCode: string | null;
  styles: ReturnType<typeof makeStyles>;
  palette: Palette;
  t: TranslateFn;
  locale: string;
  onOpen: (row: PaymentRow) => void;
}): React.JSX.Element {
  const due = dueTone(row.payment_date, palette);
  return (
    <Pressable
      testID={`payment-item-${row.payment_id}`}
      accessibilityRole="button"
      accessibilityLabel={invoice?.vendor_name ?? row.payment_id}
      onPress={() => onOpen(row)}
      style={[styles.card, { borderLeftColor: due.colour }]}
    >
      {/* Top row, two columns, as the drawing has it: the project and who is being paid on the
          left, the amount and how urgent it is on the right. */}
      <View style={styles.cardHead}>
        <View style={styles.cardText}>
          {/* The project this payment belongs to, by its CODE. Real: `project_id` is a UUID, and
              `getMyProjects()` is the one request that turns it into something a person can read.
              An em dash where the project is not in that list — a payment on a project this role is
              not a member of still belongs in the tenant's queue. */}
          <Text style={styles.cardProject} numberOfLines={1}>
            {projectCode ?? '—'}
          </Text>
          <Text style={styles.cardVendor} numberOfLines={1}>
            {invoice?.vendor_name ?? '—'}
          </Text>
        </View>
        <View style={styles.cardFigures}>
          <Text style={styles.cardAmount} numberOfLines={1}>
            {spacedMoney(row.amount, row.currency_code)}
          </Text>
          {/* A filled chip, not a bare line — the drawing tints it by urgency. */}
          <View style={[styles.dueChip, { backgroundColor: `${due.colour}1F` }]}>
            <Text style={[styles.dueChipText, { color: due.colour }]} numberOfLines={1}>
              {t(due.key, { date: formatDay(row.payment_date, locale) })}
            </Text>
          </View>
        </View>
      </View>

      {/* The drawing's footer: a rule, then what this payment is linked to on the left and the
          open affordance on the right. The drawing's chip reads "Foundations & Structure" — a scope
          name no column carries — so it holds the INVOICE it is paying against, which is what the
          `link` glyph means here and is real. */}
      <View style={styles.cardFoot}>
        <View style={styles.linkChip}>
          <MaterialIcons name="link" size={13} color={palette.muted} />
          <Text style={styles.linkChipText} numberOfLines={1}>
            {invoice?.invoice_number ?? '—'}
          </Text>
        </View>
        <View style={styles.openPlate} accessibilityElementsHidden importantForAccessibility="no">
          <MaterialIcons name="arrow-forward" size={16} color={palette.accent} />
        </View>
      </View>
    </Pressable>
  );
}

/**
 * The drawing's analysis module.
 *
 * IT IS THE CASH FLOW FORECAST, not a pricing analysis. The drawing's copy — "Detected 12% increase
 * in concrete pricing relative to site budget" — has no source in this platform; the forecast does,
 * it is deterministic, and outflows are exactly what a queue of payouts feeds into. NO CONFIDENCE
 * CHIP: there is no model here, and a percentage beside this text would claim one.
 */
function AnalysisModule({
  periods,
  styles,
  palette,
  t,
  projectName,
}: {
  periods: CashflowPeriod[] | null;
  styles: ReturnType<typeof makeStyles>;
  palette: Palette;
  t: TranslateFn;
  projectName: string | null;
}): React.JSX.Element {
  const week = periods === null ? null : firstShortfallWeek(periods);
  const risk = periods === null ? null : gradeCashflowRisk(periods);
  const shortfall = periods === null ? null : projectedShortfall(periods);
  return (
    <View testID="payments-analysis" style={[styles.card, styles.analysis]}>
      <View style={styles.analysisHead}>
        <View style={styles.analysisTitleRow}>
          <MaterialIcons name="bolt" size={16} color={palette.accent} />
          <Text style={styles.analysisTitle}>{t('finance.payments.analysis')}</Text>
        </View>
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
        <Text testID="payments-analysis-risk" style={[styles.cardDue, { color: palette.warning }]}>
          {t(`home.finance.risk.${risk}`)}
        </Text>
      )}
      {/* THE PROJECT'S STANDARD AI-CARD FOOT (spec §32.7, PO decision 2026-09-08): the confidence
          and the source on one line, in that order. The confidence came DOWN from a chip in the
          header opposite the title — the two halves of one claim were at opposite ends of the card.
          It is still DRAWN: this module reads a deterministic forecast, so the number claims a model
          that never ran (ADR-099's fourth amendment). The SOURCE names the PROJECT rather than the
          drawing's "Integrated ERP & Market Benchmarks"; that carve-out now lives in the
          component. */}
      <AiCardFooter
        testID="payments-analysis-foot"
        percent={FORECAST_CONFIDENCE.value.payments}
        source={projectName ?? '—'}
        confLabel={t('insight.confShort')}
        sourceLabel={t('insight.sourceShort')}
        palette={palette}
      />
    </View>
  );
}

/** The drawing's full-screen detail, with the approval behind a confirmation. */
function PaymentDetail({
  row,
  invoice,
  styles,
  palette,
  t,
  locale,
  busy,
  projectName,
  onBack,
  onApprove,
  onDispute,
}: {
  row: PaymentRow;
  invoice: VendorInvoice | null;
  styles: ReturnType<typeof makeStyles>;
  palette: Palette;
  t: TranslateFn;
  locale: string;
  busy: boolean;
  projectName: string | null;
  onBack: () => void;
  onApprove: () => void;
  onDispute: () => void;
}): React.JSX.Element {
  const rows: Array<[string, string]> = [
    [t('finance.payments.vendor'), invoice?.vendor_name ?? '—'],
    [t('finance.payments.amount'), spacedMoney(row.amount, row.currency_code)],
    [t('finance.payments.project'), projectName ?? row.project_id],
    [t('finance.payments.invoiceRef'), invoice?.invoice_number ?? '—'],
    // DRAWN — no column carries a service period. See the register.
    [t('finance.payments.servicePeriod'), PAYMENT_DETAIL_EXTRAS.value.servicePeriod],
    [t('finance.payments.date'), formatDay(row.payment_date, locale)],
  ];
  return (
    <View testID="payment-detail" style={styles.page}>
      <Pressable
        testID="payment-detail-back"
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        onPress={onBack}
        style={styles.backRow}
      >
        {/* The drawing's `w-12 h-12 rounded bg-surface-container-high` — a square tile, not a bare
            glyph. `plateRadius` is §32.7's rule for a square icon plate (side / 4), which is what
            keeps the corner in proportion as the tile changes size. */}
        <View style={styles.backPlate}>
          <MaterialIcons name="arrow-back" size={22} color={palette.text} />
        </View>
        <Text style={styles.backText} numberOfLines={1}>
          {t('finance.payments.detailTitle')}
        </Text>
      </Pressable>

      <View style={styles.card}>
        {/* DRAWN — `procurement.vendors` has no verification status. See the register. */}
        <View style={styles.verifiedChip}>
          <MaterialIcons name="verified" size={13} color={palette.success} />
          <Text style={styles.verifiedText}>{t('finance.payments.verifiedVendor')}</Text>
        </View>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.kvRow}>
            <Text style={styles.kvKey}>{label}</Text>
            <Text style={styles.kvValue} numberOfLines={1}>
              {value}
            </Text>
          </View>
        ))}
      </View>

      {/* What pressing Approve will actually do — see the header for what it is and is not. */}
      <View testID="payment-mfa-note" style={[styles.card, styles.mfaNote]}>
        <MaterialIcons name="fingerprint" size={18} color={palette.accent} />
        <Text style={styles.body}>{t('finance.payments.confirmNote')}</Text>
      </View>

      <View style={styles.detailActions}>
        <Pressable
          testID="payment-dispute-button"
          accessibilityRole="button"
          accessibilityLabel={t('finance.payments.dispute')}
          onPress={onDispute}
          style={[styles.detailButton, styles.detailButtonDanger]}
        >
          <Text style={[styles.detailButtonText, styles.detailButtonTextDanger]}>
            {t('finance.payments.dispute')}
          </Text>
        </Pressable>
        <Pressable
          testID="approve-payment-button"
          accessibilityRole="button"
          accessibilityLabel={t('finance.payments.approve')}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onApprove}
          style={[styles.detailButton, styles.detailButtonPrimary, busy && styles.disabled]}
        >
          <MaterialIcons name="task-alt" size={16} color={palette.onPrimary} />
          <Text style={[styles.detailButtonText, styles.detailButtonTextPrimary]}>
            {t('finance.payments.approve')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * How urgent the payment date reads, and in which colour.
 *
 * Compared as DATE STRINGS against today's, both `YYYY-MM-DD`. `payment_date` is a Postgres DATE and
 * arrives without a time, so parsing it into a `Date` would put it at midnight UTC and shift a
 * Bangkok reader's "today" by seven hours — a payment due today would read as due tomorrow for the
 * whole working day.
 */
function dueTone(paymentDate: string, p: Palette): { key: string; colour: string } {
  const today = new Date().toISOString().slice(0, 10);
  const due = paymentDate.slice(0, 10);
  if (due < today) return { key: 'finance.payments.overdue', colour: p.danger };
  if (due === today) return { key: 'finance.payments.dueToday', colour: p.warning };
  return { key: 'finance.payments.dueOn', colour: p.muted };
}

/** The date, in the reader's locale. Buddhist era follows automatically for `th` (QM-3). */
function formatDay(paymentDate: string, locale: string): string {
  const value = new Date(`${paymentDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(value.getTime())) return paymentDate;
  return new Intl.DateTimeFormat(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-US', {
    day: 'numeric',
    month: 'short',
  }).format(value);
}

/** The drawing's `w-12 h-12` back tile. Named so the plate and its radius cannot drift apart. */
const BACK_PLATE = 48;

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: p.bg, padding: spacing.md },
    fill: { flex: 1 },
    list: { gap: spacing.sm, paddingBottom: spacing.xl * 3 },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    headerText: { flexShrink: 1, gap: 2 },
    /**
     * The drawing writes PENDING at `font-hero-mobile`. This is the TITLE step (22px), one below it.
     *
     * NOT A PREFERENCE — §32.7 says a top-level tab screen is named by its TAB, and
     * `theme/__tests__/pageTitle.spec.ts` defines a page title as hero-sized text rendering a
     * translated string. That guard exists because the rule was re-broken once by exactly the
     * reasoning that would apply here: the mockup draws a title and ADR-085 makes mockups
     * authoritative for style. The screen is already named "Payments" by the bar and the breadcrumb;
     * this word names the SECTION under it, and at 22px over a 13px detail line it reads as the
     * drawing's large-over-small pair without claiming to be the page's name.
     */
    headerTitle: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.title.fontSize,
      letterSpacing: 0.5,
      // The drawing writes the word in capitals. Done here rather than in the message file so the
      // copy stays a normal word — Thai has no case, and an uppercase source string would read as
      // shouting in every language that does not.
      textTransform: 'uppercase',
    },
    // …and the count under it is `font-label-mobile` in the muted ink.
    headerCount: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    mfaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: `${p.accent}66`,
    },
    mfaText: { color: p.accent, fontFamily: fontFamily.medium, fontSize: 10 },

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
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    cardText: { flex: 1, gap: 2 },
    cardProject: {
      color: p.accent,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    cardVendor: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
    },
    cardFigures: { alignItems: 'flex-end', gap: spacing.xs / 2, flexShrink: 0 },
    // ACCENT, NOT PRIMARY. The drawing's dark theme puts this figure in `primary`, and
    // --mobile-primary is 4.17:1 on this background — under the 4.5:1 AA gate §20.8 holds text to.
    // The palette's own note on the pair says the same: unfilled text takes `accent`.
    cardAmount: {
      color: p.accent,
      fontFamily: fontFamily.bold,
      fontSize: typography.body.fontSize,
    },
    dueChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
    },
    dueChipText: { fontFamily: fontFamily.semibold, fontSize: 10 },
    cardFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: p.border,
      paddingTop: spacing.xs,
      marginTop: spacing.xs / 2,
    },
    linkChip: {
      flexShrink: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      // §32.7: every status pill, badge and chip takes xl — a platform ruling, not a reading of the
      // drawing's own 0.5rem. badgeRadius.spec.ts holds it.
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surfaceBright,
    },
    linkChipText: {
      flexShrink: 1,
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: 10,
    },
    // The drawing's `w-7 h-7 rounded-full bg-primary/10`. 999 is the capsule marker (§32.7) — a
    // circle is a shape, not a step on the radius scale.
    openPlate: {
      width: 28,
      height: 28,
      borderRadius: 999,
      backgroundColor: `${p.accent}1F`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardDue: { fontFamily: fontFamily.medium, fontSize: typography.label.fontSize },

    analysis: { borderLeftColor: p.accent, borderColor: p.accent },
    analysisHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs,
    },
    analysisTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      flexShrink: 1,
    },
    analysisTrail: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
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
    analysisFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: `${p.accent}33`,
      paddingTop: spacing.xs,
      marginTop: spacing.xs / 2,
    },
    analysisTitle: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },

    backRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: touchTarget.iconButton,
      marginBottom: spacing.sm,
    },
    backPlate: {
      width: BACK_PLATE,
      height: BACK_PLATE,
      borderRadius: plateRadius(BACK_PLATE),
      backgroundColor: p.surfaceBright,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backText: {
      flexShrink: 1,
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.title.fontSize,
    },
    verifiedChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
    verifiedText: { color: p.success, fontFamily: fontFamily.medium, fontSize: 10 },
    kvRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingVertical: spacing.xs / 2,
    },
    kvKey: { color: p.muted, fontFamily: fontFamily.regular, fontSize: typography.label.fontSize },
    kvValue: {
      flexShrink: 1,
      color: p.text,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    mfaNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
      borderLeftColor: p.accent,
      marginTop: spacing.sm,
    },
    detailActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
    detailButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs / 2,
      minHeight: touchTarget.primaryButton,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
    },
    detailButtonPrimary: { borderColor: p.primary, backgroundColor: p.primary },
    // The drawing's `border border-mobile-danger text-mobile-danger` — an outline button whose
    // whole point is that it reads as the destructive half of the pair.
    detailButtonDanger: { borderColor: p.danger },
    detailButtonText: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
      // The drawing sets both buttons `uppercase tracking-widest`. Done here rather than in the
      // message file so the copy stays an ordinary word — Thai has no case, and an uppercase source
      // string would read as shouting in every language that does.
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    detailButtonTextDanger: { color: p.danger },
    detailButtonTextPrimary: { color: p.onPrimary },
    disabled: { opacity: 0.5 },

    fab: {
      position: 'absolute',
      right: spacing.md,
      bottom: spacing.md,
      width: touchTarget.listItem,
      height: touchTarget.listItem,
      alignItems: 'center',
      justifyContent: 'center',
      // A circle: half the width, off the radius scale entirely (§32.7).
      borderRadius: touchTarget.listItem / 2,
      backgroundColor: p.primary,
    },

    eyebrow: {
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    body: {
      flex: 1,
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    source: {
      // Without flexShrink a <Text> in a row keeps its measured width and runs into the control
      // beside it — the same trap the Home card's footer hit.
      flexShrink: 1,
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    empty: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      paddingVertical: spacing.md,
    },
  });
