// The PROC_MANAGER's RFQs tab — the decisions waiting on this role.
//
// Implements mockup/mobile/11_proc_manager/02_rfqs/01_pom_rfqs. The route is `rfqs` for both
// procurement roles and shows two different screens: the officer's RFQ queue, and this.
//
// WHAT IS REAL, AND WHERE FROM.
//   The rows      `fetchPendingApprovals()` — purchase orders in `PENDING_APPROVAL` and RFQs in
//                 `EVALUATED`, the two states that mean "waiting on a person". Four in the seeded
//                 tenant. The function predates this drawing by a month; it was built for the
//                 project manager's queue.
//   Vendor        the directory index, one request for the screen.
//   Project       `GET /projects`, indexed — not `/projects/mine`; a procurement role is a member
//                 of no project.
//   The amount    `purchase_orders.total_amount`, decimal.js.
//
// ── THE APPROVE BUTTON DOES NOT APPROVE, AND THAT IS NOT A SHORTCUT ─────────────────────────────
//
// The drawing puts APPROVE on every row. This role cannot press it, on either kind of row, and the
// two reasons are different:
//
//   PURCHASE ORDERS — `POST /procurement/purchase-orders/:poId/approve` is
//     `@Roles(PROJECT_MANAGER, FINANCE, EXECUTIVE, TENANT_ADMIN)`. PROC_MANAGER is not on it, so the
//     server answers 403.
//
//     THE SPECIFICATION DISAGREES WITH THE CODE, and it is worth being precise about which:
//     `docs/specifications/06-*.md:296` gives PROC_MANAGER `RW + A` on purchase orders and §6 line
//     283 describes the role as "Procurement approval authority tier above Procurement Officer". So
//     the authority is specified and the route does not grant it. Even with the route opened, the
//     workflow has no rung for it: `po.workflow.ts::buildApprovalTiers` builds
//     PM → FINANCE → EXECUTIVE from the order's amount, and `approvePoSignal` accepts
//     `'PM' | 'FINANCE' | 'EXECUTIVE' | 'TENANT_ADMIN'`. Sending one of those from this role would
//     sign someone else's tier and corrupt the audit trail the ladder exists to produce.
//
//   RFQs — `POST /procurement/rfqs/:rfqId/award` DOES allow this role. It requires a
//     `quotation_id`, and the only endpoint that lists an RFQ's quotations is
//     `GET /procurement/rfqs/:rfqId/quotations`, which is not a read: it asserts the RFQ is CLOSED
//     and MARKS THE LOWEST QUOTATION SELECTED (found 2026-09-08, ADR-099's sixth amendment). There
//     is no way to obtain an id to award without awarding.
//
// So the button draws and says so, which is the `more.tsx` convention (PO 2026-09-04). What would
// make it real: for a PO, a `PROC_MANAGER` rung in the approval ladder and the role added to the
// route; for an RFQ, a read-only quotations endpoint. ASKED DIRECTLY ON 2026-09-09 whether to open
// the route instead, the product owner said no: draw it as the drawing draws it and say so. The
// drawing's BULK bar — "อนุมัติทั้งหมด (8 รายการ)" — is the same action eight times and is drawn on
// the same terms.
//
// ── REBUILT 2026-09-09 TO MATCH THE DRAWING ─────────────────────────────────────────────────────
//
// The product owner rejected the previous version for not looking like it. Plan: PART 3. What
// changed: a project bar at the top, an Urgent chip in the filter row, the card given the drawing's
// shape — a coloured accent, the record number and a state chip on one row, a large title, the
// amount at the trailing edge, then the two-button foot — and the bulk bar at the bottom.
//
// THE COUNTDOWN CHIP IS NOW MEASURED, NOT DRAWN. It printed `APPROVAL_COUNTDOWN` on every row until
// today. `procurement.rfqs.deadline` is a real column that `RfqRow` already returned, so an RFQ's
// countdown comes from `lib/approvalDeadline.ts` and the register entry was deleted. A PURCHASE
// ORDER NOW CARRIES NO CHIP: it has no decision deadline, and drawing one for it was the mistake.
//
// THE CARD'S LARGE LINE IS THE PROJECT. The drawing puts a subject there — "Steel Rebar Supply Q3"
// — and `procurement.purchase_orders` has no subject, description or title column. Rather than
// draw one, the line carries the project the decision belongs to, which is real and is the thing a
// manager sorts these by.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, FlatList, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Decimal from 'decimal.js';
import {
  fetchPendingApprovals,
  vendorIndex,
  projectNameIndex,
  type PurchaseOrderRow,
  type RfqRow,
} from '../../api/procurement';
import { LoadingBoundary } from '../LoadingBoundary';
import { ProjectContextBar } from '../ProjectContextBar';
import { useComingSoon } from '../useComingSoon';
import { spacedMoney } from '../../lib/compactMoney';
import { deadlineCountdown, type Countdown } from '../../lib/approvalDeadline';
import { useT } from '../../i18n';
import { usePalette, useIsDark, type Palette } from '../../theme/usePalette';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { makeQueueStyles, QueueChip, QueueHeader } from './QueueKit';

/** One row of the queue, whichever kind it came from. */
interface Row {
  key: string;
  kind: 'PO' | 'RFQ';
  number: string;
  projectId: string;
  vendorId: string | null;
  amount: string | null;
  /** REAL on an RFQ (`procurement.rfqs.deadline`); a purchase order has none. */
  deadline: string | null;
}

type Filter = '' | 'PO' | 'RFQ' | 'URGENT';

export default function ApprovalsQueue(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(p), [p]);
  const soon = useComingSoon();

  const [rows, setRows] = useState<Row[]>([]);
  const [vendors, setVendors] = useState<Map<string, string>>(new Map());
  const [projects, setProjects] = useState<Map<string, string>>(new Map());
  const [filter, setFilter] = useState<Filter>('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [queue, vend, names] = await Promise.all([
        fetchPendingApprovals(),
        vendorIndex().catch(() => new Map<string, string>()),
        projectNameIndex().catch(() => new Map<string, string>()),
      ]);
      setVendors(vend);
      setProjects(names);
      setRows([...queue.pos.map(fromPo), ...queue.rfqs.map(fromRfq)]);
      setFailed(false);
    } catch {
      // An empty queue and an unreachable one are different answers, and this screen must not
      // report the second as the first — "nothing to approve" is a claim a manager acts on.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The countdown per row. `null` on every purchase order — see the header.
  //
  // `now` IS READ INSIDE THE MEMO, not captured from the render. A Date closed over from outside
  // would be pinned to the render that created it while the memo re-ran only when `rows` changed,
  // so the chips would freeze at whatever they said when the queue last loaded.
  const countdowns = useMemo(() => {
    const now = new Date();
    const by = new Map<string, Countdown | null>();
    for (const r of rows) by.set(r.key, deadlineCountdown(r.deadline, now));
    return by;
  }, [rows]);

  const isUrgent = useCallback((key: string) => countdowns.get(key)?.urgent === true, [countdowns]);

  const counts: Record<Filter, number> = {
    '': rows.length,
    PO: rows.filter((r) => r.kind === 'PO').length,
    RFQ: rows.filter((r) => r.kind === 'RFQ').length,
    URGENT: rows.filter((r) => isUrgent(r.key)).length,
  };
  const visible =
    filter === ''
      ? rows
      : filter === 'URGENT'
        ? rows.filter((r) => isUrgent(r.key))
        : rows.filter((r) => r.kind === filter);

  /** The drawing's countdown chip wording, from a measured interval. */
  const countdownText = (c: Countdown): string =>
    c.state === 'OVERDUE'
      ? t('procurement.approvals.overdue')
      : c.state === 'HOURS'
        ? t('procurement.approvals.hoursLeft', { hours: String(c.hours) })
        : t('procurement.approvals.daysLeft', { days: String(c.days) });

  return (
    <View testID="approvals-screen" style={styles.page}>
      <QueueHeader
        title={t('procurement.approvals.title')}
        subtitle={t('procurement.approvals.subtitle')}
        styles={styles}
      />

      {/* The drawing's second header row. Renders nothing until a project is chosen. */}
      <ProjectContextBar />

      <View style={styles.chipRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipContent}
        >
          {(['', 'RFQ', 'PO', 'URGENT'] as const).map((f) => (
            <QueueChip
              key={f === '' ? 'ALL' : f}
              testID={`approval-filter-${f === '' ? 'ALL' : f}`}
              label={
                f === ''
                  ? t('procurement.approvals.all')
                  : f === 'URGENT'
                    ? t('procurement.approvals.urgent')
                    : t(`procurement.approvals.kind.${f}`)
              }
              count={failed ? null : counts[f]}
              on={filter === f}
              onPress={() => setFilter(f)}
              styles={styles}
            />
          ))}
        </ScrollView>
      </View>

      <LoadingBoundary
        loading={loading && rows.length === 0}
        variant="list"
        theme={isDark ? 'dark' : 'light'}
        style={styles.listRegion}
      >
        <FlatList
          testID="approvals-list"
          data={visible}
          keyExtractor={(r) => r.key}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text testID="approvals-empty" style={styles.empty}>
              {failed ? t('procurement.approvals.failed') : t('procurement.approvals.empty')}
            </Text>
          }
          renderItem={({ item }) => {
            const c = countdowns.get(item.key) ?? null;
            // The accent is the state, in the two colours the drawing gives its cards: an urgent
            // decision is a warning, everything else the ordinary blue of a review.
            const tone = c?.urgent === true ? p.warning : p.primary;
            const secondKey =
              item.kind === 'RFQ'
                ? 'procurement.approvals.compare'
                : 'procurement.approvals.details';
            return (
              <View testID={`approval-${item.key}`} style={styles.approvalCard}>
                <View style={[styles.cardAccent, { backgroundColor: tone }]} />
                <View style={styles.cardInner}>
                  <View style={styles.headRow}>
                    <View style={styles.numberChip}>
                      <Text style={styles.number} numberOfLines={1} ellipsizeMode="middle">
                        {`#${item.number}`}
                      </Text>
                    </View>
                    {/* MEASURED, and only where a deadline exists. A purchase order shows nothing
                        here — see the header. */}
                    {c === null ? null : (
                      <View
                        testID={`approval-countdown-${item.key}`}
                        style={[
                          styles.stateChip,
                          { borderColor: `${tone}55`, backgroundColor: `${tone}1A` },
                        ]}
                      >
                        <MaterialIcons name="alarm" size={11} color={tone} />
                        <Text style={[styles.stateText, { color: tone }]}>{countdownText(c)}</Text>
                      </View>
                    )}
                    <View
                      style={[
                        styles.stateChip,
                        { borderColor: `${tone}55`, backgroundColor: `${tone}1A` },
                      ]}
                    >
                      <MaterialIcons
                        name={item.kind === 'RFQ' ? 'schedule' : 'rate-review'}
                        size={11}
                        color={tone}
                      />
                      <Text style={[styles.stateText, { color: tone }]}>
                        {t(
                          item.kind === 'RFQ'
                            ? 'procurement.approvals.stateAwaitingAward'
                            : 'procurement.approvals.stateManagerReview',
                        )}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.titleRow}>
                    {/* REAL — the project the decision belongs to. The drawing's subject line has
                        no column behind it; see the header. */}
                    <Text style={styles.subject} numberOfLines={1}>
                      {projects.get(item.projectId) ?? t(`procurement.approvals.kind.${item.kind}`)}
                    </Text>
                    {/* An RFQ has no total until it is awarded — the line is absent, not zeroed. */}
                    {item.amount === null ? null : (
                      <Text style={styles.amount} numberOfLines={1}>
                        {spacedMoney(new Decimal(item.amount), 'THB')}
                      </Text>
                    )}
                  </View>

                  <View style={styles.metaBlock}>
                    <View style={styles.metaRow}>
                      <MaterialIcons name="storefront" size={13} color={p.muted} />
                      <Text style={styles.metaLabel}>{t('procurement.approvals.vendor')}</Text>
                      {/* Nothing is drawn where the vendor is unknown — an RFQ has no vendor until
                          it is awarded, which is exactly the state these rows are in. */}
                      <Text style={styles.metaValue} numberOfLines={1}>
                        {(item.vendorId === null ? null : vendors.get(item.vendorId)) ??
                          t('procurement.approvals.multiVendor')}
                      </Text>
                    </View>
                    <View style={styles.metaRow}>
                      <MaterialIcons name="apartment" size={13} color={p.muted} />
                      <Text style={styles.metaLabel}>{t('procurement.approvals.project')}</Text>
                      <Text style={styles.metaValue} numberOfLines={1}>
                        {projects.get(item.projectId) ?? '—'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.actions}>
                    {/* DRAWN, and the header says exactly why for each kind. */}
                    <Pressable
                      testID={`approval-approve-${item.key}`}
                      accessibilityRole="button"
                      accessibilityLabel={t('procurement.approvals.approve')}
                      onPress={() => soon('procurement.approvals.approve')}
                      style={[styles.action, styles.actionPrimary]}
                    >
                      <MaterialIcons name="verified" size={18} color={p.onPrimary} />
                      <Text style={styles.actionPrimaryText}>
                        {t('procurement.approvals.approve')}
                      </Text>
                    </Pressable>
                    <Pressable
                      testID={`approval-details-${item.key}`}
                      accessibilityRole="button"
                      accessibilityLabel={t(secondKey)}
                      onPress={() => soon(secondKey)}
                      style={[styles.action, styles.actionGhost]}
                    >
                      <MaterialIcons name="visibility" size={18} color={p.text} />
                      <Text style={styles.ghostText} numberOfLines={1}>
                        {t(secondKey)}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          }}
        />
      </LoadingBoundary>

      {/* THE BULK BAR. Drawn on the same terms as the row button — it is that action n times, and
          the route refuses this role. Absent when there is nothing to approve, rather than offering
          to approve zero items. */}
      {visible.length === 0 ? null : (
        <Pressable
          testID="approve-all"
          accessibilityRole="button"
          accessibilityLabel={t('procurement.approvals.approveAll', {
            count: String(visible.length),
          })}
          onPress={() => soon('procurement.approvals.approve')}
          style={styles.bulk}
        >
          <MaterialIcons name="done-all" size={18} color={p.onPrimary} />
          <Text style={styles.bulkText} numberOfLines={1}>
            {t('procurement.approvals.approveAll', { count: String(visible.length) })}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function fromPo(po: PurchaseOrderRow): Row {
  return {
    key: `po-${po.po_id}`,
    kind: 'PO',
    number: po.po_number,
    projectId: po.project_id,
    vendorId: po.vendor_id,
    amount: po.total_amount,
    // A purchase order has no decision deadline — `delivery_date` is when goods are due, not when a
    // signature is. So it carries no countdown chip, rather than a drawn one.
    deadline: null,
  };
}

function fromRfq(rfq: RfqRow): Row {
  return {
    key: `rfq-${rfq.rfq_id}`,
    kind: 'RFQ',
    number: rfq.rfq_number,
    projectId: rfq.project_id,
    // An RFQ in EVALUATED has quotations from several vendors and no winner — that is the decision
    // it is waiting for. There is no vendor to name and no total to print.
    vendorId: null,
    amount: null,
    deadline: rfq.deadline,
  };
}

function makeStyles(p: Palette) {
  return StyleSheet.create({
    ...makeQueueStyles(p),

    // The drawing's card: a coloured accent bar down the leading edge, everything else inside.
    approvalCard: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      flexDirection: 'row',
      overflow: 'hidden',
    },
    cardAccent: { width: 4 },
    cardInner: { flex: 1, padding: spacing.sm, gap: spacing.xs },

    headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2, flexWrap: 'wrap' },
    numberChip: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radius.xl,
      backgroundColor: p.surfaceBright,
    },
    number: { color: p.text, fontFamily: fontFamily.semibold, fontSize: 11 },
    stateChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
    },
    stateText: { fontFamily: fontFamily.semibold, fontSize: 10 },

    titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
    subject: {
      flex: 1,
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.fontSize * 1.25,
    },
    amount: { color: p.accent, fontFamily: fontFamily.bold, fontSize: typography.caption.fontSize },

    metaBlock: {
      gap: spacing.xs,
      padding: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.bg,
    },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    metaLabel: {
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: 9,
      textTransform: 'uppercase',
    },
    metaValue: { flex: 1, color: p.text, fontFamily: fontFamily.regular, fontSize: 11 },
    ghostText: { color: p.text, fontFamily: fontFamily.medium, fontSize: 11 },

    // The drawing's bottom bar. Sits under the list, not inside it.
    bulk: {
      minHeight: touchTarget.primaryButton,
      borderRadius: radius.md,
      backgroundColor: p.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
    },
    bulkText: {
      color: p.onPrimary,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
  });
}
