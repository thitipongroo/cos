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
// exists on the server, but no route in this app renders it. Same treatment as the Support Center's
// search and the Directory's chat button.
//
// The AI panel is <ProcurementInsight />, which is per-project because its endpoint is — hence the
// picker above it (PO decision 2026-08-10).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { LoadingState } from '../../components/LoadingState';
import { loadProgress } from '../../lib/loadingState';
import { useRouter } from 'expo-router';
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
import { getMyProjects, refreshProjectsCache } from '../../api/projects';
import { openRfqCount, OPEN_RFQ_STATUS } from '../../lib/procurementKpi';
import { waitingAge } from '../../lib/waitingAge';
import { ProcurementInsight } from '../../components/ProcurementInsight';
import { useT } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette, type Palette, useIsDark } from '../../theme/usePalette';

interface DeliveryRow {
  delivered_at: string;
}

interface RfqRow {
  status: string;
}

/** Normalise a list endpoint that may return `T[]` or `{ items: T[] }`. */
function asList<T>(res: { items?: T[] } | T[]): T[] {
  return Array.isArray(res) ? res : (res.items ?? []);
}

export default function ProcurementScreen(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(p), [p]);

  // The offline project cache, for turning an order's `project_id` into the name a manager knows.
  const projects = useCollection<Project>('local_projects');

  const [pos, setPos] = useState<PurchaseOrderRow[]>([]);
  const [activeRfqs, setActiveRfqs] = useState<number | null>(null);
  const [deliveriesToday, setDeliveriesToday] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  // Honest load progress: three independent fetches, counted as each lands (Rule 40).
  const [settled, setSettled] = useState(0);
  const LOAD_STEPS = 3;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [insightProject, setInsightProject] = useState('');
  const [insightProjectName, setInsightProjectName] = useState<string | undefined>(undefined);
  // Where the Pending Approvals section starts, so the counter above can scroll to it.
  const [approvalsY, setApprovalsY] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setSettled(0);
    // Refreshed here too, not only on Home: this tab names each order's project from that cache, and
    // a manager who opens Procurement first would otherwise read UUIDs until they visited Home.
    refreshProjectsCache().catch(() => {
      /* offline — the cached names, if any, still resolve */
    });
    // The panel's project: the first of the manager's OWN projects (not the tenant-wide cache the
    // order names come from), set once so a refresh cannot move the report under the reader.
    getMyProjects()
      .then((mine) => {
        setInsightProject((current) => (current === '' ? (mine[0]?.project_id ?? '') : current));
        setInsightProjectName((current) => current ?? mine[0]?.project_name);
      })
      .catch(() => {
        /* offline — the panel stays on its idle line */
      });
    const today = new Date().toDateString();
    const approvals = fetchPendingApprovals()
      .then(({ pos: rows }) => setPos(rows))
      .catch(() => setPos([]));
    // THESE TWO WERE COUNTING PAGE ONE, NOT COUNTING. Both endpoints paginate at 20 by default, the
    // tenant has forty-odd rows in each, and the app asked for neither a filter nor a second page —
    // so "Active RFQs" and "Deliveries today" read 0 while the database held three open RFQs and
    // two of today's deliveries. A counter computed over the first page of N is not a count.
    //
    // RFQs are counted BY THE SERVER: the endpoint takes `status` and returns `total`, so the
    // figure is the tenant's, not this page's.
    const rfqs = get<{ items?: RfqRow[]; total?: number } | RfqRow[]>('/procurement/rfqs', {
      status: OPEN_RFQ_STATUS,
      limit: '100',
    })
      .then((res) =>
        setActiveRfqs(
          !Array.isArray(res) && typeof res.total === 'number'
            ? res.total
            : openRfqCount(asList(res)),
        ),
      )
      .catch(() => {
        /* offline — keep last */
      });
    // Deliveries have no "today" filter on the server, so the rows come back and the date is applied
    // here — but across every page, not just the first.
    const deliveries = (async () => {
      const rows: DeliveryRow[] = [];
      for (let page = 1; page <= 10; page++) {
        const res = await get<{ items?: DeliveryRow[] } | DeliveryRow[]>(
          '/procurement/deliveries',
          { page: String(page), limit: '100' },
        );
        const items = asList(res);
        rows.push(...items);
        if (items.length < 100) break;
      }
      setDeliveriesToday(
        rows.filter((d) => new Date(d.delivered_at).toDateString() === today).length,
      );
    })().catch(() => {
      /* offline — keep last */
    });
    const step = <T,>(p: Promise<T>): Promise<T> => {
      void p.finally(() => setSettled((n) => n + 1));
      return p;
    };
    await Promise.allSettled([step(approvals), step(rfqs), step(deliveries)]);
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

  // Plain counting numbers — 0, 1, 2 (PO decision 2026-08-10). The drawing zero-pads ("08", "12"),
  // which reads as a code rather than a quantity when the real figures are single digits.
  const n = (v: number | null): string => (v === null ? '—' : String(v));

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
      ref={scrollRef}
      testID="procurement-screen"
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={styles.page}
    >
      {/* The drawing's three counters, each with its own accent rule.
          THE CHEVRON IS ON THE TWO THAT OPEN SOMETHING. Active RFQs and Deliveries today have list
          screens this role may read (§6.4 gives PROJECT_MANAGER R on both); Pending approvals does
          not need one — the queue it counts is drawn directly below it on this same screen, so a
          chevron there would point at what the reader is already looking at. */}
      <View style={styles.statRow}>
        <Pressable
          testID="stat-pending-approvals"
          accessibilityRole="button"
          accessibilityLabel={t('pm.procurement.pendingApprovals')}
          // The queue it counts is on THIS screen, so the chevron takes the reader to it rather than
          // to a filtered list that does not exist. Measured, not guessed at: `approvalsY` is the
          // section's own onLayout position.
          onPress={() => scrollRef.current?.scrollTo({ y: approvalsY, animated: true })}
          style={[styles.stat, { borderLeftColor: p.warning }]}
        >
          <MaterialIcons
            name="chevron-right"
            size={16}
            color={p.muted}
            style={styles.statChevron}
          />
          <Text style={[styles.statValue, { color: p.warning }]}>{n(pos.length)}</Text>
          <Text style={styles.statLabel}>{t('pm.procurement.pendingApprovals')}</Text>
        </Pressable>
        <Pressable
          testID="stat-active-rfqs"
          accessibilityRole="button"
          accessibilityLabel={t('pm.procurement.activeRfqs')}
          onPress={() => router.push('/rfqs')}
          style={[styles.stat, { borderLeftColor: p.primary }]}
        >
          <MaterialIcons
            name="chevron-right"
            size={16}
            color={p.muted}
            style={styles.statChevron}
          />
          <Text style={[styles.statValue, { color: p.primary }]}>{n(activeRfqs)}</Text>
          <Text style={styles.statLabel}>{t('pm.procurement.activeRfqs')}</Text>
        </Pressable>
        <Pressable
          testID="stat-deliveries-today"
          accessibilityRole="button"
          accessibilityLabel={t('pm.procurement.todayDeliveries')}
          onPress={() => router.push('/deliveries')}
          style={[styles.stat, { borderLeftColor: p.success }]}
        >
          <MaterialIcons
            name="chevron-right"
            size={16}
            color={p.muted}
            style={styles.statChevron}
          />
          <Text style={[styles.statValue, { color: p.success }]}>{n(deliveriesToday)}</Text>
          <Text style={styles.statLabel}>{t('pm.procurement.todayDeliveries')}</Text>
        </Pressable>
      </View>

      {/* NO PROJECT PICKER (PO decision 2026-08-11, as on Home). The drawing has none, and a strip
          of project codes above the panel made the screen ask which project before it would say
          anything. The report endpoint still needs one, so the panel reports on the first of the
          manager's own projects and NAMES it on its Source line — the picker existed to stop one
          project's findings reading as a portfolio-wide statement, and being named does that. */}
      <ProcurementInsight projectId={insightProject} projectLabel={insightProjectName} />

      <View style={styles.sectionHead} onLayout={(e) => setApprovalsY(e.nativeEvent.layout.y)}>
        <View style={styles.sectionTitleRow}>
          <MaterialIcons name="fact-check" size={20} color={p.warning} />
          <Text style={styles.sectionTitle}>{t('pm.procurement.pendingApprovals')}</Text>
        </View>
        {/* The drawing's "View All". It opens `/orders` — the purchase-order LIST, which is what
            "all" means here: this section shows only the ones in PENDING_APPROVAL. */}
        <Pressable
          testID="approvals-view-all"
          accessibilityRole="button"
          accessibilityLabel={t('pm.procurement.viewAll')}
          onPress={() => router.push('/orders')}
          style={styles.viewAll}
        >
          <Text style={styles.viewAllText}>{t('pm.procurement.viewAll')}</Text>
        </Pressable>
      </View>

      {loading ? (
        <LoadingState
          testID="procurement-loading"
          variant="list"
          theme={isDark ? 'dark' : 'light'}
          progress={loadProgress(settled, LOAD_STEPS) ?? undefined}
        />
      ) : null}

      {!loading && pos.length === 0 ? (
        <Text testID="procurement-empty" style={styles.notice}>
          {t('pm.procurement.noneWaiting')}
        </Text>
      ) : null}

      {pos.map((po) => (
        <View key={po.po_id} testID={`approval-${po.po_id}`} style={styles.card}>
          <View style={[styles.cardStrip, { backgroundColor: p.warning }]} />
          <View style={styles.cardBody}>
            <Pressable
              testID={`approval-open-${po.po_id}`}
              accessibilityRole="button"
              accessibilityLabel={`${t('approvals.viewDetails')} ${po.po_number}`}
              onPress={() => Alert.alert(t('approvals.viewDetails'), t('more.comingSoon'))}
              style={styles.cardHead}
            >
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
              <MaterialIcons name="chevron-right" size={20} color={p.muted} />
            </Pressable>
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

    sectionHead: {
      marginTop: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    // Absolutely positioned so it sits in the tile's top-right, as the drawing places it, without
    // taking a row from the figure below.
    statChevron: { position: 'absolute', top: spacing.xs, right: spacing.xs / 2 },
    viewAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    viewAllText: {
      color: p.primary,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
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
