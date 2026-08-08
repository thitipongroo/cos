// Quick actions — the menu the Site Worker Home's FAB opens.
// Implements mockup/mobile/05_site_worker/01_home/02_quick_actions ("Quick Action Menu").
//
// A SCREEN, not a modal or a bottom sheet: the mockup draws it as a full page with its own top bar,
// and §32.7 keeps modals for things that interrupt (confirmations, pickers) rather than for a menu
// the worker chose to open. Being a route also gives it a breadcrumb and a back chevron for free,
// and lets `router.push('/quick-actions')` be linked from anywhere later.
//
// Every card routes to a screen that already exists — this adds no capability, it shortens the path
// to three the role uses most. The three, and their order, are the mockup's:
//   รายงานปัญหาด่วน        → /issues
//   เช็คลิสต์ความปลอดภัย   → /safety-checklist
//   บันทึกกิจกรรมประจำวัน  → /report
//
// These are the same three the Home screen used to carry as inline tiles; the 2026-08-08 mockup
// restructure moved them behind the FAB, which is why Home no longer renders <QuickActionCard />.

import { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useT } from '../../i18n';
import { fontFamily, plateRadius, radius, spacing, typography } from '../../theme/tokens';
import { usePalette, type Palette } from '../../theme/usePalette';

type IconName = keyof typeof MaterialIcons.glyphMap;

/**
 * The three cards, in the mockup's order. `tone` picks the glyph colour from the palette — the
 * mockup tints each icon differently (danger, safety, neutral) and the plate behind it follows.
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

const PLATE = 48;

export default function QuickActionsScreen() {
  const router = useRouter();
  const t = useT();
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);

  return (
    <ScrollView
      testID="quick-actions-screen"
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={styles.page}
    >
      {/* No in-content title: the breadcrumb already reads HOME › QUICK ACTIONS (§32.7). */}
      {ACTIONS.map(({ key, route, icon, tone }) => {
        const color = tone === 'danger' ? p.danger : tone === 'success' ? p.success : p.accent;
        return (
          <TouchableOpacity
            key={key}
            testID={`quick-action-${key}`}
            accessibilityRole="button"
            accessibilityLabel={t(`quickActions.${key}.title`)}
            accessibilityHint={t(`quickActions.${key}.body`)}
            onPress={() => router.push(route)}
            style={styles.card}
          >
            <View style={[styles.plate, { backgroundColor: p.elevated }]}>
              <MaterialIcons name={icon} size={24} color={color} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{t(`quickActions.${key}.title`)}</Text>
              <Text style={styles.cardText}>{t(`quickActions.${key}.body`)}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={p.muted} />
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      backgroundColor: p.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
    },
    plate: {
      width: PLATE,
      height: PLATE,
      borderRadius: plateRadius(PLATE),
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardBody: { flex: 1, gap: 2 },
    cardTitle: {
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.text,
    },
    cardText: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
    },
  });
