// More — the Project Manager's fourth tab (mockup 06_project_manager/04_more_option).
//
// The drawing is a profile card, an AI Intelligence widget and six menu tiles. Two of those three
// arrive here; the third is deliberately absent and the reason is below.
//
// WHAT THE TILES ACTUALLY REACH. Only two of the six have a screen behind them today:
//   - "Contractor performance" opens the vendor directory (app/(app)/vendors.tsx), which is exactly
//     what the drawing's own subtitle promises — trust scores and delivery reliability.
//   - "Budget analysis" opens app/(app)/budget.tsx. The drawing labels this tile "วิเคราะห์ต้นทุน &
//     BOQ"; there is NO BOQ screen in this app, so the title and subtitle here say budget, which is
//     what the tile opens. §6.4 does grant PROJECT_MANAGER `RW` on BOQ — the right exists, the
//     screen does not, and naming a destination the app cannot reach would be the worse of the two.
// The other four are drawn and say plainly that the screen does not exist yet — the treatment the
// Support Center's search, the Directory's chat button and the Terms download already use. They are
// not silently dropped: a tile that vanishes tells a reader the feature was never planned.
//
// THE AI WIDGET CALLS EXECUTIVE_SUMMARY (PO decision 2026-08-10, after the question was escalated).
// The drawing's panel reports "Project Health: …" and "Risk Alert: …" at CONF 98%, which is that
// report type's own shape — `executive_summary` + `risk_flags` + `recommendations`. The alternative
// considered was `/ai/reports/delay-risk`, and it was rejected on its schema: DelayRiskOutput's first
// string field is `delay_risk_level`, so the shared panel would print the word "HIGH" where the
// drawing shows a paragraph. It is the same <PortfolioInsight /> the Finance tab renders, under the
// drawing's own heading.
//
// The identity block reads from the session rather than the drawing: the drawing shows a fixed name
// and "Project Manager • Skybridge Central", so the project half comes from the picked project and is
// absent — stated as absent — until one is chosen.

import { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Avatar } from '../../components/Avatar';
import { ProjectPicker } from '../../components/ProjectPicker';
import { PortfolioInsight } from '../../components/PortfolioInsight';
import { useAuthStore } from '../../store/authStore';
import { formatRole } from '../../lib/formatRole';
import { useT } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette, useIsDark, type Palette } from '../../theme/usePalette';

type IconName = keyof typeof MaterialIcons.glyphMap;

/**
 * The six tiles, in the drawing's order. `route` is null where the app has no such screen — the tile
 * still renders, and tapping it says so.
 */
const TILES: readonly {
  id: string;
  icon: IconName;
  route: '/vendors' | '/finance' | null;
}[] = [
  { id: 'projectSettings', icon: 'settings', route: null },
  { id: 'team', icon: 'group', route: null },
  { id: 'documents', icon: 'folder-special', route: null },
  // Cost analysis goes to THIS role's Finance screen, not to `/budget`. It pointed at `/budget`
  // while the Project Manager had no finance screen of its own — and `/budget` is a FINANCE / VIEWER
  // TAB, so a manager pushed into it arrived on a screen with no breadcrumb (therefore no TopBar
  // Back) and no tab of their own to leave by. `/finance` became this role's third tab on
  // 2026-08-10; tapping the tile now selects it.
  { id: 'cost', icon: 'analytics', route: '/finance' },
  { id: 'contractors', icon: 'handshake', route: '/vendors' },
  { id: 'siteMap', icon: 'map', route: null },
];

export default function MoreScreen(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  const router = useRouter();
  const [insightProject, setInsightProject] = useState('');
  const isDark = useIsDark();
  const displayName = useAuthStore((s) => s.displayName);
  const role = useAuthStore((s) => s.role);

  return (
    <ScrollView
      testID="more-screen"
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={styles.page}
    >
      {/* Identity — the drawing's profile card. */}
      <View testID="more-profile" style={styles.profile}>
        {/* <Avatar /> reads the signed-in name from the store itself — it takes no name prop. */}
        <Avatar variant={isDark ? 'dark' : 'light'} />
        <View style={styles.profileText}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName ?? '—'}
          </Text>
          <Text style={styles.role} numberOfLines={1}>
            {role === null ? t('more.noProject') : formatRole(role)}
          </Text>
          <View style={styles.activeChip}>
            <MaterialIcons name="check-circle" size={14} color={p.success} />
            <Text style={styles.activeText}>{t('more.active')}</Text>
          </View>
        </View>
      </View>

      {/* The drawing's "Intelligence · CONF: 98%" widget. Its text is "Project Health: … Risk Alert:
          …" — cross-domain health plus a risk, which is EXECUTIVE_SUMMARY's own shape
          (`executive_summary` + `risk_flags` + `recommendations`), so it is the same panel the
          Finance tab draws, under the drawing's own heading. Per project, because that endpoint is
          — hence the picker. */}
      <ProjectPicker selectedId={insightProject} onSelect={setInsightProject} />
      <PortfolioInsight projectId={insightProject} titleKey="more.intelligence" />

      {TILES.map((tile) => (
        <Pressable
          key={tile.id}
          testID={`more-${tile.id}`}
          accessibilityRole="button"
          accessibilityLabel={t(`more.${tile.id}.title`)}
          onPress={() =>
            tile.route === null
              ? Alert.alert(t(`more.${tile.id}.title`), t('more.comingSoon'))
              : router.push(tile.route)
          }
          style={styles.tile}
        >
          <View style={styles.tilePlate}>
            <MaterialIcons name={tile.icon} size={24} color={p.primary} />
          </View>
          <View style={styles.tileText}>
            <View style={styles.tileTitleRow}>
              <Text style={styles.tileTitle}>{t(`more.${tile.id}.title`)}</Text>
              {/* SAID BEFORE THE TAP, not after it (PO decision 2026-08-10). A tile that looks
                  identical to a working one and only admits on tap that it opens nothing spends the
                  reader's attention to tell them no. The tiles stay — the drawing has six — but the
                  four with no screen behind them say so where the eye already is. */}
              {tile.route === null ? (
                <View testID={`more-${tile.id}-soon`} style={styles.soonChip}>
                  <Text style={styles.soonText}>{t('more.soon')}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.tileBody}>{t(`more.${tile.id}.body`)}</Text>
          </View>
          <MaterialIcons
            name="chevron-right"
            size={22}
            color={tile.route === null ? p.border : p.muted}
          />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.sm },

    profile: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      marginBottom: spacing.sm,
    },
    profileText: { flex: 1, gap: spacing.xs / 2 },
    name: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.title.fontSize,
      lineHeight: typography.title.lineHeight,
    },
    role: { color: p.muted, fontFamily: fontFamily.regular, fontSize: typography.caption.fontSize },
    activeChip: {
      alignSelf: 'flex-start',
      marginTop: spacing.xs / 2,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.bg,
    },
    activeText: {
      color: p.success,
      fontFamily: fontFamily.medium,
      fontSize: 10,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },

    // The drawing's leading accent rule down each tile.
    tile: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      borderLeftColor: p.accent,
      backgroundColor: p.surface,
      minHeight: touchTarget.listItem,
    },
    tilePlate: {
      width: 48,
      height: 48,
      borderRadius: radius.md,
      backgroundColor: p.elevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileText: { flex: 1, gap: spacing.xs / 4 },
    tileTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
    soonChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 1,
      // §32.7's badge radius, enforced by theme/__tests__/badgeRadius.spec.ts.
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.elevated,
    },
    soonText: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: 9,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    tileTitle: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    tileBody: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
  });
