// QuickAddMenu — the Tenant Admin FAB target, a full-screen "Quick Commands" overlay
// (mockup 04_tenant_admin/01_home/02_quick_action_button/01_quick_action_menu). Replaces the earlier
// bottom-sheet with the mockup's full-screen surface (top bar + close, header, action cards, a small
// stats bento).
//
// The action cards are <QuickActionRow />, the project's quick-action button. It WAS this file's
// private `ActionCard`; it moved out on 2026-08-09 when the Site Worker's menu was told to match
// this one (PO decision), because two menus drawing the same button two ways is a copy waiting to
// drift. `variant="dark"` because this surface is a modal that stays dark on both themes.
//
// Real vs honest-placeholder policy ("ถ้าไม่รู้ ห้ามเดา"):
//   • Force System Sync   → REAL: runSyncCycle() — push then pull (§17.6 flush + pull).
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
  StyleSheet,
  Alert,
  Image,
  type ImageSourcePropType,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { runSyncCycle } from '../sync/syncRunner';
import { getMyProjects } from '../api/projects';
import { checkBackendHealth } from '../api/health';
import { BrandLogo } from './BrandLogo';
import { QuickActionRow } from './QuickActionRow';
import { OverlaySyncPill } from './OverlaySyncPill';
// Bento-tile background photos (PO decision 2026-07-29).
import activeProjectsBg from '../../assets/tenant-admin/digital_archectural_blueprint.jpg';
import systemHealthBg from '../../assets/tenant-admin/micro_server.jpg';
import { useT } from '../i18n';
import { darkScreen } from '../theme/screenStyles';
import {
  darkColors,
  fontFamily,
  plateRadius,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../theme/tokens';

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
    // Same single entry point the shell, the reconnect listener and the background job use, so a
    // manual sync cannot race one of those (runSyncCycle joins an in-flight cycle rather than
    // starting a second). It never rejects — the outcome is reported through syncStore/<SyncPill />.
    void runSyncCycle().finally(() => setSyncing(false));
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
      <View style={darkScreen.root} testID="quick-add-menu">
        {/* Top bar */}
        <View style={styles.topbar}>
          <View style={styles.brand}>
            <BrandLogo variant="dark" height={26} />
          </View>
          <View style={styles.topRight}>
            <OverlaySyncPill testID="quick-add-sync-pill" />
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
          {/* NO HEADER LINE AT ALL. The "Quick Commands" title went on 2026-07-31 (the wordmark
              above already identifies the overlay) and the "Choose an action to create or update"
              subtitle that inherited its job went on 2026-08-11 (PO decision), for the reason the
              sibling <QuickActionsMenu /> already records: five labelled cards under a sheet the
              user opened deliberately do not need to be told what they are. The `quickAdd.subtitle`
              key was deleted with it in both locales rather than left orphaned. */}

          {/* Action cards */}
          <View style={styles.cards}>
            <QuickActionRow
              variant="dark"
              icon="person-add"
              accent={darkColors.primary}
              title={t('quickAdd.inviteTitle')}
              sub={t('quickAdd.inviteSub')}
              onPress={goInvite}
              testID="quick-add-invite"
            />
            <QuickActionRow
              variant="dark"
              icon="hub"
              accent={darkColors.cyan}
              title={t('quickAdd.integrationTitle')}
              sub={t('quickAdd.integrationSub')}
              onPress={goIntegration}
              testID="quick-add-integration"
            />
            <QuickActionRow
              variant="dark"
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
                <View style={[styles.aiPlate, { backgroundColor: `${darkColors.cyan}1A` }]}>
                  <MaterialIcons name="auto-awesome" size={28} color={darkColors.cyan} />
                </View>
                <View style={styles.aiText}>
                  <Text style={styles.aiTitle}>{t('quickAdd.reportTitle')}</Text>
                  <Text style={styles.aiLabel}>{t('quickAdd.reportSub')}</Text>
                </View>
              </View>
              <Text style={styles.aiDesc}>{t('quickAdd.reportDesc')}</Text>
              <View style={styles.aiCta}>
                <Text style={styles.aiCtaText}>{t('quickAdd.reportCta')}</Text>
                <MaterialIcons name="bolt" size={16} color={darkColors.primary} />
              </View>
            </Pressable>

            <QuickActionRow
              variant="dark"
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
  brandIcon: { width: 28, height: 28, borderRadius: plateRadius(28) },
  wordmark: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    letterSpacing: 0.5,
    color: darkColors.primary,
  },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  closeBtn: {
    width: touchTarget.iconButton,
    height: touchTarget.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -spacing.sm,
  },

  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  cards: { gap: spacing.sm },

  // The AI report card is the one action here that is NOT a <QuickActionRow /> — it carries a
  // description and its own CTA — so it keeps a private plate and text block. Same 48px plate as the
  // shared row, deliberately: the two sit in one list and a different size would read as a mistake.
  aiPlate: {
    width: 48,
    height: 48,
    borderRadius: plateRadius(48),
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiText: { flex: 1, minWidth: 0 },
  aiTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
    color: darkColors.text,
  },

  // AI report card — taller, cyan accent, honest (no fabricated confidence/source).
  aiCard: {
    backgroundColor: darkColors.surface,
    borderRadius: radius.lg,
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
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: darkColors.border,
    padding: spacing.md,
    gap: 2,
  },
  // Photo banner at the top of the tile (mockup: full-width, h-24 ≈ 96, rounded, dimmed to 60%).
  bentoImage: {
    width: '100%',
    height: 96,
    borderRadius: radius.lg,
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
  handle: { width: 64, height: 4, borderRadius: radius.sm, backgroundColor: darkColors.border },
});
