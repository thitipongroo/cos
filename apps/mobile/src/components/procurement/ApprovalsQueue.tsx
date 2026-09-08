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
// route; for an RFQ, a read-only quotations endpoint.

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
import { useComingSoon } from '../useComingSoon';
import { spacedMoney } from '../../lib/compactMoney';
import { APPROVAL_COUNTDOWN } from '../../lib/mockupFigures';
import { useT } from '../../i18n';
import { usePalette, useIsDark, type Palette } from '../../theme/usePalette';
import { fontFamily, radius, spacing, typography } from '../../theme/tokens';
import { makeQueueStyles, QueueChip, QueueHeader } from './QueueKit';

/** One row of the queue, whichever kind it came from. */
interface Row {
  key: string;
  kind: 'PO' | 'RFQ';
  number: string;
  projectId: string;
  vendorId: string | null;
  amount: string | null;
}

type Filter = '' | 'PO' | 'RFQ';

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

  const counts: Record<Filter, number> = {
    '': rows.length,
    PO: rows.filter((r) => r.kind === 'PO').length,
    RFQ: rows.filter((r) => r.kind === 'RFQ').length,
  };
  const visible = filter === '' ? rows : rows.filter((r) => r.kind === filter);

  return (
    <View testID="approvals-screen" style={styles.page}>
      <QueueHeader
        title={t('procurement.approvals.title')}
        subtitle={t('procurement.approvals.subtitle')}
        styles={styles}
      />

      <View style={styles.chipRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipContent}
        >
          {(['', 'RFQ', 'PO'] as const).map((f) => (
            <QueueChip
              key={f === '' ? 'ALL' : f}
              testID={`approval-filter-${f === '' ? 'ALL' : f}`}
              label={t(f === '' ? 'procurement.approvals.all' : `procurement.approvals.kind.${f}`)}
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
          renderItem={({ item, index }) => (
            <View testID={`approval-${item.key}`} style={[styles.card, styles.approvalCard]}>
              <View style={styles.headRow}>
                <Text style={styles.number} numberOfLines={1} ellipsizeMode="middle">
                  {`#${item.number}`}
                </Text>
                {/* DRAWN — a purchase order carries no decision deadline; `delivery_date` is when
                    goods are due, not when a signature is. See APPROVAL_COUNTDOWN. */}
                <View style={styles.urgencyChip}>
                  <MaterialIcons name="alarm" size={11} color={p.warning} />
                  <Text style={styles.urgencyText}>
                    {APPROVAL_COUNTDOWN.value[index % APPROVAL_COUNTDOWN.value.length]}
                  </Text>
                </View>
              </View>

              <View style={styles.headRow}>
                <Text style={styles.kind}>{t(`procurement.approvals.kind.${item.kind}`)}</Text>
                {/* An RFQ has no total until it is awarded — the line is absent, not zeroed. */}
                {item.amount === null ? null : (
                  <Text style={styles.amount}>{spacedMoney(new Decimal(item.amount), 'THB')}</Text>
                )}
              </View>

              <View style={styles.metaBlock}>
                <View style={styles.metaRow}>
                  <MaterialIcons name="storefront" size={13} color={p.muted} />
                  <Text style={styles.metaLabel}>{t('procurement.approvals.vendor')}</Text>
                  {/* Nothing is drawn where the vendor is unknown — an RFQ has no vendor until it
                      is awarded, which is exactly the state these rows are in. */}
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
                  <Text style={styles.actionPrimaryText}>{t('procurement.approvals.approve')}</Text>
                </Pressable>
                <Pressable
                  testID={`approval-details-${item.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={t('procurement.approvals.details')}
                  onPress={() => soon('procurement.approvals.details')}
                  style={[styles.action, styles.actionGhost]}
                >
                  <MaterialIcons name="visibility" size={18} color={p.text} />
                </Pressable>
              </View>
            </View>
          )}
        />
      </LoadingBoundary>
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
  };
}

function makeStyles(p: Palette) {
  return StyleSheet.create({
    ...makeQueueStyles(p),
    approvalCard: { borderLeftColor: p.warning },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    number: {
      flex: 1,
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
    },
    urgencyChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: spacing.xs,
      paddingVertical: 1,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: `${p.warning}55`,
    },
    urgencyText: { color: p.warning, fontFamily: fontFamily.semibold, fontSize: 10 },
    kind: {
      flex: 1,
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: 11,
      textTransform: 'uppercase',
    },
    amount: { color: p.accent, fontFamily: fontFamily.bold, fontSize: typography.label.fontSize },
    metaBlock: {
      gap: spacing.xs,
      padding: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: p.elevated,
    },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    metaLabel: {
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: 9,
      textTransform: 'uppercase',
    },
    metaValue: { flex: 1, color: p.text, fontFamily: fontFamily.regular, fontSize: 11 },
  });
}
