// Tenant Admin Home — the role's landing "command view".
// Reference mockup: mockup/mobile/04_tenant_admin/01_home_dashboard/ (code.html).
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
//     awaiting approval (/finance/payments PENDING) + POs awaiting approval (/procurement/
//     purchase-orders PENDING_APPROVAL). The mockup's "#SYNC-4920 / 12 new users" are not real records,
//     so we show the tenant's real approval queues instead.
//   - AI Token Usage / AI Insights → GET /ai/usage (§26 metering, §31.3 >80% signal). Until the LLM
//     gateway records real consumption the figure is genuinely 0 %, never the mockup's 78 %.
//
// The FAB opens the Quick-Add menu (mockup 01_home/02_quick_add_menu, <QuickAddMenu />): Force System
// Sync is wired for real; the other actions are honest first-pass placeholders (PO decision 2026-07-28).

import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { get } from '../api/client';
import { checkBackendHealth } from '../api/health';
import { getAiUsage, type AiUsage } from '../api/ai';
import { QuickAddMenu } from './QuickAddMenu';
import { useT } from '../i18n';
import { darkColors, fontFamily, spacing, typography, touchTarget } from '../theme/tokens';

function asList<T>(res: { items?: T[] } | T[]): T[] {
  return Array.isArray(res) ? res : (res.items ?? []);
}

export default function TenantAdminHome(): React.JSX.Element {
  const t = useT();
  const router = useRouter();

  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [pendingPayments, setPendingPayments] = useState<number | null>(null);
  const [pendingPos, setPendingPos] = useState<number | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  useEffect(() => {
    getAiUsage()
      .then(setUsage)
      .catch(() => {
        /* offline / metering not yet reporting — keep null (shows "—", never a fake %) */
      });
    checkBackendHealth()
      .then(setHealthy)
      .catch(() => setHealthy(false));
    get<{ items?: { status: string }[] } | { status: string }[]>('/finance/payments')
      .then((res) => setPendingPayments(asList(res).filter((p) => p.status === 'PENDING').length))
      .catch(() => {
        /* offline — keep last */
      });
    get<{ items?: { status: string }[] } | { status: string }[]>('/procurement/purchase-orders')
      .then((res) =>
        setPendingPos(asList(res).filter((p) => p.status === 'PENDING_APPROVAL').length),
      )
      .catch(() => {
        /* offline — keep last */
      });
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
    borderRadius: 12,
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
    borderRadius: 3,
    backgroundColor: darkColors.elevated,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  trackFill: { height: '100%', borderRadius: 3, backgroundColor: darkColors.cyan },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusValue: { fontFamily: fontFamily.semibold, fontSize: typography.title.fontSize },
  iconPlate: {
    width: 40,
    height: 40,
    borderRadius: 10,
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
    borderRadius: 8,
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
