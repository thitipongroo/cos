// QuickAddMenu — the Tenant Admin FAB target (mockup 04_tenant_admin/00_home/02_quick_add_menu).
// A dark bottom-sheet of quick actions. Only real, wired actions do real work; the rest are honest
// placeholders (PO-approved first pass) rather than dead buttons:
//   • Invite New User        → opens the Users tab (its Invite is itself a first-pass placeholder)
//   • New System Integration → placeholder (no mobile integrations surface yet)
//   • Generate Usage Report  → placeholder (AI report generation is not a mobile screen)
//   • Force System Sync      → REAL: runPushSync() then runDeltaSync() (§17.6 flush + pull)

import { useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { runPushSync } from '../sync/runPushSync';
import { runDeltaSync } from '../sync/runDeltaSync';
import { useT } from '../i18n';
import { darkColors, fontFamily, spacing, touchTarget, typography } from '../theme/tokens';

type IconName = keyof typeof MaterialIcons.glyphMap;

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

  const goInvite = (): void => {
    onClose();
    router.push('/users');
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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          style={styles.backdropTap}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('quickAdd.close')}
        />
        <View style={styles.sheet} testID="quick-add-menu">
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{t('quickAdd.title')}</Text>
              <Text style={styles.subtitle}>{t('quickAdd.subtitle')}</Text>
            </View>
            <Pressable
              style={styles.closeBtn}
              onPress={onClose}
              testID="quick-add-close"
              accessibilityRole="button"
              accessibilityLabel={t('quickAdd.close')}
            >
              <MaterialIcons name="close" size={24} color={darkColors.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
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
              onPress={comingSoon}
              testID="quick-add-integration"
            />
            <ActionCard
              icon="auto-awesome"
              accent={darkColors.cyan}
              title={t('quickAdd.reportTitle')}
              sub={t('quickAdd.reportSub')}
              onPress={comingSoon}
              testID="quick-add-report"
            />
            <ActionCard
              icon="sync"
              accent={darkColors.syncing}
              title={t('quickAdd.syncTitle')}
              sub={syncing ? t('quickAdd.syncing') : t('quickAdd.syncSub')}
              onPress={forceSync}
              busy={syncing}
              testID="quick-add-sync"
            />
          </ScrollView>
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
  testID,
}: {
  icon: IconName;
  accent: string;
  title: string;
  sub: string;
  onPress: () => void;
  busy?: boolean;
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
      <MaterialIcons name="chevron-right" size={22} color={darkColors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(2, 6, 23, 0.82)', justifyContent: 'flex-end' },
  backdropTap: { flex: 1 },
  sheet: {
    maxHeight: '82%',
    backgroundColor: darkColors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: darkColors.border,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  headerText: { flex: 1 },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: typography.hero.fontSize,
    lineHeight: typography.hero.lineHeight,
    color: darkColors.text,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
    color: darkColors.muted,
    marginTop: 2,
  },
  closeBtn: {
    width: touchTarget.iconButton,
    height: touchTarget.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm },
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
    fontSize: typography.label.fontSize,
    color: darkColors.muted,
    marginTop: 2,
  },
});
