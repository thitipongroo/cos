// ── VIEWER — the read-only portfolio: what is running, what is wrong, and what just happened ─────
//
// DRAWING: mockup/mobile/role_viewer/01_home/01_dashboard (Stitch screen "Viewer Home Dashboard -
// Mobile (Fixed Dark Mode)"). The repo copy was downloaded from Stitch on 2026-09-10 and compared
// byte for byte — sha256 identical, all five screens of the set — so the file read here is the
// drawing, not a stale export of it.
//
// WHY THIS SCREEN EXISTS. Until today VIEWER fell through `home.tsx`'s switch to <MinimalHome />, a
// 22-line placeholder showing one pending-sync count. That is the same gap CRM_SALES_MANAGER had
// until 2026-09-09, and it is closed the same way.
//
// WHAT IS REAL, AND THE REAL PART IS THE TOP OF THE SCREEN.
//   Active Projects  a count of `local_projects` — the §17.4 read-through cache this role's
//                    /projects tab already reads. Not a drawn 12.
//
// THE OPEN ISSUES TILE IS DRAWN, AND IT TOOK TWO WRONG ANSWERS TO GET THERE. It first counted
// `local_issues` and printed "0" — that table is filled by delta sync from work THIS DEVICE did,
// a VIEWER writes nothing, so it is empty and stays empty, and a confident 0 over a seeded
// portfolio is a false statement. It then fetched `GET /site/issues?status=OPEN`, as `PmHome`
// does, and drew an em dash for every 403. Measured with a real VIEWER token that day: the route's
// `@Roles` list does not include this role, while §6.8 grants it `Issues R`. See
// VIEWER_OPEN_ISSUES, which names the one-line fix that deletes it.
//   Project cards    name, code and lifecycle status are the cached row's. The chip prints the
//                    REAL status (ACTIVE, ON_HOLD, …) through `projectStatusTone`, exactly as the
//                    manager Home does — the drawing's "On Track" is a label for a state this
//                    product does not store, and printing it over an ON_HOLD project would be a
//                    lie told in the drawing's typeface.
//
// WHAT IS DRAWN (lib/mockupFigures.ts, ADR-099), each naming what would delete it:
//   VIEWER_PORTFOLIO_BUDGET     $142.5M and +2.4% YTD — no budget roll-up scoped to one viewer's
//                               `project_membership` rows.
//   VIEWER_SYSTEM_INSIGHT       the whole card. No weather-and-schedule report exists in
//                               backend/src/modules/ai/, and §22.6 names no weather provider.
//   VIEWER_HOME_PROJECT_CARDS   each card's category, completion %, head-count and issue count.
//   VIEWER_SITE_ACTIVITY        all three timeline entries.
//
// THE AI CARD NEEDED A PERMISSION, NOT JUST A FIGURE. `[CosRole.VIEWER]` held seven grants and
// neither `ai:read` nor `analytics:read` was among them, so the System Insight card would have been
// drawn against a grant the role does not hold. Escalated on 2026-09-10 and decided by the product
// owner: the grants are added rather than the card dropped. All three added grants are `:read`, so
// §20.7.9's "no create/edit/approve actions are rendered" is untouched.
//
// TWO THINGS THE DRAWING ASKS FOR THAT ARE DELIBERATELY NOT HERE:
//   1. Its own header bar — menu, wordmark, SYNCED pill, avatar. <TopBar /> already supplies all
//      four above every screen in the shell; drawing a second one would double the chrome.
//   2. Its bottom nav, Home | Projects | Map | Insights | Profile. The five drawings of this set
//      give FOUR different bars and even the two that agree on labels disagree on glyphs, and
//      VIEWER is one of the three roles §32.7's table enumerates. Escalated on 2026-09-10 under the
//      ADR-098 precedent; the product owner kept the enumerated bar
//      (Home | Projects | Procurement | Budget). /map and /insights are drawer rows instead.

import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import type { Project } from '../../db/database';
import { useCollection } from '../../hooks/useCollection';
import { refreshProjectsCache } from '../../api/projects';
import { useT } from '../../i18n';
import { AiCardFooter } from '../AiCardFooter';
import { projectStatusTone } from '../../lib/projectStatusTone';
import {
  VIEWER_HOME_PROJECT_CARDS,
  VIEWER_OPEN_ISSUES,
  VIEWER_PORTFOLIO_BUDGET,
  VIEWER_SITE_ACTIVITY,
  VIEWER_SYSTEM_INSIGHT,
} from '../../lib/mockupFigures';
import { usePalette, type Palette } from '../../theme/usePalette';
import { fontFamily, plateRadius, radius, spacing, typography } from '../../theme/tokens';
import { Screen, KpiRegion } from './HomeKit';

/** The insight card's glyph plate. Named so the plate and its radius cannot drift apart. */
const PLATE = 32;

/** How many project cards Home lists before the reader is sent to the full list (drawing: two). */
const HOME_PROJECT_COUNT = VIEWER_HOME_PROJECT_CARDS.value.length;

/** The drawing's timeline dot colours, resolved against the live palette. */
const TONE_COLOR = {
  accent: (p: Palette) => p.accent,
  success: (p: Palette) => p.success,
  warning: (p: Palette) => p.warning,
  danger: (p: Palette) => p.danger,
} as const;

export default function ViewerHome(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  const router = useRouter();

  const projects = useCollection<Project>('local_projects');

  // A failed refresh and an empty portfolio must not render the same sentence. PmHome learned that
  // the hard way — its first capture photographed "you are not a member of any project" for a
  // manager who had three — so the state is three-valued here from the start.
  const [projectsState, setProjectsState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let cancelled = false;
    refreshProjectsCache().then(
      () => {
        if (!cancelled) setProjectsState('ready');
      },
      () => {
        if (!cancelled) setProjectsState('failed');
      },
    );
    return () => {
      cancelled = true;
    };
    // Mount only. The effect reads nothing from render, so there is no stale closure to guard
    // against — whether the cache has rows is decided below, at the point it is drawn.
  }, []);

  const tracked = projects.slice(0, HOME_PROJECT_COUNT);

  return (
    <Screen testID="home-screen" scroll>
      <Text style={styles.hero}>{t('home.viewer.portfolioOverview')}</Text>

      <KpiRegion loading={projectsState === 'loading'} settled={0} steps={1}>
        {/* THE BENTO GRID. Two counted tiles, then the budget across both columns — the drawing's
            own arrangement, each with its 4px accent bar. */}
        <View style={styles.pairRow}>
          <View testID="viewer-kpi-projects" style={[styles.tile, { borderLeftColor: p.accent }]}>
            <MaterialIcons name="domain" size={22} color={p.accent} />
            <Text style={styles.tileLabel}>{t('home.viewer.activeProjects')}</Text>
            <Text style={styles.tileValue}>{projects.length}</Text>
          </View>

          <View testID="viewer-kpi-issues" style={[styles.tile, { borderLeftColor: p.warning }]}>
            <MaterialIcons name="warning" size={22} color={p.warning} />
            <Text style={styles.tileLabel}>{t('home.viewer.openIssues')}</Text>
            {/* DRAWN — see VIEWER_OPEN_ISSUES. The endpoint that holds this number refuses this
                role, measured, and the register entry names the fix. */}
            <Text style={styles.tileValue}>{VIEWER_OPEN_ISSUES.value}</Text>
          </View>
        </View>

        <View testID="viewer-kpi-budget" style={[styles.wideTile, { borderLeftColor: p.success }]}>
          <View style={styles.wideBody}>
            <View style={styles.wideHead}>
              <MaterialIcons name="payments" size={16} color={p.success} />
              <Text style={styles.tileLabel}>{t('home.viewer.portfolioBudget')}</Text>
            </View>
            {/* DRAWN — see VIEWER_PORTFOLIO_BUDGET. */}
            <Text style={styles.wideValue}>{VIEWER_PORTFOLIO_BUDGET.value.total}</Text>
          </View>
          <View style={styles.wideAside}>
            <Text style={styles.deltaText}>
              {t('home.viewer.ytdDelta', { delta: VIEWER_PORTFOLIO_BUDGET.value.deltaPct })}
            </Text>
            <Text style={styles.asideMeta}>{t('home.viewer.allocated')}</Text>
          </View>
        </View>
      </KpiRegion>

      {/* SYSTEM INSIGHT — drawn whole. The confidence sits in the foot, not the head: the standard
          set on 2026-09-08 (§32.7, <AiCardFooter />) puts it beside the source, and this card makes
          no confidence claim of its own, so it passes null rather than inventing one. */}
      <View testID="viewer-insight" style={styles.insightCard}>
        <View style={styles.insightHead}>
          <View style={styles.insightPlate}>
            <MaterialIcons name="psychology" size={18} color={p.accent} />
          </View>
          <Text style={styles.insightTitle}>{t('home.viewer.systemInsight')}</Text>
        </View>
        <Text style={styles.insightBody}>{VIEWER_SYSTEM_INSIGHT.value.body}</Text>
        <AiCardFooter
          testID="viewer-insight-foot"
          percent={null}
          source={t('insight.sourcePortfolio')}
          confLabel={t('insight.confShort')}
          sourceLabel={t('insight.sourceShort')}
          palette={p}
        />
      </View>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{t('home.viewer.trackedProjects')}</Text>
        <Pressable
          testID="viewer-view-all"
          accessibilityRole="button"
          accessibilityLabel={t('home.viewer.viewAll')}
          onPress={() => router.push('/projects')}
          hitSlop={8}
        >
          <Text style={styles.viewAll}>{t('home.viewer.viewAll')}</Text>
        </Pressable>
      </View>

      {/* A FAILED REFRESH AND AN EMPTY PORTFOLIO MUST NOT READ THE SAME. Offline is not a failure
          to report either: the cache is the source of truth (§17.4), so a failed request over rows
          that are already cached says nothing — only a failure with nothing to show does. */}
      {projectsState === 'failed' && projects.length === 0 ? (
        <Text testID="viewer-projects-failed" style={styles.notice}>
          {t('home.viewer.projectsUnavailable')}
        </Text>
      ) : null}

      {projectsState === 'ready' && projects.length === 0 ? (
        <Text testID="viewer-no-projects" style={styles.notice}>
          {t('home.viewer.noProjects')}
        </Text>
      ) : null}

      {tracked.map((project, index) => {
        const drawn = VIEWER_HOME_PROJECT_CARDS.value[index];
        const tone = projectStatusTone(project.status);
        const toneColor = tone === 'success' ? p.success : tone === 'warning' ? p.warning : p.muted;
        // The issue count carries the drawing's own escalation: a card with many issues reads in
        // the danger tone rather than the muted one.
        const issueColor = drawn !== undefined && drawn.issues >= 10 ? p.danger : p.muted;
        return (
          <View key={project.id} testID={`viewer-project-${project.id}`} style={styles.projectCard}>
            <View style={styles.projectBody}>
              <View style={styles.projectHead}>
                <View style={styles.projectTitleBlock}>
                  {/* One line with an ellipsis — the rule the product owner set on 2026-09-10 for
                      every project and customer name in this app. */}
                  <Text style={styles.projectName} numberOfLines={1} ellipsizeMode="tail">
                    {project.projectName}
                  </Text>
                  <Text style={styles.projectMeta} numberOfLines={1}>
                    {drawn === undefined
                      ? t('home.viewer.projectCode', { code: project.projectCode })
                      : t('home.viewer.projectCodeCategory', {
                          code: project.projectCode,
                          category: t(`home.viewer.category.${drawn.category}`),
                        })}
                  </Text>
                </View>
                <View style={[styles.statusChip, { borderColor: toneColor }]}>
                  <Text style={[styles.statusText, { color: toneColor }]}>{project.status}</Text>
                </View>
              </View>

              {drawn === undefined ? null : (
                <View style={styles.progressBlock}>
                  <View style={styles.progressRow}>
                    <Text style={styles.progressLabel}>{t('home.viewer.completion')}</Text>
                    <Text style={styles.progressLabel}>{`${drawn.completion}%`}</Text>
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
              )}
            </View>

            {/* THE FOOTER STRIP IS RECESSED, NOT THE PAGE COLOUR. `surfaceSunk` is the step INTO
                the card the drawing takes here (`surface-container-low` under a `surface-container`
                card); `bg` would read as a hole punched through it. */}
            {drawn === undefined ? null : (
              <View style={styles.projectFoot}>
                <View style={styles.footItem}>
                  <MaterialIcons name="groups" size={14} color={p.muted} />
                  <Text style={styles.footText}>
                    {t('home.viewer.workers', { count: drawn.crew })}
                  </Text>
                </View>
                <View style={styles.footItem}>
                  <MaterialIcons name="report" size={14} color={issueColor} />
                  <Text style={[styles.footText, { color: issueColor }]}>
                    {t('home.viewer.issues', { count: drawn.issues })}
                  </Text>
                </View>
              </View>
            )}
          </View>
        );
      })}

      <Text style={styles.sectionTitle}>{t('home.viewer.siteActivity')}</Text>
      <View testID="viewer-activity" style={styles.timelineCard}>
        {VIEWER_SITE_ACTIVITY.value.map((entry, index) => {
          const last = index === VIEWER_SITE_ACTIVITY.value.length - 1;
          return (
            <View key={entry.at} style={[styles.timelineRow, last && styles.timelineRowLast]}>
              <View style={[styles.timelineDot, { backgroundColor: TONE_COLOR[entry.tone](p) }]} />
              <Text style={styles.timelineWhen}>
                {t('home.viewer.activityWhen', { at: entry.at, where: entry.where })}
              </Text>
              <Text style={styles.timelineWhat}>
                {t(`home.viewer.activity.${entry.key}`, {
                  who: 'who' in entry ? entry.who : '',
                  quote: 'quote' in entry ? entry.quote : '',
                })}
              </Text>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    hero: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.hero.fontSize,
      lineHeight: typography.hero.lineHeight,
    },
    pairRow: { flexDirection: 'row', gap: spacing.sm },

    // ── the bento tiles ───────────────────────────────────────────────────────────────────────
    tile: {
      flex: 1,
      gap: spacing.xs,
      padding: spacing.md,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      backgroundColor: p.surface,
    },
    tileLabel: {
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    tileValue: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.hero.fontSize,
      lineHeight: typography.hero.lineHeight,
    },
    wideTile: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      backgroundColor: p.surface,
    },
    wideBody: { flex: 1, gap: spacing.xs },
    wideHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    wideValue: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.hero.fontSize,
      lineHeight: typography.hero.lineHeight,
    },
    wideAside: { alignItems: 'flex-end', gap: spacing.xs / 2 },
    deltaText: {
      color: p.success,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
    },
    asideMeta: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
    },

    // ── the insight card ──────────────────────────────────────────────────────────────────────
    insightCard: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      borderLeftColor: p.accent,
      backgroundColor: p.surfaceSoft,
    },
    insightHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    insightPlate: {
      width: PLATE,
      height: PLATE,
      borderRadius: plateRadius(PLATE),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.surfaceBright,
    },
    insightTitle: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    insightBody: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },

    // ── section heads ─────────────────────────────────────────────────────────────────────────
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.title.fontSize,
      lineHeight: typography.title.lineHeight,
    },
    viewAll: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    notice: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },

    // ── project cards ─────────────────────────────────────────────────────────────────────────
    projectCard: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      overflow: 'hidden',
    },
    projectBody: { gap: spacing.sm, padding: spacing.md },
    projectHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    projectTitleBlock: { flex: 1, gap: spacing.xs / 2 },
    projectName: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.body.fontSize,
    },
    projectMeta: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
    },
    statusChip: {
      paddingHorizontal: spacing.sm,
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
    progressBlock: { gap: spacing.xs },
    progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
    progressLabel: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
    },
    progressTrack: {
      height: 8,
      borderRadius: 999,
      backgroundColor: p.surfaceSunk,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 999 },
    projectFoot: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: p.surfaceSunk,
    },
    footItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    footText: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
    },

    // ── the activity timeline ─────────────────────────────────────────────────────────────────
    timelineCard: {
      padding: spacing.md,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    timelineRow: {
      paddingLeft: spacing.md,
      paddingBottom: spacing.md,
      borderLeftWidth: 1,
      borderLeftColor: p.border,
      gap: spacing.xs / 2,
    },
    // The rail stops at the last entry, as the drawing's `last:border-0 last:pb-0` does.
    timelineRowLast: { paddingBottom: 0, borderLeftColor: 'transparent' },
    timelineDot: {
      position: 'absolute',
      left: -4,
      top: 4,
      width: 8,
      height: 8,
      borderRadius: 999,
    },
    timelineWhen: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
    },
    timelineWhat: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
  });
