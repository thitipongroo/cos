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
import { PortfolioInsight } from './PortfolioInsight';
import { getMyProjects } from '../api/projects';
import { useT } from '../i18n';
import { fontFamily, plateRadius, radius, spacing, typography } from '../theme/tokens';
import { usePalette, type Palette } from '../theme/usePalette';

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
      <PortfolioInsight
        projectId={insightProject}
        projectLabel={insightProjectName}
        titleKey="exec.more.intelligence"
        icon="auto-awesome"
        autoRun
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
          {/* The drawing's shape: the plate sits ON THE TITLE'S LINE and the body runs the full
              width beneath both, rather than the plate standing beside a two-line block. */}
          <View style={styles.tileText}>
            <View style={styles.tileTitleRow}>
              <View style={styles.tilePlate}>
                {/* THE ACCENT, not the drawing's `text-on-surface` (PO 2026-09-07, reversing the
                    2026-09-06 change): every other glyph plate in this app is cyan, and a screen of
                    seven monochrome plates read as disabled rows beside them. */}
                <MaterialIcons name={tile.icon} size={18} color={p.accent} />
              </View>
              <Text style={styles.tileTitle} numberOfLines={1}>
                {t(`exec.more.${tile.id}.title`)}
              </Text>
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
      width: 32,
      height: 32,
      // A square glyph plate scales its corner with its side (§32.7) — never a literal.
      borderRadius: plateRadius(32),
      backgroundColor: p.elevated,
      // AN EDGE, BECAUSE THE FILL ALONE IS INVISIBLE. The drawing's plate is `bg-surface-bright`,
      // which is LIGHTER than its card; this palette's `elevated` (#111827) is a shade DARKER than
      // `surface` (#0F172A), so a filled plate on a dark card reads as nothing at all. That did not
      // show while the glyph was accent-coloured and carried the tile on its own — it appeared the
      // moment the glyph took the drawing's neutral ink. Rather than invent a "brighter than the
      // card" token the set does not have, the plate is outlined: it reads as a plate, the glyph
      // stays the ink the drawing asks for, and no token changes meaning.
      borderWidth: 1,
      borderColor: p.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileText: { flex: 1, gap: spacing.xs / 2 },
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
  });
