// HomeKit — the pieces every role Home shares: the palette-resolved stylesheet and the four
// presentational bits built on it.
//
// It exists because app/(app)/home.tsx held all of this ALONGSIDE six role dashboards in one
// 1401-line file, so every role's screen was parsed to render one of them. Splitting the roles out
// without this file would have meant six copies of the same stylesheet, which is the opposite of
// the point.

import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ScrollView } from 'react-native';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette, useIsDark, type Palette } from '../../theme/usePalette';

/** The palette-resolved stylesheet. One hook so every home variant reads the same set. */
/**
 * `GET /analytics/executive` — the row shape both the Executive and the Finance Home read.
 * It lived in the Executive block while the file was one; Finance reads the same endpoint, so the
 * split made it shared rather than duplicated.
 */
export interface ExecutiveDashboardRow {
  /** DECIMAL strings, exactly as the API returned them — never parsed to a JS number. */
  totalActual: string;
  totalBudget: string;
  overdueInvoiceCount: number;
}

export function useHomeStyles() {
  const p = usePalette();
  return useMemo(() => makeStyles(p), [p]);
}

/**
 * The skeleton palette for this screen's loaders.
 *
 * <LoadingState /> takes an explicit theme rather than reading the store, so a hardcoded "light"
 * here would flash a white skeleton on a dark page before the real content arrives — the same defect
 * as the stylesheet above, one component deeper.
 */
export function useLoaderTheme(): 'dark' | 'light' {
  return useIsDark() ? 'dark' : 'light';
}

// ── shared presentational bits ──────────────────────────────────────────────
export function KpiCard({
  testID,
  value,
  label,
}: {
  testID: string;
  value: string;
  label: string;
}) {
  const styles = useHomeStyles();
  return (
    <View testID={testID} style={styles.kpi}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

/** How many task cards the Site Worker Home lists before "+ N more" (mockup: three). */
export const PRIORITY_TASK_COUNT = 3;

/**
 * A bento stat tile — label + glyph, a big figure with a small unit beside it, and a progress bar.
 *
 * `fraction` scales the bar; the caller decides what it is a fraction OF, because the two tiles
 * measure different things (tasks done out of all tasks; hours worked out of a standard shift).
 */
export function StatTile({
  testID,
  label,
  icon,
  value,
  unit,
  fraction,
  barColor,
}: {
  testID: string;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  value: string;
  unit: string;
  fraction: number;
  barColor: string;
}) {
  const styles = useHomeStyles();
  const p = usePalette();
  return (
    <View testID={testID} style={styles.statTile}>
      <View style={styles.statHead}>
        <Text style={styles.statLabel}>{label}</Text>
        <MaterialIcons name={icon} size={20} color={p.muted} />
      </View>
      <View style={styles.statValueRow}>
        <Text style={styles.statValue}>{value}</Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
      <View style={[styles.statTrack, { backgroundColor: p.border }]}>
        <View
          style={[
            styles.statFill,
            {
              width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`,
              backgroundColor: barColor,
            },
          ]}
        />
      </View>
    </View>
  );
}

/**
 * A role Home's page frame.
 *
 * `scroll` is opt-in rather than the default: most role Homes are a screenful of KPI cards, and a
 * ScrollView around content that never overflows changes nothing except how the E2E suite finds it.
 * The Project Manager's Home lists every project it is a member of and does overflow.
 */
export function Screen({
  testID,
  scroll = false,
  children,
}: {
  testID: string;
  scroll?: boolean;
  children: React.ReactNode;
}) {
  const styles = useHomeStyles();
  if (scroll) {
    return (
      <ScrollView
        testID={testID}
        style={styles.scrollRoot}
        contentContainerStyle={styles.scrollPage}
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <View testID={testID} style={styles.container}>
      {children}
    </View>
  );
}

/** Normalise a list endpoint that may return `T[]` or `{ items: T[] }`. */
export function asList<T>(res: { items?: T[] } | T[]): T[] {
  return Array.isArray(res) ? res : (res.items ?? []);
}

// Palette-driven, like every other screen in the shell (PO decision 2026-08-08). This file was the
// last one still pinned to the LIGHT token set — `colors.bg`, `colors.surface` — which rendered a
// white page under a dark top bar and dark bottom nav. It went unnoticed while no role landed here
// by default; the moment SITE_WORKER regained its Home tab it became the first screen a field worker
// sees. Shapes are unchanged; only the colours now resolve from the user's mode.
const makeStyles = (p: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: p.bg, padding: spacing.md, gap: spacing.md },
    scrollRoot: { flex: 1, backgroundColor: p.bg },
    scrollPage: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl * 3 },
    kpiRow: { flexDirection: 'row', gap: spacing.md },

    // ── Project Manager Home (mockup 06_project_manager/01_home) ────────────────────────────
    eyebrow: {
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    pmTile: {
      flex: 1,
      justifyContent: 'space-between',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      backgroundColor: p.surface,
    },
    pmTileLabel: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    pmTileHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    pmTileFoot: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    pmTileValue: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.hero.fontSize,
      lineHeight: typography.hero.lineHeight,
    },
    // A placeholder is a sentence, not a figure — it must not be set at hero size.
    pmTilePlaceholder: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.lineHeight,
    },
    pmCard: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      backgroundColor: p.surface,
    },
    pmCardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    pmCardTitleGrow: { flex: 1 },
    pmCardTitle: {
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    pmCardBody: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    pmGhostButton: {
      alignSelf: 'flex-start',
      minHeight: touchTarget.secondaryButton,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    pmGhostButtonText: {
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    pmNotice: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },
    pmProjectHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    pmProjectTitleBlock: { flex: 1, gap: spacing.xs / 4 },
    pmProjectName: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.body.fontSize,
    },
    pmProjectPhase: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    pmStatusChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.elevated,
    },
    pmStatusText: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: 10,
      letterSpacing: 0.5,
    },
    pmProgressRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
    pmProgressLabel: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    // ── Site Worker Home (mockup 01_home/01_sw_dashboard) ──────────────────────────────────────
    fieldRoot: { flex: 1, backgroundColor: p.bg },
    fieldPage: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl * 3 },
    statTile: {
      flex: 1,
      minHeight: 120,
      backgroundColor: p.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      padding: spacing.sm,
      justifyContent: 'space-between',
    },
    statHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    statLabel: {
      flex: 1,
      fontSize: 11,
      fontFamily: fontFamily.medium,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: p.muted,
    },
    statValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
    statValue: { fontSize: typography.hero.fontSize, fontFamily: fontFamily.bold, color: p.text },
    statUnit: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
    },
    statTrack: { height: 4, borderRadius: 999, overflow: 'hidden' },
    statFill: { height: '100%', borderRadius: 999 },
    insight: {
      padding: spacing.md,
      borderLeftWidth: 4,
      borderTopRightRadius: radius.xl,
      borderBottomRightRadius: radius.xl,
      gap: spacing.xs,
    },
    insightHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    insightTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    insightLabel: {
      fontSize: 11,
      fontFamily: fontFamily.bold,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    insightConf: {
      fontSize: 10,
      fontFamily: fontFamily.medium,
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    insightBody: { fontSize: typography.body.fontSize, fontFamily: fontFamily.regular },
    insightButton: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.xs,
      minHeight: 40,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    insightButtonText: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      textTransform: 'uppercase',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 44,
    },
    sectionTitle: {
      fontSize: typography.title.fontSize,
      fontFamily: fontFamily.semibold,
      marginTop: spacing.xs,
      // Uppercase (PO decision 2026-08-09), matching how the mockup sets its section headings.
      // Applied as a STYLE, not by uppercasing the message: the Thai string has no case, and
      // `toUpperCase()` in the component would be a no-op there while silently shouting in English.
      textTransform: 'uppercase',
    },
    moreTasks: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      minHeight: 44,
    },
    moreTasksText: { fontSize: typography.label.fontSize, fontFamily: fontFamily.semibold },
    // 56px round FAB per the DESIGN.md spec, cleared of the bottom nav. Black elevation, never a
    // coloured glow — FAB glow is §32.7-prohibited.
    fab: {
      position: 'absolute',
      right: spacing.md,
      bottom: spacing.xl,
      width: 56,
      height: 56,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.45,
      shadowRadius: 12,
      elevation: 8,
    },
    // Wrapper the LoadingBoundary occupies — reproduces the Screen container's vertical gap so a
    // multi-row KPI region keeps its spacing once the loader crossfades to the real cards.
    kpiRegion: { gap: spacing.md },
    quickRow: { flexDirection: 'row', gap: spacing.md },
    kpi: {
      flex: 1,
      backgroundColor: p.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      padding: spacing.md,
      alignItems: 'center',
      gap: spacing.xs,
    },
    kpiValue: {
      fontSize: typography.hero.fontSize,
      fontFamily: fontFamily.bold,
      // `accent`, not `primary`: on the dark page the field blue is 4.17:1, under the 4.5:1 AA text
      // threshold §20.8 gates on. In light mode the two resolve to the same colour.
      color: p.accent,
    },
    kpiLabel: {
      fontSize: typography.caption.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
      textAlign: 'center',
    },
    message: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },
  });
