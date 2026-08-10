// Procurement — the Project Manager's second tab (mockup 06_project_manager/02_procurement).
//
// This file used to be a read-only purchase-order list. The corrected mockup set (2026-08-10) makes
// it the role's procurement DASHBOARD: three counters, the AI analysis panel, and the approvals the
// manager is actually being asked to decide. The approvals list arrived here from `approvals.tsx`,
// built a few days earlier against a mockup set the product owner then replaced — the screen moved,
// the work did not have to be redone (PO decision 2026-08-10).
//
// EVERY COUNTER IS A REAL QUERY, none is a badge:
//   - Pending approvals — purchase orders in PENDING_APPROVAL, the same rows the list below shows.
//   - Active RFQs — RFQs in PUBLISHED, the state where bids can still arrive (lib/procurementKpi.ts).
//   - Deliveries today — delivery rows whose `delivered_at` falls on the device's current date.
//
// THE APPROVE BUTTON sends tier PM: §6.4 grants PROJECT_MANAGER `A` on purchase orders, and the
// workflow collects one signal per required tier (≤ ฿50,000 → PM alone; ฿50,001–500,000 → PM +
// FINANCE; > ฿500,000 → + EXECUTIVE, spec §15.5). It is not queued offline — a financial mutation is
// online-required (§17.4), so a failure means nothing was recorded and the screen says so.
//
// REVIEW is drawn and reports that there is no detail screen yet: `/procurement/purchase-orders/{id}`
// exists on the server, but no route in this app renders it. Same treatment as the Support Centre's
// search and the Directory's chat button.
//
// The AI panel is <ProcurementInsight />, which is per-project because its endpoint is — hence the
// picker above it (PO decision 2026-08-10).

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
import { formatMoney } from '@cos/financial';
import { get } from '../../api/client';
import {
  fetchPendingApprovals,
  approvePurchaseOrder,
  type PurchaseOrderRow,
} from '../../api/procurement';
import { useCollection } from '../../hooks/useCollection';
import type { Project } from '../../db/database';
import { refreshProjectsCache } from '../../api/projects';
import { openRfqCount } from '../../lib/procurementKpi';
import { waitingAge } from '../../lib/waitingAge';
import { ProjectPicker } from '../../components/ProjectPicker';
import { ProcurementInsight } from '../../components/ProcurementInsight';
import { useT } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette, type Palette } from '../../theme/usePalette';

interface DeliveryRow {
  delivered_at: string;
}

/** Normalise a list endpoint that may return `T[]` or `{ items: T[] }`. */
function asList<T>(res: { items?: T[] } | T[]): T[] {
  return Array.isArray(res) ? res : (res.items ?? []);
}

export default function ProcurementScreen(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);

  // The offline project cache, for turning an order's `project_id` into the name a manager knows.
  const projects = useCollection<Project>('local_projects');

  const [pos, setPos] = useState<PurchaseOrderRow[]>([]);
  const [activeRfqs, setActiveRfqs] = useState<number | null>(null);
  const [deliveriesToday, setDeliveriesToday] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [insightProject, setInsightProject] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    // Refreshed here too, not only on Home: this tab names each order's project from that cache, and
    // a manager who opens Procurement first would otherwise read UUIDs until they visited Home.
    refreshProjectsCache().catch(() => {
      /* offline — the cached names, if any, still resolve */
    });
    const today = new Date().toDateString();
    const approvals = fetchPendingApprovals()
      .then(({ pos: rows }) => setPos(rows))
      .catch(() => setPos([]));
    const rfqs = get<{ items?: { status: string }[] } | { status: string }[]>('/procurement/rfqs')
      .then((res) => setActiveRfqs(openRfqCount(asList(res))))
      .catch(() => {
        /* offline — keep last */
      });
    const deliveries = get<{ items?: DeliveryRow[] } | DeliveryRow[]>('/procurement/deliveries')
      .then((res) =>
        setDeliveriesToday(
          asList(res).filter((d) => new Date(d.delivered_at).toDateString() === today).length,
        ),
      )
      .catch(() => {
        /* offline — keep last */
      });
    await Promise.allSettled([approvals, rfqs, deliveries]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // One clock per render, so two cards a millisecond apart cannot disagree about "now".
  const now = useMemo(() => new Date(), [pos]);

  const approve = useCallback(
    async (po: PurchaseOrderRow) => {
      setBusyId(po.po_id);
      try {
        await approvePurchaseOrder(po.po_id, 'PM');
        Alert.alert(t('approvals.approved'), po.po_number);
        await load();
      } catch {
        Alert.alert(t('approvals.approveFailed'), po.po_number);
      } finally {
        setBusyId(null);
      }
    },
    [t, load],
  );

  const n = (v: number | null): string => (v === null ? '—' : String(v).padStart(2, '0'));

  /**
   * The project an order belongs to, by name.
   *
   * A purchase order carries only `project_id`, and the first capture of this screen photographed
   * that raw UUID under each PO number — thirty-six characters of noise in the slot the mockup uses
   * for the project. The offline project cache already holds the names, so this reads them from
   * there. An id the cache has not seen falls back to the id itself rather than to an empty line:
   * an unfamiliar identifier is still more than nothing when someone is deciding on money.
   */
  const projectName = (projectId: string): string =>
    projects.find((project) => project.projectId === projectId)?.projectName ?? projectId;

  const ageLabel = (po: PurchaseOrderRow): string | null => {
    const age = waitingAge(po.updated_at, now);
    if (age === null) return null;
    const value =
      age.unit === 'now'
        ? t('pm.procurement.justNow')
        : age.unit === 'hours'
          ? t('pm.procurement.hoursAgo', { hours: String(age.value) })
          : t('pm.procurement.daysAgo', { days: String(age.value) });
    return t('pm.procurement.waiting', { age: value });
  };

  return (
    <ScrollView
      testID="procurement-screen"
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={styles.page}
    >
      {/* The drawing's three counters, each with its own accent rule. */}
      <View style={styles.statRow}>
        <View testID="stat-pending-approvals" style={[styles.stat, { borderLeftColor: p.warning }]}>
          <Text style={[styles.statValue, { color: p.warning }]}>{n(pos.length)}</Text>
          <Text style={styles.statLabel}>{t('pm.procurement.pendingApprovals')}</Text>
        </View>
        <View testID="stat-active-rfqs" style={[styles.stat, { borderLeftColor: p.primary }]}>
          <Text style={[styles.statValue, { color: p.primary }]}>{n(activeRfqs)}</Text>
          <Text style={styles.statLabel}>{t('pm.procurement.activeRfqs')}</Text>
        </View>
        <View testID="stat-deliveries-today" style={[styles.stat, { borderLeftColor: p.success }]}>
          <Text style={[styles.statValue, { color: p.success }]}>{n(deliveriesToday)}</Text>
          <Text style={styles.statLabel}>{t('pm.procurement.todayDeliveries')}</Text>
        </View>
      </View>

      <ProjectPicker selectedId={insightProject} onSelect={setInsightProject} />
      <ProcurementInsight projectId={insightProject} />

      <View style={styles.sectionHead}>
        <View style={styles.sectionTitleRow}>
          <MaterialIcons name="fact-check" size={20} color={p.warning} />
          <Text style={styles.sectionTitle}>{t('pm.procurement.pendingApprovals')}</Text>
        </View>
      </View>

      {loading ? <ActivityIndicator testID="procurement-loading" color={p.primary} /> : null}

      {!loading && pos.length === 0 ? (
        <Text testID="procurement-empty" style={styles.notice}>
          {t('pm.procurement.noneWaiting')}
        </Text>
      ) : null}

      {pos.map((po) => (
        <View key={po.po_id} testID={`approval-${po.po_id}`} style={styles.card}>
          <View style={[styles.cardStrip, { backgroundColor: p.warning }]} />
          <View style={styles.cardBody}>
            <View style={styles.cardHead}>
              <View style={styles.cardTitleBlock}>
                <Text style={styles.cardTitle}>{po.po_number}</Text>
                <Text style={styles.cardSub} numberOfLines={1}>
                  {projectName(po.project_id)}
                </Text>
              </View>
              <View style={styles.cardAmountBlock}>
                <Text style={styles.cardAmount}>
                  {formatMoney(Number(po.total_amount), po.currency_code)}
                </Text>
                {ageLabel(po) !== null ? <Text style={styles.cardAge}>{ageLabel(po)}</Text> : null}
              </View>
            </View>
            <View style={styles.cardActions}>
              <Pressable
                testID={`approval-review-${po.po_id}`}
                accessibilityRole="button"
                accessibilityLabel={`${t('approvals.viewDetails')} ${po.po_number}`}
                onPress={() => Alert.alert(t('approvals.viewDetails'), t('more.comingSoon'))}
                style={styles.reviewButton}
              >
                <Text style={styles.reviewText}>{t('approvals.viewDetails')}</Text>
              </Pressable>
              <Pressable
                testID={`approval-approve-${po.po_id}`}
                accessibilityRole="button"
                accessibilityLabel={`${t('approvals.approve')} ${po.po_number}`}
                accessibilityState={{ disabled: busyId !== null }}
                disabled={busyId !== null}
                onPress={() => void approve(po)}
                style={[styles.approveButton, busyId !== null && styles.busy]}
              >
                <Text style={styles.approveText}>{t('approvals.approve')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.md },

    statRow: { flexDirection: 'row', gap: spacing.sm },
    stat: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xs,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      backgroundColor: p.surface,
      gap: spacing.xs / 2,
    },
    statValue: {
      fontFamily: fontFamily.semibold,
      fontSize: typography.hero.fontSize,
      lineHeight: typography.hero.lineHeight,
    },
    statLabel: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: 10,
      letterSpacing: 0.5,
      textAlign: 'center',
      textTransform: 'uppercase',
    },

    sectionHead: { marginTop: spacing.sm },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    sectionTitle: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    notice: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      textAlign: 'center',
      marginTop: spacing.md,
    },

    card: {
      flexDirection: 'row',
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      overflow: 'hidden',
    },
    cardStrip: { width: 4 },
    cardBody: { flex: 1, padding: spacing.md, gap: spacing.sm },
    cardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
    cardTitleBlock: { flex: 1, gap: spacing.xs / 4 },
    cardTitle: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
    },
    cardSub: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    cardAmountBlock: { alignItems: 'flex-end', gap: spacing.xs / 4 },
    cardAmount: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
    },
    cardAge: {
      color: p.warning,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },

    cardActions: { flexDirection: 'row', gap: spacing.sm },
    reviewButton: {
      flex: 1,
      minHeight: touchTarget.secondaryButton,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    reviewText: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    approveButton: {
      flex: 1,
      minHeight: touchTarget.secondaryButton,
      borderRadius: radius.md,
      backgroundColor: p.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    busy: { opacity: 0.6 },
    approveText: {
      color: p.onPrimary,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
  });
