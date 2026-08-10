// QuickActionsMenu — the Site Worker Home FAB's target.
// Implements mockup/mobile/05_site_worker/01_home/02_sw_quick_actions ("Quick Action Menu").
//
// A MODAL with its own top bar, mirroring the Tenant Admin quick-command overlay
// (<QuickAddMenu />) — product-owner decision 2026-08-09, "make it like the Tenant Admin one,
// which has a close button". It was a route for one build; a route gets the app's shared TopBar,
// whose leading control is a BACK CHEVRON for child screens, and there is no close affordance in it.
// Both mockups draw this surface with an X of its own: 05_site_worker/01_home/02_sw_quick_actions puts
// `Close` at the head of its own header, and 04_tenant_admin/…/01_quick_action_menu does the same.
// A modal is what carries a bar like that, so this is one.
//
// Dark on both themes, as the admin overlay is: an overlay is not the page under it.
//
// Every card routes to a screen that already exists — this adds no capability, it shortens the path
// to the three the role uses most, in the mockup's order:
//   รายงานปัญหาด่วน        → /issues
//   เช็คลิสต์ความปลอดภัย   → /safety-checklist
//   บันทึกกิจกรรมประจำวัน  → /report
//
// Issues and Report also left the bottom bar on 2026-08-09, so this menu is their entry point.

import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useProjectStore } from '../store/projectStore';
import { MaterialIcons } from '@expo/vector-icons';
import { BrandLogo } from './BrandLogo';
import { QuickActionRow } from './QuickActionRow';
import { OverlaySyncPill } from './OverlaySyncPill';
import { useT } from '../i18n';
import { darkColors, fontFamily, spacing, touchTarget, typography } from '../theme/tokens';

type IconName = keyof typeof MaterialIcons.glyphMap;

/**
 * The three cards, in the mockup's order.
 *
 * `tone` names a DARK-PALETTE key rather than a colour, so no hex reaches the call site (§32.7).
 * They group the actions the way the admin menu's accents do: reporting a problem is the urgent one,
 * the safety check the protective one, the daily log the routine one.
 */
const ACTIONS: ReadonlyArray<{
  key: string;
  route: '/issues' | '/safety-checklist' | '/report';
  icon: IconName;
  tone: 'danger' | 'success' | 'accent';
}> = [
  { key: 'reportIssue', route: '/issues', icon: 'warning', tone: 'danger' },
  {
    key: 'safetyChecklist',
    route: '/safety-checklist',
    icon: 'health-and-safety',
    tone: 'success',
  },
  { key: 'logActivity', route: '/report', icon: 'edit-document', tone: 'accent' },
];

export function QuickActionsMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const t = useT();

  // Close BEFORE navigating: a modal left mounted over the screen it just opened swallows the first
  // tap on it, and `onRequestClose` would then pop the wrong thing.
  const activeProject = useProjectStore((s) => s.active);

  const go = (route: (typeof ACTIONS)[number]['route']): void => {
    onClose();
    router.push(route);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root} testID="quick-actions-screen">
        {/* Own top bar, matching the reference exactly: brand on the left, sync pill and close on
            the right (mockup 04_tenant_admin/…/01_quick_action_menu). */}
        <View style={styles.topbar}>
          <BrandLogo variant="dark" height={26} />
          <View style={styles.topRight}>
            <OverlaySyncPill testID="quick-actions-sync-pill" />
            <Pressable
              testID="quick-actions-close"
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('quickAdd.close')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.closeBtn}
            >
              <MaterialIcons name="close" size={24} color={darkColors.primary} />
            </Pressable>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* WHICH SITE these actions will be filed against (mockup
              05_site_worker/01_home/02_sw_quick_actions). Not a link here — this sheet is an
              overlay, and sending someone to change site from inside it would leave them somewhere
              else with the sheet gone. It is drawn only once a site is chosen. */}
          {activeProject !== null ? (
            <Text testID="quick-actions-project" style={styles.projectLine}>
              {t('project.context.on', { project: activeProject.projectName })}
            </Text>
          ) : null}
          <Text style={styles.subtitle}>{t('quickActions.subtitle')}</Text>
          {ACTIONS.map(({ key, route, icon, tone }) => (
            <QuickActionRow
              key={key}
              variant="dark"
              testID={`quick-action-${key}`}
              icon={icon}
              accent={darkColors[tone]}
              title={t(`quickActions.${key}.title`)}
              sub={t(`quickActions.${key}.body`)}
              onPress={() => go(route)}
            />
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: touchTarget.iconButton + spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: darkColors.border,
  },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  closeBtn: { padding: spacing.xs },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  projectLine: {
    color: darkColors.accent,
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: typography.body.fontSize,
    color: darkColors.muted,
  },
});
