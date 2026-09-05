// ExecMore — the EXECUTIVE half of /more.
// Implements mockup/mobile/08_executive/04_more/01_ex_more.
//
// `more` carries two screens and branches on role (ADR-098), the same arrangement `tasks` and
// `reports` use. The manager keeps its six tiles; this is the executive's seven.
//
// FOUR OF THE SEVEN REACH A REAL SCREEN, and three do not:
//   รายงานพอร์ตโฟลิโอ      → /portfolio  the project list with variance and at-risk badges
//   การคาดการณ์ทางการเงิน  → /budget     §6.4 gives this role "Budget (view)"; it is already the
//                                        role's drawer row, so the tile reaches nothing new
//   ศูนย์บริหารความเสี่ยง   → /alerts     the risk feed that left the bar in this same change
//   รายชื่อผู้จัดจำหน่าย    → /vendors    the vendor directory
//   มุมมอง BIM เชิงกลยุทธ์  → nothing     BIM is a Type A stub (spec §32.9)
//   บัญชีคาร์บอน           → nothing     `analytics.carbon_records` exists, but
//                                        `carbon-calculation.stub.ts` throws NotImplementedException
//                                        and no controller exposes it
//   แผนที่ไซต์ทั่วโลก      → nothing     projects carry no coordinates and there is no maps library
//
// THE THREE SAY SO BEFORE THE TAP, not after it. That is the treatment `more.tsx` settled on for the
// manager's four unbuilt tiles by product-owner decision on 2026-08-10: a tile that looks identical
// to a working one and only admits on tap that it opens nothing has spent the reader's attention to
// tell them no. These three are in `UNBUILT_MORE_TILES` (lib/mockupFigures.ts) so the set is
// countable from one place.
//
// `/budget` HAS NO BREADCRUMB, because it is FINANCE's and VIEWER's tab and a tab must not carry a
// Back control. An executive pushed there arrives on a screen it can only leave with the hardware
// button — which is exactly what the role's DRAWER row onto `/budget` already does, so the tile adds
// no new defect. Fixing it means giving a route that is a tab for one role and a child for another
// two different shells, which is a larger change than this screen.
//
// The AI panel is the real `executive-summary` endpoint, under the drawing's own "OS Intelligence"
// heading — same component and same endpoint as the manager's More screen.

import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Avatar } from './Avatar';
import { PortfolioInsight } from './PortfolioInsight';
import { getMyProjects } from '../api/projects';
import { useAuthStore } from '../store/authStore';
import { formatRole } from '../lib/formatRole';
import { useT } from '../i18n';
import { fontFamily, plateRadius, radius, spacing, typography } from '../theme/tokens';
import { usePalette, useIsDark, type Palette } from '../theme/usePalette';

type IconName = keyof typeof MaterialIcons.glyphMap;

/** The seven tiles in the drawing's order. `route` is null where this app has no such screen. */
const TILES: readonly { id: string; icon: IconName; route: Href | null }[] = [
  { id: 'portfolioReport', icon: 'insights', route: '/portfolio' },
  { id: 'financialForecast', icon: 'account-balance', route: '/budget' },
  { id: 'riskCentre', icon: 'warning', route: '/alerts' },
  { id: 'vendorDirectory', icon: 'store', route: '/vendors' },
  { id: 'strategicBim', icon: 'domain', route: null },
  { id: 'carbon', icon: 'eco', route: null },
  { id: 'globalMap', icon: 'public', route: null },
];

export function ExecMore(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  const router = useRouter();
  const isDark = useIsDark();
  const displayName = useAuthStore((s) => s.displayName);
  const role = useAuthStore((s) => s.role);

  const [insightProject, setInsightProject] = useState('');
  const [insightProjectName, setInsightProjectName] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getMyProjects()
      .then((mine) => {
        if (cancelled) return;
        setInsightProject(mine[0]?.project_id ?? '');
        setInsightProjectName(mine[0]?.project_name);
      })
      .catch(() => {
        /* offline — the panel stays on its idle line */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ScrollView
      testID="exec-more-screen"
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={styles.page}
    >
      <View testID="exec-more-profile" style={styles.profile}>
        <Avatar variant={isDark ? 'dark' : 'light'} />
        <View style={styles.profileText}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName ?? '—'}
          </Text>
          <Text style={styles.role} numberOfLines={1}>
            {role === null ? '—' : formatRole(role)}
          </Text>
        </View>
      </View>

      <PortfolioInsight
        projectId={insightProject}
        projectLabel={insightProjectName}
        titleKey="exec.more.intelligence"
      />

      {TILES.map((tile) => (
        <Pressable
          key={tile.id}
          testID={`exec-more-${tile.id}`}
          accessibilityRole="button"
          accessibilityLabel={t(`exec.more.${tile.id}.title`)}
          onPress={() =>
            tile.route === null
              ? Alert.alert(t(`exec.more.${tile.id}.title`), t('more.comingSoon'))
              : router.push(tile.route)
          }
          style={styles.tile}
        >
          <View style={styles.tilePlate}>
            <MaterialIcons name={tile.icon} size={24} color={p.accent} />
          </View>
          <View style={styles.tileText}>
            <View style={styles.tileTitleRow}>
              <Text style={styles.tileTitle}>{t(`exec.more.${tile.id}.title`)}</Text>
              {tile.route === null ? (
                <View testID={`exec-more-${tile.id}-soon`} style={styles.soonChip}>
                  <Text style={styles.soonText}>{t('more.soon')}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.tileBody}>{t(`exec.more.${tile.id}.body`)}</Text>
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
      gap: spacing.sm,
      backgroundColor: p.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      padding: spacing.md,
    },
    profileText: { flex: 1, gap: 2 },
    name: {
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.text,
    },
    role: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
    },

    tile: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: p.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      padding: spacing.md,
      minHeight: 72,
    },
    tilePlate: {
      width: 40,
      height: 40,
      // A square glyph plate scales its corner with its side (§32.7) — never a literal.
      borderRadius: plateRadius(40),
      backgroundColor: p.elevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileText: { flex: 1, gap: 2 },
    tileTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    tileTitle: {
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.text,
    },
    tileBody: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
    },
    soonChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 1,
      borderRadius: radius.xl,
      backgroundColor: p.elevated,
      borderWidth: 1,
      borderColor: p.border,
    },
    soonText: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
  });
