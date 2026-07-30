// QuickAddMenu — the Tenant Admin FAB target, a full-screen "Quick Commands" overlay
// (mockup 04_tenant_admin/01_home/02_quick_action_button/01_quick_action_menu). Replaces the earlier
// bottom-sheet with the mockup's full-screen surface (top bar + close, header, action cards, a small
// stats bento).
//
// Real vs honest-placeholder policy ("ถ้าไม่รู้ ห้ามเดา"):
//   • Force System Sync   → REAL: runPushSync() then runDeltaSync() (§17.6 flush + pull).
//   • SYNCED pill         → REAL: useSyncStatus() (same source as SyncPill / the SyncStatusBar).
//   • Active Projects     → REAL: count from GET /projects/mine.
//   • System Health       → REAL: GET /health/live liveness (checkBackendHealth) shown as a status word,
//                           NOT the mockup's invented "98.4 %".
//   • Invite New User        → opens the Invite-user form. New System Integration → the connector picker.
//   • AI Report              → honest placeholder (no AI-report screen yet); the card keeps the mockup's
//     layout but drops the fabricated "94 % CONFIDENCE / Source" — no such signal exists.
// The two bento tiles lay their REAL value over a bundled photo backdrop (digital_archectural_blueprint /
// micro_server, PO decision 2026-07-29) under a dark scrim — the mockup's external stock photos, local.

import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Image,
  type ImageSourcePropType,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { runPushSync } from '../sync/runPushSync';
import { runDeltaSync } from '../sync/runDeltaSync';
import { getMyProjects } from '../api/projects';
import { checkBackendHealth } from '../api/health';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { usePendingCount } from '../hooks/usePendingCount';
import appIcon from '../../assets/icon.png';
// Bento-tile background photos (PO decision 2026-07-29).
import activeProjectsBg from '../../assets/tenant-admin/digital_archectural_blueprint.jpg';
import systemHealthBg from '../../assets/tenant-admin/micro_server.jpg';
import { useT } from '../i18n';
import { darkColors, fontFamily, spacing, touchTarget, typography } from '../theme/tokens';

type IconName = keyof typeof MaterialIcons.glyphMap;

/** SYNCED status pill for the overlay top bar — real status, shown with a glyph + label (the mockup's
 *  chip). Colour is never the only signal (§32.7): the glyph shape carries the state too. */
function StatusPill(): React.JSX.Element {
  const status = useSyncStatus();
  const pending = usePendingCount();
  const t = useT();
  const v: { icon: IconName; color: string; label: string } =
    status === 'error'
      ? { icon: 'sync-problem', color: darkColors.danger, label: t('sync.pill.error') }
      : status === 'syncing'
        ? { icon: 'sync', color: darkColors.syncing, label: t('sync.pill.syncing') }
        : pending > 0
          ? {
              icon: 'cloud-upload',
              color: darkColors.syncing,
              label: t('sync.pill.pending', { count: pending }),
            }
          : { icon: 'check-circle', color: darkColors.success, label: t('sync.pill.synced') };
  return (
    <View style={[styles.pill, { backgroundColor: `${v.color}1A` }]} testID="quick-add-sync-pill">
      <MaterialIcons name={v.icon} size={14} color={v.color} accessibilityLabel={v.label} />
      <Text style={[styles.pillText, { color: v.color }]}>{v.label.toUpperCase()}</Text>
    </View>
  );
}

export function QuickAddMenu({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const t = useT();
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [healthy, setHealthy] = useState<boolean | null>(null);

  // Load the real bento figures whenever the overlay opens (both fail soft — an honest "—" beats a
  // fabricated number).
  useEffect(() => {
    if (!visible) return;
    let active = true;
    getMyProjects()
      .then((p) => active && setProjectCount(p.length))
      .catch(() => active && setProjectCount(null));
    checkBackendHealth()
      .then((h) => active && setHealthy(h))
      .catch(() => active && setHealthy(null));
    return () => {
      active = false;
    };
  }, [visible]);

  const goInvite = (): void => {
    onClose();
    router.push('/invite-user');
  };
  const goIntegration = (): void => {
    onClose();
    router.push('/system-integration');
  };
  const goApps = (): void => {
    onClose();
    router.push('/apps-services');
  };
  const comingSoon = (): void => Alert.alert(t('quickAdd.title'), t('quickAdd.comingSoon'));
  const forceSync = (): void => {
    if (syncing) return;
    setSyncing(true);
    runPushSync()
      .catch(() => {
        /* offline / transient — the queue stays, retried on next entry */
      })
      .then(() => runDeltaSync())
      .catch(() => {
        /* offline / transient — local cache unchanged */
      })
      .finally(() => setSyncing(false));
  };

  const healthLabel =
    healthy === null
      ? t('quickAdd.healthChecking')
      : healthy
        ? t('quickAdd.healthOptimal')
        : t('quickAdd.healthDown');
  const healthColor = healthy === false ? darkColors.danger : darkColors.success;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root} testID="quick-add-menu">
        {/* Top bar */}
        <View style={styles.topbar}>
          <View style={styles.brand}>
            <Image source={appIcon} style={styles.brandIcon} resizeMode="contain" />
            <Text style={styles.wordmark}>CONSTRUCTION OS</Text>
          </View>
          <View style={styles.topRight}>
            <StatusPill />
            <Pressable
              style={styles.closeBtn}
              onPress={onClose}
              testID="quick-add-close"
              accessibilityRole="button"
              accessibilityLabel={t('quickAdd.close')}
            >
              <MaterialIcons name="close" size={24} color={darkColors.primary} />
            </Pressable>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <Text style={styles.title}>{t('quickAdd.title')}</Text>
          <Text style={styles.subtitle}>{t('quickAdd.subtitle')}</Text>

          {/* Action cards */}
          <View style={styles.cards}>
            <ActionCard
              icon="person-add"
              accent={darkColors.primary}
              title={t('quickAdd.inviteTitle')}
              sub={t('quickAdd.inviteSub')}
              onPress={goInvite}
              testID="quick-add-invite"
            />
            <ActionCard
              icon="hub"
              accent={darkColors.cyan}
              title={t('quickAdd.integrationTitle')}
              sub={t('quickAdd.integrationSub')}
              onPress={goIntegration}
              testID="quick-add-integration"
            />
            <ActionCard
              icon="grid-view"
              accent={darkColors.success}
              title={t('quickAdd.appsTitle')}
              sub={t('quickAdd.appsSub')}
              onPress={goApps}
              testID="quick-add-apps"
            />

            {/* AI Report — richer layout; NO fabricated confidence/source (honest placeholder). */}
            <Pressable
              style={styles.aiCard}
              onPress={comingSoon}
              testID="quick-add-report"
              accessibilityRole="button"
            >
              <View style={styles.aiHead}>
                <View style={[styles.iconPlate, { backgroundColor: `${darkColors.cyan}1A` }]}>
                  <MaterialIcons name="auto-awesome" size={28} color={darkColors.cyan} />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{t('quickAdd.reportTitle')}</Text>
                  <Text style={styles.aiLabel}>{t('quickAdd.reportSub')}</Text>
                </View>
              </View>
              <Text style={styles.aiDesc}>{t('quickAdd.reportDesc')}</Text>
              <View style={styles.aiCta}>
                <Text style={styles.aiCtaText}>{t('quickAdd.reportCta')}</Text>
                <MaterialIcons name="bolt" size={16} color={darkColors.primary} />
              </View>
            </Pressable>

            <ActionCard
              icon="sync"
              accent={darkColors.syncing}
              title={t('quickAdd.syncTitle')}
              sub={syncing ? t('quickAdd.syncing') : t('quickAdd.syncSub')}
              onPress={forceSync}
              busy={syncing}
              trailing="refresh"
              testID="quick-add-sync"
            />
          </View>

          {/* Stats bento — real figures over a bundled photo backdrop (PO decision 2026-07-29). */}
          <View style={styles.bento}>
            <BentoTile
              image={activeProjectsBg}
              label={t('quickAdd.activeProjects')}
              value={projectCount === null ? '—' : String(projectCount)}
              valueColor={darkColors.text}
            />
            <BentoTile
              image={systemHealthBg}
              label={t('quickAdd.systemHealth')}
              value={healthLabel}
              valueColor={healthColor}
            />
          </View>
        </ScrollView>

        {/* Bottom drag handle */}
        <View style={styles.footer}>
          <View style={styles.handle} />
        </View>
      </View>
    </Modal>
  );
}

function ActionCard({
  icon,
  accent,
  title,
  sub,
  onPress,
  busy,
  trailing = 'chevron-right',
  testID,
}: {
  icon: IconName;
  accent: string;
  title: string;
  sub: string;
  onPress: () => void;
  busy?: boolean;
  trailing?: IconName;
  testID: string;
}): React.JSX.Element {
  return (
    <Pressable
      style={[styles.card, { borderLeftColor: accent }]}
      onPress={onPress}
      disabled={busy}
      testID={testID}
      accessibilityRole="button"
    >
      <View style={[styles.iconPlate, { backgroundColor: `${accent}1A` }]}>
        {busy ? (
          <ActivityIndicator color={accent} />
        ) : (
          <MaterialIcons name={icon} size={28} color={accent} />
        )}
      </View>
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSub}>{sub}</Text>
      </View>
      <MaterialIcons name={trailing} size={22} color={darkColors.muted} />
    </Pressable>
  );
}

function BentoTile({
  image,
  label,
  value,
  valueColor,
}: {
  image: ImageSourcePropType;
  label: string;
  value: string;
  valueColor: string;
}): React.JSX.Element {
  return (
    <View style={styles.bentoTile}>
      {/* Photo banner on top (mockup: w-full h-24 rounded, dimmed to 60%), then the label + real value
          stacked below on the card surface — not overlaid on the image. */}
      <Image source={image} style={styles.bentoImage} resizeMode="cover" />
      <Text style={styles.bentoLabel}>{label}</Text>
      <Text style={[styles.bentoValue, { color: valueColor }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: darkColors.border,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1, minWidth: 0 },
  brandIcon: { width: 28, height: 28, borderRadius: 6 },
  wordmark: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    letterSpacing: 0.5,
    color: darkColors.primary,
  },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: 999,
  },
  pillText: { fontFamily: fontFamily.bold, fontSize: 10, letterSpacing: 1 },
  closeBtn: {
    width: touchTarget.iconButton,
    height: touchTarget.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -spacing.sm,
  },

  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: typography.hero.fontSize,
    lineHeight: typography.hero.lineHeight,
    color: darkColors.text,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: typography.body.fontSize,
    color: darkColors.muted,
    marginTop: 4,
    marginBottom: spacing.lg,
  },
  cards: { gap: spacing.sm },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: darkColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: darkColors.border,
    borderLeftWidth: 4,
    padding: spacing.md,
  },
  iconPlate: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
    color: darkColors.text,
  },
  cardSub: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: darkColors.muted,
    marginTop: 2,
  },

  // AI report card — taller, cyan accent, honest (no fabricated confidence/source).
  aiCard: {
    backgroundColor: darkColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: darkColors.border,
    borderLeftWidth: 4,
    borderLeftColor: darkColors.cyan,
    padding: spacing.md,
    gap: spacing.sm,
  },
  aiHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  aiLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: darkColors.cyan,
    marginTop: 2,
  },
  aiDesc: {
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
    lineHeight: 20,
    color: darkColors.muted,
  },
  aiCta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  aiCtaText: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
    color: darkColors.primary,
  },

  // Stats bento
  bento: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  bentoTile: {
    flex: 1,
    backgroundColor: darkColors.elevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: darkColors.border,
    padding: spacing.md,
    gap: 2,
  },
  // Photo banner at the top of the tile (mockup: full-width, h-24 ≈ 96, rounded, dimmed to 60%).
  bentoImage: {
    width: '100%',
    height: 96,
    borderRadius: 8,
    marginBottom: spacing.sm,
    opacity: 0.6,
  },
  bentoLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: darkColors.muted,
  },
  bentoValue: { fontFamily: fontFamily.bold, fontSize: typography.title.fontSize },

  footer: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: darkColors.border,
  },
  handle: { width: 64, height: 4, borderRadius: 2, backgroundColor: darkColors.border },
});
