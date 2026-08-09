// Approvals — the manager's decision queue (mockup 06_project_manager/02_approvals).
//
// A tab for PROJECT_MANAGER and PROC_MANAGER (PO decision 2026-08-10). Both see the same queue; what
// differs is which items they can act on, and that comes from the RBAC matrix rather than from the
// drawing:
//   - Purchase orders: §6.4 gives PROJECT_MANAGER `A` on purchase orders, and §6.8 gives
//     PROC_MANAGER the same, so BOTH get a working Approve button. The tier sent is PM — the
//     workflow collects one signal per required tier (≤ ฿50,000 → PM alone; ฿50,001–500,000 →
//     PM + FINANCE; > ฿500,000 → + EXECUTIVE, spec §15.5) and PM is the tier these two hold.
//   - RFQs: §6.4 gives PROJECT_MANAGER `R` only, while §6.8 lets PROC_MANAGER trigger
//     EVALUATED → AWARDED. So the award action is offered to PROC_MANAGER alone, and the project
//     manager sees the item with the reason it is not actionable for them. Drawing the same button
//     for both would offer an action the server would refuse.
//
// WHAT IS IN THE QUEUE is not a guess either: purchase orders sitting in PENDING_APPROVAL and RFQs
// in EVALUATED ("quotations compared, awaiting award" — the mockup's "Awaiting Award"). Both statuses
// are in the CHECK constraints on their own tables.
//
// NO COUNTDOWN ON A PURCHASE ORDER. The mockup prints "4h remaining" on one. An RFQ has a real
// `deadline` column so its countdown is a fact; a PO has no approval deadline on the row — the
// 48-hour per-approver escalation clock lives inside the Temporal workflow — so this screen shows POs
// without one rather than deriving a number from `updated_at`, which any other write resets.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { CosRole } from '@cos/types';
import { formatMoney } from '@cos/financial';
import {
  fetchPendingApprovals,
  approvePurchaseOrder,
  type PurchaseOrderRow,
  type RfqRow,
} from '../../api/procurement';
import { hoursRemaining, isUrgent } from '../../lib/approvalUrgency';
import { useAuthStore } from '../../store/authStore';
import { useI18n } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette, type Palette } from '../../theme/usePalette';

type Filter = 'ALL' | 'RFQ' | 'PO' | 'URGENT';

/** One queue row, flattened from the two sources so the list renders from a single shape. */
interface Item {
  key: string;
  kind: 'PO' | 'RFQ';
  reference: string;
  amount: string | null;
  currency: string | null;
  /** Real deadline, RFQ only — a PO has none. */
  deadline: string | null;
  projectId: string;
  vendorId: string | null;
}

const FILTERS: readonly { id: Filter; labelKey: string }[] = [
  { id: 'ALL', labelKey: 'approvals.filterAll' },
  { id: 'RFQ', labelKey: 'approvals.filterRfq' },
  { id: 'PO', labelKey: 'approvals.filterPo' },
  { id: 'URGENT', labelKey: 'approvals.filterUrgent' },
];

function toItems(pos: PurchaseOrderRow[], rfqs: RfqRow[]): Item[] {
  return [
    ...pos.map((po) => ({
      key: `PO:${po.po_id}`,
      kind: 'PO' as const,
      reference: po.po_number,
      amount: po.total_amount,
      currency: po.currency_code,
      deadline: null,
      projectId: po.project_id,
      vendorId: po.vendor_id,
    })),
    ...rfqs.map((rfq) => ({
      key: `RFQ:${rfq.rfq_id}`,
      kind: 'RFQ' as const,
      reference: rfq.rfq_number,
      // An RFQ under evaluation has several bids and no single amount on the row; showing one would
      // mean picking a quotation, which is the award decision itself.
      amount: null,
      currency: null,
      deadline: rfq.deadline,
      projectId: rfq.project_id,
      vendorId: null,
    })),
  ];
}

export default function ApprovalsScreen(): React.JSX.Element {
  const { t } = useI18n();
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  const role = useAuthStore((s) => s.role);

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const { pos, rfqs } = await fetchPendingApprovals();
      setItems(toItems(pos, rfqs));
    } catch {
      setItems([]);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // One clock for the whole render, so two rows a millisecond apart cannot disagree about "now".
  const now = useMemo(() => new Date(), [items]);

  const visible = useMemo(
    () =>
      items.filter((item) => {
        if (filter === 'ALL') return true;
        if (filter === 'URGENT') return isUrgent(item.deadline, now);
        return item.kind === filter;
      }),
    [items, filter, now],
  );

  const approve = useCallback(
    async (item: Item) => {
      setBusyKey(item.key);
      try {
        await approvePurchaseOrder(item.key.slice(3), 'PM');
        Alert.alert(t('approvals.approved'), item.reference);
        await load();
      } catch {
        // The approval is a financial mutation and is NOT queued offline (spec §17.4), so a failure
        // means nothing was recorded — say so rather than leaving the row looking done.
        Alert.alert(t('approvals.approveFailed'), item.reference);
      } finally {
        setBusyKey(null);
      }
    },
    [t, load],
  );

  return (
    <ScrollView
      testID="approvals-screen"
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={styles.page}
    >
      <View style={styles.filterRow}>
        {FILTERS.map(({ id, labelKey }) => {
          const on = filter === id;
          return (
            <Pressable
              key={id}
              testID={`approvals-filter-${id.toLowerCase()}`}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t(labelKey)}
              onPress={() => setFilter(id)}
              style={[styles.chip, on && styles.chipOn]}
            >
              {id === 'URGENT' ? (
                <MaterialIcons
                  name="priority-high"
                  size={16}
                  color={on ? p.onPrimary : p.warning}
                />
              ) : null}
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{t(labelKey)}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator testID="approvals-loading" color={p.primary} style={styles.spinner} />
      ) : null}

      {!loading && failed ? <Text style={styles.notice}>{t('approvals.failed')}</Text> : null}

      {!loading && !failed && visible.length === 0 ? (
        <Text testID="approvals-empty" style={styles.notice}>
          {t('approvals.empty')}
        </Text>
      ) : null}

      {visible.map((item) => {
        const hours = hoursRemaining(item.deadline, now);
        const urgent = isUrgent(item.deadline, now);
        // An RFQ award is PROC_MANAGER's alone (§6.8); a PO approval is held by both (§6.4/§6.8).
        const canAct = item.kind === 'PO' || role === CosRole.PROC_MANAGER;
        return (
          <View key={item.key} testID={`approval-${item.key}`} style={styles.card}>
            <View style={[styles.strip, urgent && styles.stripUrgent]} />
            <View style={styles.cardBody}>
              <View style={styles.cardHead}>
                <View style={styles.refRow}>
                  <Text style={styles.ref}>{item.reference}</Text>
                  {hours !== null ? (
                    <View style={styles.timer}>
                      <MaterialIcons name="timer" size={12} color={p.warning} />
                      <Text style={styles.timerText}>
                        {hours < 0
                          ? t('approvals.overdue')
                          : t('approvals.hoursRemaining', { hours: String(hours) })}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {item.amount !== null ? (
                  <Text style={styles.amount}>
                    {formatMoney(Number(item.amount), item.currency ?? undefined)}
                  </Text>
                ) : null}
              </View>

              <View style={styles.metaRow}>
                <View style={styles.metaCol}>
                  <Text style={styles.metaLabel}>{t('approvals.vendorLabel')}</Text>
                  <Text style={styles.metaValue} numberOfLines={1}>
                    {/* An RFQ under evaluation has several bidders and the row names none of them. */}
                    {item.vendorId ?? t('approvals.multiVendor')}
                  </Text>
                </View>
                <View style={styles.metaCol}>
                  <Text style={styles.metaLabel}>{t('approvals.projectLabel')}</Text>
                  <Text style={styles.metaValue} numberOfLines={1}>
                    {item.projectId}
                  </Text>
                </View>
              </View>

              {canAct ? (
                <Pressable
                  testID={`approval-approve-${item.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('approvals.approve')} ${item.reference}`}
                  accessibilityState={{ disabled: busyKey !== null }}
                  disabled={busyKey !== null}
                  onPress={() => void approve(item)}
                  style={[styles.approve, busyKey !== null && styles.approveBusy]}
                >
                  <Text style={styles.approveText}>{t('approvals.approve')}</Text>
                </Pressable>
              ) : (
                <Text testID={`approval-readonly-${item.key}`} style={styles.readOnly}>
                  {t('approvals.awardOnly')}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.md },

    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    chip: {
      minHeight: touchTarget.secondaryButton,
      paddingHorizontal: spacing.md,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
    },
    chipOn: { backgroundColor: p.primary, borderColor: p.primary },
    chipText: {
      color: p.text,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    chipTextOn: { color: p.onPrimary },

    spinner: { marginTop: spacing.xl },
    notice: {
      marginTop: spacing.lg,
      textAlign: 'center',
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },

    card: {
      flexDirection: 'row',
      borderRadius: radius.lg,
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.border,
      overflow: 'hidden',
    },
    // The drawing's status rule down the leading edge — amber when the clock is short.
    strip: { width: 4, backgroundColor: p.primary },
    stripUrgent: { backgroundColor: p.warning },
    cardBody: { flex: 1, padding: spacing.md, gap: spacing.sm },
    cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    refRow: { flex: 1, gap: spacing.xs / 2 },
    ref: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    timer: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
    timerText: {
      color: p.warning,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    amount: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.title.fontSize,
    },

    metaRow: { flexDirection: 'row', gap: spacing.md },
    metaCol: { flex: 1 },
    metaLabel: {
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: 11,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    metaValue: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },

    approve: {
      minHeight: touchTarget.primaryButton,
      borderRadius: radius.md,
      backgroundColor: p.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    approveBusy: { opacity: 0.6 },
    approveText: {
      color: p.onPrimary,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    readOnly: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
  });
