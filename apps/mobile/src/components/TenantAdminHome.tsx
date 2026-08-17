// Tenant Admin Home — the role's landing "command view".
// Reference mockup: mockup/mobile/04_tenant_admin/01_home/01_home_dashboard/ (code.html).
//
// Rendered by (app)/home.tsx for CosRole.TENANT_ADMIN; it lives here (not under app/) because
// everything in app/ is a route and this is the Home tab's CONTENT — the shared shell owns the top
// bar + bottom nav, so this component renders sections only (matching SiteEngineerHome). It is on the
// dark palette (§32.7 "Mobile Dark Surfaces"): the 04_tenant_admin mockups are dark and the sibling
// role dashboard (SiteEngineerHome) is dark — this screen joins that exhaustive list (PO: the dark
// mockup handed for implementation is the decision; §32.7 note updated).
//
// Driven by REAL data, never mockup placeholders (ห้ามเดา):
//   - System Status  → GET /health/live liveness (checkBackendHealth). The mockup's "OPTIMAL" tier is
//     not derivable from a liveness ping, so we show Operational / Unavailable — the truth we have.
//   - Pending Approvals → the proven sibling endpoints (home.tsx principle: no new endpoint): payments
//     awaiting approval (/finance/payments?status=PENDING) + POs awaiting approval (/procurement/
//     purchase-orders?status=PENDING_APPROVAL). Both counts come from the server's `total`, never from
//     the page this screen happened to receive — see countByStatus(). The mockup's "#SYNC-4920 / 12 new
//     users" are not real records, so we show the tenant's real approval queues instead.
//   - AI Token Usage / AI Insights → GET /ai/usage (§26 metering, §31.3 >80% signal). Until the LLM
//     gateway records real consumption the figure is genuinely 0 %, never the mockup's 78 %.
//
// The FAB opens the Quick-Add menu (mockup 01_home/02_quick_action_button/01_quick_action_menu,
// <QuickAddMenu />): Force System
// Sync is wired for real; the other actions are honest first-pass placeholders (PO decision 2026-07-28).

import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { get } from '../api/client';
import { checkBackendHealth } from '../api/health';
import { getAiUsage, type AiUsage } from '../api/ai';
import { QuickAddMenu } from './QuickAddMenu';
import { LoadingBoundary } from './LoadingBoundary';
import { loadProgress } from '../lib/loadingState';
import { useT } from '../i18n';
import {
  darkColors,
  fontFamily,
  plateRadius,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../theme/tokens';

/**
 * How many rows the tenant has in `status`, ASKED OF THE SERVER.
 *
 * THESE TILES WERE COUNTING PAGE ONE, NOT COUNTING — the same defect the manager dashboard had
 * (see the note in (app)/procurement.tsx). Both endpoints paginate at 20 by default; the seeded
 * tenant holds forty-odd purchase orders and thirty-odd payments, and this screen asked for neither
 * a filter nor a second page, then filtered the page it got. "Purchase orders awaiting approval"
 * could therefore read 0 while the database held two — and, worse, read differently between runs:
 * the seed inserts every PO in ONE transaction, so `created_at DEFAULT now()` is the same
 * timestamp on all of them and the `ORDER BY created_at DESC` that decides page one has no
 * tiebreaker.
 *
 * Both endpoints take `status` and return `total`, so the figure is the tenant's. `limit: '1'` is
 * deliberate: nothing here reads the rows, only the count, so there is no reason to ship 20 of them
 * over site 3G. The array fallback is for a server that answers a bare list — then the length is
 * all there is, and it is at least a filtered one.
 */
async function countByStatus(path: string, status: string): Promise<number> {
  const res = await get<{ items?: unknown[]; total?: number } | unknown[]>(path, {
    status,
    limit: '1',
  });
  if (!Array.isArray(res) && typeof res.total === 'number') return res.total;
  return (Array.isArray(res) ? res : (res.items ?? [])).length;
}

export default function TenantAdminHome(): React.JSX.Element {
  const t = useT();
  const router = useRouter();

  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [pendingPayments, setPendingPayments] = useState<number | null>(null);
  const [pendingPos, setPendingPos] = useState<number | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  // Honest load progress: this dashboard waits on four independent KPI fetches, so the loader can
  // report how many have landed rather than sitting at one value until they all do (Rule 40).
  const [settled, setSettled] = useState(0);
  const LOAD_STEPS = 4;

  useEffect(() => {
    const usageP = getAiUsage()
      .then(setUsage)
      .catch(() => {
        /* offline / metering not yet reporting — keep null (shows "—", never a fake %) */
      });
    const healthP = checkBackendHealth()
      .then(setHealthy)
      .catch(() => setHealthy(false));
    const paymentsP = countByStatus('/finance/payments', 'PENDING')
      .then(setPendingPayments)
      .catch(() => {
        /* offline — keep last */
      });
    const posP = countByStatus('/procurement/purchase-orders', 'PENDING_APPROVAL')
      .then(setPendingPos)
      .catch(() => {
        /* offline — keep last */
      });
    // Loader clears once every KPI fetch has settled (each catch resolves, so this never hangs offline).
    // Each one also ticks the counter as it lands, which is what makes the percentage move.
    const step = <T,>(p: Promise<T>): Promise<T> => {
      void p.finally(() => setSettled((n) => n + 1));
      return p;
    };
    Promise.allSettled([step(usageP), step(healthP), step(paymentsP), step(posP)]).finally(() =>
      setLoading(false),
    );
  }, []);

  const pct = usage?.percentUsed ?? null;
  const approvalsTotal =
    pendingPayments === null && pendingPos === null
      ? null
      : (pendingPayments ?? 0) + (pendingPos ?? 0);

  const statusText =
    healthy === null
      ? t('adminHome.statusChecking')
      : healthy
        ? t('adminHome.statusOperational')
        : t('adminHome.statusUnavailable');
  const statusColor = healthy === false ? darkColors.danger : darkColors.success;

  // §31.3 insight, localised from the authoritative server band + percent (no server-side strings).
  const insightText =
    usage?.alertLevel === 'critical'
      ? t('adminHome.insightCritical', { percent: usage.percentUsed ?? 100 })
      : usage?.alertLevel === 'warning'
        ? t('adminHome.insightWarning', { percent: usage.percentUsed ?? 80 })
        : t('adminHome.insightsAllClear');

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        testID="tenant-admin-home"
      >
        <LoadingBoundary
          loading={loading}
          variant="widget"
          theme="dark"
          progress={loadProgress(settled, LOAD_STEPS) ?? undefined}
          style={styles.boundary}
        >
          {/* ── System Overview ─────────────────────────────────────────────── */}
          <Text style={styles.sectionLabel}>{t('adminHome.systemOverview')}</Text>

          {/* AI Token Usage */}
          <View style={[styles.card, styles.cardAccentCyan]} testID="admin-ai-tokens">
            <MaterialIcons
              name="bolt"
              size={40}
              color={darkColors.cyan}
              style={styles.cardWatermark}
            />
            <Text style={styles.cardLabel}>{t('adminHome.aiTokens')}</Text>
            <View style={styles.pctRow}>
              <Text style={styles.pctValue}>{pct === null ? '—' : String(Math.round(pct))}</Text>
              <Text style={styles.pctUnit}>%</Text>
            </View>
            <View style={styles.track}>
              <View
                style={[styles.trackFill, { width: `${pct === null ? 0 : Math.min(100, pct)}%` }]}
              />
            </View>
          </View>

          {/* System Status */}
          <View
            style={[styles.card, styles.cardRow, styles.cardAccentGreen]}
            testID="admin-system-status"
          >
            <View style={styles.flex1}>
              <Text style={styles.cardLabel}>{t('adminHome.systemStatus')}</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusValue, { color: statusColor }]}>{statusText}</Text>
              </View>
            </View>
            <View style={styles.iconPlate}>
              <MaterialIcons name="dns" size={22} color={statusColor} />
            </View>
          </View>

          {/* ── Pending Approvals ───────────────────────────────────────────── */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>{t('adminHome.pendingApprovals')}</Text>
            {approvalsTotal !== null ? (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>
                  {t('adminHome.itemsBadge', { count: approvalsTotal })}
                </Text>
              </View>
            ) : null}
          </View>

          <ApprovalRow
            testID="admin-approval-payments"
            icon="payments"
            tint={darkColors.warning}
            title={t('adminHome.paymentsAwaiting')}
            count={pendingPayments}
            reviewLabel={t('adminHome.review')}
            onReview={() => router.push('/payments')}
          />
          <ApprovalRow
            testID="admin-approval-pos"
            icon="receipt-long"
            tint={darkColors.primary}
            title={t('adminHome.posAwaiting')}
            count={pendingPos}
            reviewLabel={t('adminHome.review')}
            onReview={() => router.push('/orders')}
          />

          {/* ── AI Insights ─────────────────────────────────────────────────── */}
          <View
            style={[styles.card, styles.cardAccentCyan, styles.insightCard]}
            testID="admin-ai-insights"
          >
            <View style={styles.insightHead}>
              <MaterialIcons name="insights" size={18} color={darkColors.cyan} />
              <Text style={styles.insightTitle}>{t('adminHome.aiInsights')}</Text>
            </View>
            <Text style={styles.insightBody}>{insightText}</Text>
          </View>
        </LoadingBoundary>
      </ScrollView>

      <Pressable
        style={styles.fab}
        onPress={() => setQuickAddOpen(true)}
        testID="quick-add-fab"
        accessibilityRole="button"
        accessibilityLabel={t('quickAdd.fab')}
      >
        <MaterialIcons name="add" size={32} color={darkColors.onPrimary} />
      </Pressable>
      <QuickAddMenu visible={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
    </View>
  );
}

function ApprovalRow({
  testID,
  icon,
  tint,
  title,
  count,
  reviewLabel,
  onReview,
}: {
  testID: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  tint: string;
  title: string;
  count: number | null;
  reviewLabel: string;
  onReview: () => void;
}): React.JSX.Element {
  return (
    <View style={[styles.card, styles.approvalCard]} testID={testID}>
      <View style={styles.approvalLeft}>
        <View
          style={[styles.iconPlate, { backgroundColor: `${tint}22`, borderColor: `${tint}33` }]}
        >
          <MaterialIcons name={icon} size={22} color={tint} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.approvalTitle}>{title}</Text>
          <Text style={styles.approvalCount}>{count === null ? '—' : String(count)}</Text>
        </View>
      </View>
      <Pressable style={styles.reviewBtn} onPress={onReview} accessibilityRole="button">
        <Text style={styles.reviewText}>{reviewLabel}</Text>
        <MaterialIcons name="chevron-right" size={18} color={darkColors.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },
  scroll: { flex: 1 },
  // Extra bottom room so the last card clears the floating action button when scrolled to the end.
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: 96 },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: darkColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  flex1: { flex: 1 },
  // The boundary is now the ScrollView's single child, so it carries the inter-card gap the content
  // container used to apply directly.
  boundary: { gap: spacing.sm },
  sectionLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: darkColors.muted,
    marginTop: spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  countBadge: {
    backgroundColor: `${darkColors.danger}22`,
    borderRadius: 20,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  countBadgeText: { fontFamily: fontFamily.bold, fontSize: 11, color: darkColors.danger },
  card: {
    backgroundColor: darkColors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: darkColors.border,
    padding: spacing.md,
    overflow: 'hidden',
  },
  cardAccentCyan: { borderLeftWidth: 4, borderLeftColor: darkColors.cyan },
  cardAccentGreen: { borderLeftWidth: 4, borderLeftColor: darkColors.success },
  cardWatermark: { position: 'absolute', top: spacing.sm, right: spacing.sm, opacity: 0.12 },
  cardLabel: {
    fontFamily: fontFamily.medium,
    fontSize: typography.label.fontSize,
    color: darkColors.muted,
  },
  pctRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 },
  pctValue: {
    fontFamily: fontFamily.bold,
    fontSize: typography.hero.fontSize,
    lineHeight: typography.hero.lineHeight,
    color: darkColors.cyan,
  },
  pctUnit: { fontFamily: fontFamily.semibold, fontSize: 18, color: darkColors.muted },
  track: {
    height: 6,
    borderRadius: 999, // capsule end on a 6px bar — a shape, not a scale step
    backgroundColor: darkColors.elevated,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  trackFill: { height: '100%', borderRadius: 999, backgroundColor: darkColors.cyan },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusValue: { fontFamily: fontFamily.semibold, fontSize: typography.title.fontSize },
  iconPlate: {
    width: 40,
    height: 40,
    borderRadius: plateRadius(40),
    backgroundColor: darkColors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approvalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  approvalLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  approvalTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
    color: darkColors.text,
  },
  approvalCount: {
    fontFamily: fontFamily.bold,
    fontSize: typography.title.fontSize,
    color: darkColors.text,
    marginTop: 2,
  },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: touchTarget.listItem,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: `${darkColors.primary}1A`,
  },
  reviewText: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: darkColors.primary,
  },
  insightCard: { gap: 6 },
  insightHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  insightTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: darkColors.cyan,
  },
  insightBody: {
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
    color: darkColors.muted,
  },
});
