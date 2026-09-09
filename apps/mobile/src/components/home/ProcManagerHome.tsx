// ── PROC_MANAGER — the money, the decisions waiting, and who is supplying ────────────────────────
//
// Implements mockup/mobile/11_proc_manager/01_home/01_pom_dashboard.
//
// NEW ON 2026-09-09, AND THE SPLIT IS THE POINT. This role shared `<ProcurementHome />` with
// PROCUREMENT_OFFICER — `home.tsx` sent both to it — and the two drawings are not the same screen
// wearing different numbers. The officer's is four WORK QUEUES: requests to raise, RFQs to run,
// awards to turn into orders, deliveries to receive. The manager's is committed spend, the approvals
// waiting on a signature, and how the suppliers are performing. Same tab, different job.
//
// WHAT IS REAL, AND WHERE FROM.
//   Committed spend    `committedSpend()` over `GET /procurement/purchase-orders?limit=100`, summed
//                      in decimal.js — the same function the officer's screen used before its
//                      rewrite, kept because the figure is the same figure.
//   Open RFQs          `PUBLISHED`, the state where bids can still arrive (`procurementKpi.ts`).
//   Action Required    `fetchPendingApprovals()` — POs in `PENDING_APPROVAL` and RFQs in
//                      `EVALUATED`. THESE ARE EXACTLY THE TWO ROWS THE DRAWING SHOWS, and the
//                      function predates it: it was built for the project manager's queue in
//                      August. Four rows in the seeded tenant.
//   Top vendors        `GET /procurement/vendors/directory` for the names, then one
//                      `GET /procurement/vendors/:id/score` per vendor — a real weighted score over
//                      delivery, dispute and quotation history (`vendor-scoring.ts`), NOT a badge.
//                      A vendor with no history scores null and says so rather than showing a zero.
//   The insight module `<ProcurementInsight />`, genuine model output, on the project's standard
//                      AI-card foot (spec §32.7).
//
// WHAT IS DRAWN (lib/mockupFigures.ts, ADR-099): the "+5.2%" beside the spend and its "FY2024 Q3"
// label — nothing records a previous period to compare against — and Savings Realized entire, which
// needs a baseline estimate per order that no table holds. Both registered with what would delete
// them.
//
// THE APPROVALS ROWS OPEN THE QUEUE; THEY DO NOT APPROVE HERE. The drawing puts a chevron on each,
// and that is all this screen offers: the decision belongs on the RFQs tab, where the row carries
// the vendor, the project and the amount the signature is actually for.

import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useT } from '../../i18n';
import { useComingSoon } from '../useComingSoon';
import {
  listPurchaseOrders,
  listRfqs,
  fetchPendingApprovals,
  fetchVendorDirectory,
  fetchVendorScore,
  projectNameIndex,
  type PurchaseOrderRow,
  type RfqRow,
  type VendorDirectoryEntry,
} from '../../api/procurement';
import { committedSpend, openRfqCount, type SpendRow } from '../../lib/procurementKpi';
import { spacedMoney } from '../../lib/compactMoney';
import { deadlineCountdown } from '../../lib/approvalDeadline';
import { PROC_SPEND_TREND, PROC_SAVINGS_REALIZED } from '../../lib/mockupFigures';
import { ProcurementInsight } from '../ProcurementInsight';
import { usePalette, type Palette } from '../../theme/usePalette';
import { fontFamily, radius, spacing, typography } from '../../theme/tokens';
import { Screen, KpiRegion } from './HomeKit';

/** How many suppliers the drawing lists under "Top Vendors". */
const TOP_VENDORS = 3;

interface Scored extends VendorDirectoryEntry {
  /** `null` while the per-vendor request is out, and `null` again for a vendor with no history. */
  score: number | null;
  /**
   * The letter grade the same scorecard returns. REAL — `vendor-scoring.ts` derives it from the
   * weighted total — and it is what the drawing's "Grade A Tier-1 Supplier" line is asking for.
   * `null` for a vendor with no history, exactly like the score.
   */
  grade: string | null;
}

export default function ProcManagerHome(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const styles = makeStyles(p);
  const router = useRouter();
  const soon = useComingSoon();

  const [spend, setSpend] = useState<string | null>(null);
  const [openRfqs, setOpenRfqs] = useState<number | null>(null);
  const [urgentRfqs, setUrgentRfqs] = useState(0);
  const [pos, setPos] = useState<PurchaseOrderRow[]>([]);
  const [rfqs, setRfqs] = useState<RfqRow[]>([]);
  const [vendors, setVendors] = useState<Scored[]>([]);
  const [projects, setProjects] = useState<Map<string, string>>(new Map());
  const [insightProject, setInsightProject] = useState('');
  const [loading, setLoading] = useState(true);
  // Honest load progress: four independent fetches, counted as each settles (Rule 40).
  const [settled, setSettled] = useState(0);
  const LOAD_STEPS = 4;

  useEffect(() => {
    // `then(ok, fail)` rather than `finally`: `finally` returns a NEW promise that rejects when its
    // subject does, and discarding it leaves an unhandled rejection on every offline fetch.
    const step = <T,>(promise: Promise<T>): Promise<T> => {
      const bump = (): void => setSettled((n) => n + 1);
      promise.then(bump, bump);
      return promise;
    };

    const money = step(listPurchaseOrders())
      .then((res) => {
        setSpend(spacedMoney(committedSpend(res.items as unknown as SpendRow[]), 'THB'));
      })
      .catch(() => {
        /* offline — the tile keeps its dash rather than claiming a total */
      });

    const rfqCount = step(listRfqs())
      .then((res) => {
        setOpenRfqs(openRfqCount(res.items));
        // MEASURED. `procurement.rfqs.deadline` is a real column, so "urgent" is a count and not a
        // picture: the open RFQs whose deadline falls inside URGENT_MS. Counted over the SAME rows
        // the tile's total counts, so the chip can never exceed the number above it.
        const now = new Date();
        setUrgentRfqs(
          res.items.filter(
            (r) => r.status === 'PUBLISHED' && deadlineCountdown(r.deadline, now)?.urgent === true,
          ).length,
        );
      })
      .catch(() => {
        /* offline */
      });

    const queue = step(fetchPendingApprovals())
      .then((res) => {
        setPos(res.pos);
        setRfqs(res.rfqs);
      })
      .catch(() => {
        /* offline — the section says the queue could not be read, not that it is empty */
      });

    // The names first, then a score per vendor. Two waves on purpose: the scorecard is computed
    // per vendor over its whole history, and a slow one must not hold up the list of names.
    const suppliers = step(fetchVendorDirectory())
      .then(async (rows) => {
        const top = rows.slice(0, TOP_VENDORS);
        setVendors(top.map((v) => ({ ...v, score: null, grade: null })));
        const scored = await Promise.all(
          top.map(async (v) => ({
            ...v,
            ...(await fetchVendorScore(v.vendor_id)
              .then((s) => ({ score: s.totalScore, grade: s.grade }))
              .catch(() => ({ score: null, grade: null }))),
          })),
        );
        setVendors(scored);
      })
      .catch(() => {
        /* offline */
      });

    // The insight endpoint is per project, so the card takes the tenant's first and names it in its
    // own footer. `/projects`, not `/projects/mine`: this role is a member of none.
    const named = projectNameIndex()
      .then((index) => {
        setProjects(index);
        const first = [...index.keys()][0];
        if (first !== undefined) setInsightProject(first);
      })
      .catch(() => {
        /* offline — the panel stays idle rather than naming a project it could not fetch */
      });

    void Promise.allSettled([money, rfqCount, queue, suppliers, named]).then(() =>
      setLoading(false),
    );
  }, []);

  const projectName = projects.get(insightProject);
  const pending = pos.length + rfqs.length;

  return (
    <View style={styles.root}>
      <Screen testID="home-screen" scroll>
        <KpiRegion loading={loading} settled={settled} steps={LOAD_STEPS}>
          {/* The drawing's full-width spend tile, with the oversized `payments` glyph bleeding off
              its bottom-right corner. An em dash until the request settles — never a zero, which on
              a committed-spend tile would read as "nothing is on order". */}
          <Pressable
            testID="kpi-committed-spend"
            accessibilityRole="button"
            accessibilityLabel={t('home.procManager.committedSpend')}
            onPress={() => router.push('/orders')}
            style={[styles.wideTile, { borderLeftColor: p.primary }]}
          >
            <View style={styles.watermark} pointerEvents="none">
              {/* The drawing's glyph is `text-surface-variant/20` — a fifth of an already muted
                  colour. Drawn at full strength it is a grey plate across the tile, which is what
                  the first capture showed. */}
              <MaterialIcons name="payments" size={112} color={`${p.border}40`} />
            </View>
            <View style={styles.tileHead}>
              <MaterialIcons name="account-balance" size={18} color={p.primary} />
              <Text style={styles.tileLabel} numberOfLines={1}>
                {t('home.procManager.committedSpend')}
              </Text>
              <MaterialIcons name="chevron-right" size={18} color={p.primary} />
            </View>
            <View style={styles.wideFoot}>
              <Text style={styles.wideValue} numberOfLines={1} adjustsFontSizeToFit>
                {spend ?? '—'}
              </Text>
              {/* DRAWN — nothing records a previous period to compare against. See the register. */}
              <View style={styles.trendChip}>
                <MaterialIcons name="trending-up" size={13} color={p.success} />
                <Text style={styles.trendText}>{PROC_SPEND_TREND.value.delta}</Text>
              </View>
              <View style={styles.spacer} />
              <Text style={styles.period}>{PROC_SPEND_TREND.value.period}</Text>
            </View>
          </Pressable>

          <View style={styles.pairRow}>
            <Pressable
              testID="kpi-open-rfqs"
              accessibilityRole="button"
              accessibilityLabel={t('home.procManager.openRfqs')}
              onPress={() => router.push('/rfqs')}
              style={styles.tile}
            >
              <View style={styles.tileHead}>
                <Text style={styles.tileLabel} numberOfLines={2}>
                  {t('home.procManager.openRfqs')}
                </Text>
                {/* The drawing's circular chevron plate, on both small tiles. */}
                <View style={styles.chevPlate}>
                  <MaterialIcons name="chevron-right" size={16} color={p.muted} />
                </View>
              </View>
              <View style={styles.tileFoot}>
                <Text style={styles.tileValue}>{openRfqs === null ? '—' : String(openRfqs)}</Text>
                {/* MEASURED, not drawn. `procurement.rfqs.deadline` is a real column, so "urgent"
                    is the count of open RFQs whose deadline falls inside `URGENT_MS`
                    (lib/approvalDeadline.ts). The chip is absent when none of them is, rather than
                    printing a zero the drawing never shows. */}
                {urgentRfqs === 0 ? null : (
                  <View testID="kpi-open-rfqs-urgent" style={styles.warnChip}>
                    <MaterialIcons name="warning" size={12} color={p.warning} />
                    <Text style={styles.warnChipText}>
                      {t('home.procManager.urgent', { count: urgentRfqs })}
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>

            {/* DRAWN IN FULL — savings needs a baseline estimate per order and no table holds one.
                The same gap that stopped the officer's RFQ price delta. */}
            <Pressable
              testID="kpi-savings"
              accessibilityRole="button"
              accessibilityLabel={t('home.procManager.savings')}
              onPress={() => soon('home.procManager.savings')}
              style={styles.tile}
            >
              <View style={styles.tileHead}>
                <Text style={styles.tileLabel} numberOfLines={2}>
                  {t('home.procManager.savings')}
                </Text>
                <View style={styles.chevPlate}>
                  <MaterialIcons name="chevron-right" size={16} color={p.muted} />
                </View>
              </View>
              <View style={styles.tileFoot}>
                <Text style={[styles.tileValue, { color: p.accent }]}>
                  {PROC_SAVINGS_REALIZED.value}
                </Text>
                <View style={styles.aiChip}>
                  <MaterialIcons name="auto-awesome" size={12} color={p.accent} />
                  <Text style={styles.aiChipText}>{t('home.procManager.aiDriven')}</Text>
                </View>
              </View>
            </Pressable>
          </View>
        </KpiRegion>

        <ProcurementInsight projectId={insightProject} projectLabel={projectName} />

        {/* ── Action Required ─────────────────────────────────────────────────────────────── */}
        <View style={styles.sectionHead}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionLabel} accessibilityRole="header">
              {t('home.procManager.actionRequired')}
            </Text>
            {loading ? null : (
              <View style={styles.pendingChip}>
                <Text style={styles.pendingText}>
                  {t('home.procManager.pending', { count: pending })}
                </Text>
              </View>
            )}
          </View>
          <Pressable
            testID="proc-view-all"
            accessibilityRole="button"
            accessibilityLabel={t('home.procManager.viewAll')}
            onPress={() => router.push('/rfqs')}
            style={styles.viewAll}
          >
            <Text style={styles.viewAllText}>{t('home.procManager.viewAll')}</Text>
            <MaterialIcons name="arrow-forward" size={14} color={p.accent} />
          </Pressable>
        </View>

        {pending === 0 ? (
          <View testID="proc-queue-empty" style={styles.card}>
            <Text style={styles.body}>{t('home.procManager.queueEmpty')}</Text>
          </View>
        ) : (
          <>
            {pos.map((po) => (
              <ApprovalRow
                key={po.po_id}
                testID={`approval-po-${po.po_id}`}
                number={po.po_number}
                stateLabel={t('home.procManager.managerReview')}
                project={projects.get(po.project_id) ?? t('home.procManager.purchaseOrder')}
                amount={spacedMoney(po.total_amount, 'THB')}
                onPress={() => router.push('/rfqs')}
                styles={styles}
                palette={p}
              />
            ))}
            {rfqs.map((rfq) => (
              <ApprovalRow
                key={rfq.rfq_id}
                testID={`approval-rfq-${rfq.rfq_id}`}
                number={rfq.rfq_number}
                stateLabel={t('home.procManager.awaitingAward')}
                project={projects.get(rfq.project_id) ?? t('home.procManager.rfq')}
                amount={null}
                onPress={() => router.push('/rfqs')}
                styles={styles}
                palette={p}
              />
            ))}
          </>
        )}

        {/* ── Top vendors ─────────────────────────────────────────────────────────────────── */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionLabel} accessibilityRole="header">
            {t('home.procManager.topVendors')}
          </Text>
        </View>
        <View style={styles.card}>
          {vendors.length === 0 ? (
            <Text style={styles.body}>{t('home.procManager.noVendors')}</Text>
          ) : (
            vendors.map((v, i) => (
              <View key={v.vendor_id}>
                {/* The drawing separates the rows with a hairline and leaves the last one open. */}
                {i === 0 ? null : <View style={styles.vendorDivider} />}
                <Pressable
                  testID={`vendor-${v.vendor_id}`}
                  accessibilityRole="button"
                  accessibilityLabel={v.vendor_name}
                  onPress={() => router.push('/vendors')}
                  style={styles.vendorRow}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(v.vendor_name)}</Text>
                  </View>
                  <View style={styles.vendorBody}>
                    <Text style={styles.vendorName} numberOfLines={1}>
                      {v.vendor_name}
                    </Text>
                    {/* The drawing's tier line. Both halves are real: the grade from the scorecard,
                      the count from the directory. A vendor with no history shows only the count —
                      no invented tier. */}
                    <Text style={styles.vendorMeta} numberOfLines={1}>
                      {v.grade === null
                        ? t('home.procManager.activeProjects', { count: v.active_project_count })
                        : `${t('home.procManager.grade', { grade: v.grade })} · ${t('home.procManager.activeProjects', { count: v.active_project_count })}`}
                    </Text>
                  </View>
                  <View style={styles.scoreCol}>
                    {/* REAL, and NULL IS ITS OWN ANSWER: a vendor with no delivery, dispute or
                      quotation history has no score, and a zero there would read as a terrible
                      supplier rather than a new one. */}
                    <Text style={[styles.score, v.score === null && { color: p.muted }]}>
                      {v.score === null
                        ? t('home.procManager.noScore')
                        : // ROUNDED. `vendor-scoring.ts` returns a weighted float and this printed
                          // it whole — "94.03292181069958 TS" on the dashboard. The vendor directory
                          // already rounded; this did not.
                          t('home.procManager.trustScore', { score: Math.round(v.score) })}
                    </Text>
                    <View style={styles.scoreTrack}>
                      <View
                        style={[
                          styles.scoreFill,
                          { width: `${v.score ?? 0}%`, backgroundColor: p.success },
                        ]}
                      />
                    </View>
                  </View>
                  <MaterialIcons name="chevron-right" size={16} color={p.muted} />
                </Pressable>
              </View>
            ))
          )}
        </View>
      </Screen>
    </View>
  );
}

/** Up to two letters, from the vendor's own name — never a stored avatar, which no vendor has. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

function ApprovalRow({
  testID,
  number,
  stateLabel,
  project,
  amount,
  onPress,
  styles,
  palette,
}: {
  testID: string;
  number: string;
  stateLabel: string;
  project: string;
  amount: string | null;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  palette: Palette;
}): React.JSX.Element {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={number}
      onPress={onPress}
      style={styles.approvalCard}
    >
      <View style={styles.approvalBody}>
        {/* The drawing's first row: the record number as a chip, then the state chip. */}
        <View style={styles.approvalHead}>
          <View style={styles.numberChip}>
            <Text style={styles.approvalNumber}>{number}</Text>
          </View>
          <View style={styles.stateChip}>
            <MaterialIcons name="schedule" size={11} color={palette.warning} />
            <Text style={styles.stateText}>{stateLabel}</Text>
          </View>
        </View>
        <Text style={styles.approvalTitle} numberOfLines={1}>
          {project}
        </Text>
        {/* The drawing's third row is `location_on {site} • {amount}` under a SUBJECT line. This
            platform has no subject on a purchase order, so the project took the big line — and the
            first capture then printed the project twice, once in each place. The meta row keeps
            only what the big line does not already say: the money.
            An RFQ has no total until it is awarded, so the row is omitted entirely rather than
            printing a zero or an em dash where money belongs. */}
        {amount === null ? null : (
          <View style={styles.approvalMeta}>
            <MaterialIcons name="payments" size={13} color={palette.muted} />
            <Text style={styles.approvalAmount}>{amount}</Text>
          </View>
        )}
      </View>
      <View style={styles.openPlate}>
        <MaterialIcons name="chevron-right" size={20} color={palette.accent} />
      </View>
    </Pressable>
  );
}

function makeStyles(p: Palette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: p.bg },
    // The drawing's oversized `payments` glyph, bleeding off the tile's bottom-right corner. It is
    // decoration, so it takes the border colour rather than a tinted brand hue, and the tile clips
    // it. `pointerEvents="none"` at the call site keeps it out of the press target.
    watermark: { position: 'absolute', right: -16, bottom: -24 },
    spacer: { flex: 1 },
    tileFoot: { gap: spacing.xs / 2, alignItems: 'flex-start' },
    // A circle: 999 marks a shape whose radius is half its width.
    chevPlate: {
      width: 28,
      height: 28,
      borderRadius: 999,
      backgroundColor: p.elevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    warnChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: `${p.warning}55`,
      backgroundColor: `${p.warning}1A`,
    },
    warnChipText: { color: p.warning, fontFamily: fontFamily.semibold, fontSize: 10 },
    aiChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: `${p.accent}55`,
      backgroundColor: `${p.accent}1A`,
    },
    aiChipText: { color: p.accent, fontFamily: fontFamily.semibold, fontSize: 10 },
    numberChip: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radius.xl,
      backgroundColor: p.surfaceBright,
    },
    approvalMeta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    approvalMetaText: {
      flexShrink: 1,
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: 11,
    },
    dot: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 11 },
    vendorDivider: { height: 1, backgroundColor: p.border },
    wideTile: {
      overflow: 'hidden',
      gap: spacing.xs,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      backgroundColor: p.surface,
    },
    pairRow: { flexDirection: 'row', gap: spacing.sm },
    tile: {
      flex: 1,
      gap: spacing.sm,
      minHeight: 96,
      justifyContent: 'space-between',
      padding: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    tileHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    tileLabel: {
      flex: 1,
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
    },
    tileValue: { color: p.text, fontFamily: fontFamily.bold, fontSize: 26 },
    wideFoot: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
    wideValue: { flexShrink: 1, color: p.text, fontFamily: fontFamily.bold, fontSize: 30 },
    trendChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: spacing.xs,
      paddingVertical: 1,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: `${p.success}55`,
    },
    trendText: { color: p.success, fontFamily: fontFamily.semibold, fontSize: 10 },
    period: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 10 },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
    sectionLabel: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.title.fontSize,
    },
    pendingChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 1,
      borderRadius: radius.xl,
      backgroundColor: `${p.warning}26`,
    },
    pendingText: { color: p.warning, fontFamily: fontFamily.bold, fontSize: 10 },
    viewAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    viewAllText: { color: p.accent, fontFamily: fontFamily.medium, fontSize: 11 },
    card: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    body: { color: p.muted, fontFamily: fontFamily.regular, fontSize: typography.caption.fontSize },
    approvalCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      borderLeftColor: p.warning,
      backgroundColor: p.surface,
    },
    approvalBody: { flex: 1, gap: 2 },
    approvalHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
    approvalNumber: { color: p.text, fontFamily: fontFamily.semibold, fontSize: 11 },
    stateChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: spacing.xs,
      paddingVertical: 1,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: `${p.warning}55`,
    },
    stateText: { color: p.warning, fontFamily: fontFamily.semibold, fontSize: 10 },
    approvalTitle: {
      color: p.text,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    approvalAmount: { color: p.accent, fontFamily: fontFamily.bold, fontSize: 12 },
    openPlate: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      // A circle: 999 marks a shape whose radius is half its width.
      borderRadius: 999,
      backgroundColor: p.elevated,
    },
    vendorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    avatar: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      backgroundColor: p.elevated,
    },
    avatarText: { color: p.text, fontFamily: fontFamily.bold, fontSize: 11 },
    vendorBody: { flex: 1 },
    vendorName: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    vendorMeta: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 10, marginTop: 2 },
    scoreCol: { alignItems: 'flex-end', gap: 4 },
    score: { color: p.success, fontFamily: fontFamily.bold, fontSize: 11 },
    scoreTrack: {
      width: 64,
      height: 4,
      borderRadius: 999,
      backgroundColor: p.elevated,
      overflow: 'hidden',
    },
    scoreFill: { height: 4, borderRadius: 999 },
  });
}
