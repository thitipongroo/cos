// Projects — the VIEWER's read-only project list.
//
// DRAWING: mockup/mobile/role_viewer/02_projects/01_list_items (Stitch screen "Project List -
// Viewer (Mobile Dark Mode)").
//
// REDRAWN 2026-09-11. The screen was first built against the 2026-09-10 export; the product owner
// edited four of this role's five drawings the next day, which a check of Stitch's screen COUNT
// could not have shown — the count only says two were ADDED. All seven are re-downloaded and
// sha256-compared now.
//
// WHAT THE REDRAW CHANGED HERE: the invented header became the app's real <TopBar />; the bar
// became the enumerated four (`Projects · Home · Procurement · Budget`, the same set as Home draws
// with Home in the second slot — order is behaviour and stays the app's, §32.7); the `All Projects`
// chip became `All` with a leading tick; each card gained a round chevron plate beside its status
// chip; and the issue count in each card's footer became a control of its own with a
// `navigate_next`.
//
// THIS ROUTE IS VIEWER'S ALONE (`lib/roleTabs.ts`: "`projects` is VIEWER's only" — it stopped being
// a PROJECT_MANAGER tab on 2026-08-10), so restyling it changes no other role's screen. It was 51
// lines before today: a `FlatList` of `code · name` with a status chip, and none of the drawing.
//
// WHAT IS REAL. The rows. `local_projects` is the §17.4 stale-while-revalidate cache and it holds
// `project_code`, `project_name` and `status` — so the ID line, the title and the status chip are
// the cached row's, and `refreshProjectsCache()` still runs on mount exactly as it did before.
// The chip prints the REAL lifecycle status through `projectStatusTone`; the drawing's "ON TRACK"
// is a label for a state this product does not store.
//
// THE SEARCH FIELD WORKS, AND THE DRAWING MARKS IT `readonly`. It is left working because it CAN
// be: the list is already in memory, so filtering it by code or name is a real filter over real
// rows, and this project's standing rule is that a control raises "coming soon" when there is no
// process behind it — not when there is one. What did change is the drawing's placeholder, "Search
// projects by ID, name, or location...": `projects.projects` has no address and no coordinates
// (see PROJECT_LOCATIONS), so a field advertising a location search would return nothing for every
// location typed into it. The copy names the two fields it actually searches. ADR-085 gives
// composition to the implementation and this note is the record it requires.
//
// THE CATEGORY CHIPS DO NOT FILTER, and they say so on a press. There is no category, sector or
// type column to filter on — see VIEWER_PROJECT_FILTERS — so the row is drawn and inert rather
// than quietly filtering on a figure this file made up.
//
// WHAT IS DRAWN (lib/mockupFigures.ts, ADR-099): VIEWER_PROJECT_CARDS supplies each card's
// category, completion percentage, head-count and issue count; VIEWER_PROJECT_FILTERS the chips.
// Both name what would delete them.
//
// NO BOTTOM NAV AND NO HEADER OF ITS OWN — the drawing has both and the shell already draws them.
// Its nav reads Projects | Daily Logs | Safety | Directory, which is a third of the four different
// bars this five-screen set draws; the product owner kept the enumerated bar on 2026-09-10.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { Project } from '../../db/database';
import { useCollection } from '../../hooks/useCollection';
import { refreshProjectsCache } from '../../api/projects';
import { SearchField } from '../../components/SearchField';
import { useComingSoon } from '../../components/useComingSoon';
import { projectStatusTone } from '../../lib/projectStatusTone';
import { VIEWER_PROJECT_CARDS, VIEWER_PROJECT_FILTERS } from '../../lib/mockupFigures';
import { useT } from '../../i18n';
import { fontFamily, radius, spacing, typography } from '../../theme/tokens';
import { usePalette, type Palette } from '../../theme/usePalette';

/** The chip that is on. The three category chips beside it select nothing — see the header. */
const ALL_CHIP = 'all';

export default function ProjectsScreen(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  const soon = useComingSoon();

  const projects = useCollection<Project>('local_projects');
  const [query, setQuery] = useState('');

  useEffect(() => {
    refreshProjectsCache().catch(() => {
      /* offline — the cache is the source of truth (§17.4) and has already answered */
    });
  }, []);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === '') return projects;
    return projects.filter(
      (project) =>
        project.projectCode.toLowerCase().includes(needle) ||
        project.projectName.toLowerCase().includes(needle),
    );
  }, [projects, query]);

  const onChipPress = useCallback(
    (id: string) => {
      if (id === ALL_CHIP) return;
      soon(`project.viewer.category.${id}`);
    },
    [soon],
  );

  return (
    <ScrollView
      testID="projects-screen"
      style={styles.root}
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <SearchField
        testID="projects-search"
        value={query}
        onChangeText={setQuery}
        placeholder={t('project.viewer.searchPlaceholder')}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {/* `All` with a leading tick, the redraw's own shape. It is the chip that is ON, so it is
            not pressable — pressing the state you are already in is not a control. */}
        <View testID="projects-filter-all" style={[styles.chip, styles.chipActive]}>
          <MaterialIcons name="check" size={16} color={p.onPrimary} />
          <Text style={[styles.chipText, styles.chipTextActive]}>
            {t('project.viewer.allProjects')}
          </Text>
        </View>
        {VIEWER_PROJECT_FILTERS.value.map((id) => (
          <Pressable
            key={id}
            testID={`projects-filter-${id}`}
            accessibilityRole="button"
            accessibilityLabel={t(`project.viewer.category.${id}`)}
            onPress={() => onChipPress(id)}
            style={styles.chip}
          >
            <Text style={styles.chipText}>{t(`project.viewer.category.${id}`)}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {rows.length === 0 ? (
        <Text testID="projects-empty" style={styles.notice}>
          {query.trim() === '' ? t('project.viewer.empty') : t('project.viewer.noMatch')}
        </Text>
      ) : null}

      {rows.map((project, index) => {
        // The drawn figures are positional, as every per-card register in this file's neighbour is
        // (PROJECT_SCHEDULE_PILLAR and friends). A list longer than the drawing renders the cards
        // beyond it WITHOUT them rather than repeating the last one — a figure that has run out is
        // absent, not recycled.
        const drawn = VIEWER_PROJECT_CARDS.value[index];
        const tone = projectStatusTone(project.status);
        const toneColor = tone === 'success' ? p.success : tone === 'warning' ? p.warning : p.muted;
        const issueColor = drawn !== undefined && drawn.issues >= 10 ? p.warning : p.muted;
        return (
          <Pressable
            key={project.id}
            testID="project-item"
            accessibilityRole="button"
            accessibilityLabel={project.projectName}
            // No per-project screen exists for this role: `/dashboard` is the manager's, takes a
            // param and is gated to roles this one is not. The card is drawn as the drawing draws
            // it and says so on the press.
            onPress={() => soon('project.viewer.projectDetail')}
            style={[styles.card, { borderLeftColor: toneColor }]}
          >
            <View style={styles.cardHead}>
              <View style={styles.cardTitleBlock}>
                <Text style={styles.cardEyebrow} numberOfLines={1}>
                  {drawn === undefined
                    ? t('project.viewer.code', { code: project.projectCode })
                    : t('project.viewer.codeCategory', {
                        code: project.projectCode,
                        category: t(`project.viewer.category.${drawn.category}`),
                      })}
                </Text>
                {/* One line with an ellipsis — the rule set on 2026-09-10 for every project and
                    customer name in this app. */}
                <Text style={styles.cardTitle} numberOfLines={1} ellipsizeMode="tail">
                  {project.projectName}
                </Text>
              </View>
              <View style={styles.cardHeadTrail}>
                <View style={[styles.statusChip, { borderColor: toneColor }]}>
                  <Text style={[styles.statusText, { color: toneColor }]}>{project.status}</Text>
                </View>
                <View style={styles.chevronCircle}>
                  <MaterialIcons name="chevron-right" size={18} color={p.muted} />
                </View>
              </View>
            </View>

            {drawn === undefined ? null : (
              <>
                <View style={styles.progressBlock}>
                  <View style={styles.progressRow}>
                    <Text style={styles.progressLabel}>{t('project.viewer.progress')}</Text>
                    <Text style={styles.progressValue}>{`${drawn.completion}%`}</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${drawn.completion}%`, backgroundColor: toneColor },
                      ]}
                    />
                  </View>
                </View>

                <View style={styles.cardFoot}>
                  <View style={styles.footItem}>
                    <MaterialIcons name="group" size={14} color={p.muted} />
                    <Text style={styles.footText}>
                      {t('project.viewer.workers', { count: drawn.crew })}
                    </Text>
                  </View>
                  {/* A CONTROL OF ITS OWN in the redraw — a tinted plate with a `navigate_next`.
                      `/issues` is not a route this role can reach (§32.7 kept it off the bar
                      because its create button is not role-gated), so it says so on the press. */}
                  <Pressable
                    testID="project-issues"
                    accessibilityRole="button"
                    accessibilityLabel={t('project.viewer.issues', { count: drawn.issues })}
                    onPress={() => soon('project.viewer.issuesLabel')}
                    style={styles.issuesButton}
                  >
                    <MaterialIcons name="report" size={14} color={issueColor} />
                    <Text style={[styles.footText, { color: issueColor }]}>
                      {t('project.viewer.issues', { count: drawn.issues })}
                    </Text>
                    <MaterialIcons name="navigate-next" size={14} color={issueColor} />
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: p.bg },
    page: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl * 3 },

    chipRow: { gap: spacing.xs, paddingRight: spacing.md },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surfaceSoft,
    },
    chipActive: { backgroundColor: p.primary, borderColor: p.primary },
    chipText: {
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    chipTextActive: { color: p.onPrimary },

    notice: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },

    card: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      backgroundColor: p.surface,
    },
    cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    cardHeadTrail: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    // A CIRCLE, not a step on the radius scale: 999 with a fixed 28px side is the documented
    // "make this round" marker (§32.7's closing paragraph).
    chevronCircle: {
      width: 28,
      height: 28,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.surfaceBright,
    },
    cardTitleBlock: { flex: 1, gap: spacing.xs / 2 },
    cardEyebrow: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
    },
    cardTitle: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.title.fontSize,
      lineHeight: typography.title.lineHeight,
    },
    statusChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.xs / 2,
      borderRadius: radius.xl,
      borderWidth: 1,
    },
    statusText: {
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },

    progressBlock: { gap: spacing.xs / 2 },
    progressRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    progressLabel: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
    },
    progressValue: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    progressTrack: {
      height: 6,
      borderRadius: 999,
      backgroundColor: p.surfaceSunk,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 999 },

    // The footer sits above a hairline INSIDE the card, as the drawing draws it — not on a
    // separate recessed strip, which is what the Home card does.
    cardFoot: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: p.border,
    },
    footItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
    issuesButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surfaceSoft,
    },
    footText: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
    },
  });
