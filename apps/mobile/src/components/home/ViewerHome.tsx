// ── VIEWER — the read-only portfolio: what is running, what is wrong, and what just happened ─────
//
// DRAWING: mockup/mobile/role_viewer/01_home/01_dashboard (Stitch screen "Viewer Home Dashboard -
// Mobile (Fixed Dark Mode)").
//
// REDRAWN 2026-09-11, and the redraw is why the repo copy is re-verified rather than trusted. The
// first build of this screen was made against the 2026-09-10 export; the product owner edited the
// drawing the next day and asked "ไม่ตรวจดูเหรอว่ามีการเปลี่ยนแปลงอะไรหรือไม่". Four of the five
// VIEWER screens had changed — the screen COUNT in Stitch had only told us two were ADDED. All
// seven are now re-downloaded and sha256-compared against the repo copies.
//
// WHAT THE REDRAW CHANGED HERE:
//   · the invented header (menu · wordmark · SYNCED pill · avatar) became the app's REAL <TopBar />,
//     so the drawing now agrees with the shell instead of asking for a second one
//   · the bar became `Home · Projects · Procurement · Budget` — the enumerated bar the product
//     owner kept in escalation E1, so the drawing and the app no longer disagree about it
//   · `$142.5M` became `฿ 142.5 M`, which is `compactMoneyLabel`'s own output
//   · "Portfolio Overview" is gone; the screen opens on the tiles
//   · every tile, card and activity row gained a way onward: `VIEW ›`, `TRACK ›`, a chevron
//
// WHY THIS SCREEN EXISTS. Until today VIEWER fell through `home.tsx`'s switch to <MinimalHome />, a
// 22-line placeholder showing one pending-sync count. That is the same gap CRM_SALES_MANAGER had
// until 2026-09-09, and it is closed the same way.
//
// WHAT IS REAL, AND THE REAL PART IS THE TOP OF THE SCREEN.
//   Active Projects  a count of `local_projects` — the §17.4 read-through cache this role's
//                    /projects tab already reads. Not a drawn 12.
//   Open Issues      `GET /site/issues?status=OPEN`, counted.
//
//                    IT TOOK THREE ANSWERS TO GET RIGHT, and the first two both rendered
//                    perfectly. It counted `local_issues` and printed a confident **0** — that
//                    table is filled by delta sync from work THIS DEVICE did, and a VIEWER writes
//                    nothing, so it is empty and always will be. It then fetched the endpoint and
//                    drew an em dash for every **403**, measured with a real token: the route
//                    refused a role §6.8 grants `Issues R`. For one day it drew a registered 47.
//                    ADR-103 opened the route on 2026-09-11 and the tile reads it again. Until the
//                    request settles it shows a DASH, never a zero — "not loaded" and "none" are
//                    different answers (`countLabel`, HomeKit).
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
import { get } from '../../api/client';
import { type ActiveIssue } from '../../lib/siteEngineerHome';
import { useT } from '../../i18n';
import { AiCardFooter } from '../AiCardFooter';
import { useComingSoon } from '../useComingSoon';
import { compactMoneyLabel } from '../../lib/compactMoney';
import { projectStatusTone } from '../../lib/projectStatusTone';
import {
  VIEWER_HOME_PROJECT_CARDS,
  VIEWER_PORTFOLIO_BUDGET,
  VIEWER_SITE_ACTIVITY,
  VIEWER_SYSTEM_INSIGHT,
} from '../../lib/mockupFigures';
import { usePalette, type Palette } from '../../theme/usePalette';
import { fontFamily, plateRadius, radius, spacing, typography } from '../../theme/tokens';
import { Screen, KpiRegion, countLabel, asList } from './HomeKit';

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
  const soon = useComingSoon();

  const projects = useCollection<Project>('local_projects');
  /** `null` until the request settles — the tile draws a dash for it, never a zero. */
  const [openIssues, setOpenIssues] = useState<number | null>(null);

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
    // The portfolio's open issues. The endpoint does the filtering, so nothing here re-decides
    // which statuses count as open.
    get<{ items?: ActiveIssue[] } | ActiveIssue[]>('/site/issues', { status: 'OPEN' })
      .then((res) => {
        if (!cancelled) setOpenIssues(asList(res).length);
      })
      .catch(() => {
        /* offline — the tile keeps its dash rather than claiming a count */
      });
    return () => {
      cancelled = true;
    };
    // Mount only. The effect reads nothing from render, so there is no stale closure to guard
    // against — whether the cache has rows is decided below, at the point it is drawn.
  }, []);

  const tracked = projects.slice(0, HOME_PROJECT_COUNT);

  return (
    <Screen testID="home-screen" scroll>
      {/* NO PAGE HEADING. "Portfolio Overview" was removed in the 2026-09-11 redraw and the screen
          opens on the tiles — a screen is named ONCE (§32.7), and the tab bar already names it. */}
      <KpiRegion loading={projectsState === 'loading'} settled={0} steps={1}>
        {/* THE BENTO GRID. Two counted tiles, then the budget across both columns — the drawing's
            own arrangement, each with its 4px accent bar and its own way onward. */}
        <View style={styles.pairRow}>
          <Pressable
            testID="viewer-kpi-projects"
            accessibilityRole="button"
            accessibilityLabel={t('home.viewer.activeProjects')}
            onPress={() => router.push('/projects')}
            style={[styles.tile, { borderLeftColor: p.accent }]}
          >
            <View style={styles.tileHead}>
              <MaterialIcons name="domain" size={22} color={p.accent} />
              <MaterialIcons name="chevron-right" size={20} color={p.muted} />
            </View>
            <Text style={styles.tileLabel}>{t('home.viewer.activeProjects')}</Text>
            <View style={styles.tileFoot}>
              <Text style={styles.tileValue}>{projects.length}</Text>
              <Text style={[styles.tileAction, { color: p.accent }]}>{t('home.viewer.view')}</Text>
            </View>
          </Pressable>

          <Pressable
            testID="viewer-kpi-issues"
            accessibilityRole="button"
            accessibilityLabel={t('home.viewer.openIssues')}
            // The COUNT is real now (ADR-103), and `/issues` is still not a route this role can
            // REACH: §32.7 kept it off the bar because its create button is not role-gated, and
            // opening a read route did not change that. So TRACK still says so on the press.
            onPress={() => soon('home.viewer.openIssues')}
            style={[styles.tile, { borderLeftColor: p.warning }]}
          >
            <View style={styles.tileHead}>
              <MaterialIcons name="warning" size={22} color={p.warning} />
              <MaterialIcons name="chevron-right" size={20} color={p.muted} />
            </View>
            <Text style={styles.tileLabel}>{t('home.viewer.openIssues')}</Text>
            <View style={styles.tileFoot}>
              {/* REAL since ADR-103 opened `GET /site/issues` to this role. A dash while the
                  request is in flight; never a zero, which would state a fact about a portfolio
                  nothing has counted yet. */}
              <Text style={styles.tileValue}>{countLabel(openIssues)}</Text>
              <Text style={[styles.tileAction, { color: p.warning }]}>
                {t('home.viewer.track')}
              </Text>
            </View>
          </Pressable>
        </View>

        <Pressable
          testID="viewer-kpi-budget"
          accessibilityRole="button"
          accessibilityLabel={t('home.viewer.budget')}
          onPress={() => router.push('/budget')}
          style={[styles.wideTile, { borderLeftColor: p.success }]}
        >
          <View style={styles.wideBody}>
            <View style={styles.wideHead}>
              <MaterialIcons name="payments" size={16} color={p.success} />
              <Text style={styles.tileLabel}>{t('home.viewer.budget')}</Text>
            </View>
            {/* DRAWN — see VIEWER_PORTFOLIO_BUDGET. Formatted, not printed: the drawing's
                `฿ 142.5 M` is `compactMoneyLabel`'s own output, so the symbol and the suffix come
                from the money layer and follow the reader's locale. */}
            <Text style={styles.wideValue}>
              {compactMoneyLabel(
                VIEWER_PORTFOLIO_BUDGET.value.amount,
                VIEWER_PORTFOLIO_BUDGET.value.currency,
                t,
                { maxScale: 'million' },
              )}
            </Text>
          </View>
          <View style={styles.wideAsideRow}>
            <Text style={styles.deltaText}>
              {t('home.viewer.ytdDelta', { delta: VIEWER_PORTFOLIO_BUDGET.value.deltaPct })}
            </Text>
            <View style={styles.chevronPlate}>
              <MaterialIcons name="chevron-right" size={18} color={p.muted} />
            </View>
          </View>
        </Pressable>
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
        {/* A PILL NOW, not a bare word — the redraw gives it a tinted outline and a trailing
            arrow. `textTransform` does the uppercasing rather than the copy, so Thai is unaffected
            (it has no case). */}
        <Pressable
          testID="viewer-view-all"
          accessibilityRole="button"
          accessibilityLabel={t('home.viewer.viewAll')}
          onPress={() => router.push('/projects')}
          hitSlop={8}
          style={styles.viewAllPill}
        >
          <Text style={styles.viewAll}>{t('home.viewer.viewAll')}</Text>
          <MaterialIcons name="arrow-forward" size={14} color={p.accent} />
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
        // THE ISSUE COUNT IS TONED, AND THE REDRAW RAISED THE FLOOR. It read muted below ten and
        // danger at ten or more; the 2026-09-11 drawing colours the three-issue card WARNING and
        // the twelve-issue card DANGER, so no card's issue count is drawn as ordinary text.
        const issueColor =
          drawn === undefined ? p.muted : drawn.issues >= 10 ? p.danger : p.warning;
        return (
          <Pressable
            key={project.id}
            testID={`viewer-project-${project.id}`}
            accessibilityRole="button"
            accessibilityLabel={project.projectName}
            // No project detail screen exists for this role — `/dashboard` is the manager's, driven
            // by a projectId param and gated to roles this one is not. The card says so on a press.
            onPress={() => soon('home.viewer.projectDetail')}
            style={styles.projectCard}
          >
            <View style={styles.projectBody}>
              <View style={styles.projectHead}>
                <View style={styles.projectTitleBlock}>
                  {/* One line with an ellipsis — the rule the product owner set on 2026-09-10 for
                      every project and customer name in this app. The chevron sits beside the name
                      in the redraw, not at the card's trailing edge. */}
                  <View style={styles.projectNameRow}>
                    <Text style={styles.projectName} numberOfLines={1} ellipsizeMode="tail">
                      {project.projectName}
                    </Text>
                    <MaterialIcons name="chevron-right" size={18} color={p.muted} />
                  </View>
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
          </Pressable>
        );
      })}

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{t('home.viewer.siteActivity')}</Text>
        <Text style={styles.liveFeed}>{t('home.viewer.liveFeed')}</Text>
      </View>
      <View testID="viewer-activity" style={styles.timelineCard}>
        {VIEWER_SITE_ACTIVITY.value.map((entry, index) => {
          const last = index === VIEWER_SITE_ACTIVITY.value.length - 1;
          return (
            <Pressable
              key={entry.at}
              testID={`viewer-activity-${index}`}
              accessibilityRole="button"
              accessibilityLabel={t('home.viewer.activityWhen', {
                at: entry.at,
                where: entry.where,
              })}
              // Each entry is a different KIND of record — a site report, an issue, a sync run —
              // and no one screen opens all three. Drawn, and it says so on the press.
              onPress={() => soon('home.viewer.siteActivity')}
              style={[styles.timelineRow, last && styles.timelineRowLast]}
            >
              <View style={[styles.timelineDot, { backgroundColor: TONE_COLOR[entry.tone](p) }]} />
              <View style={styles.timelineBody}>
                <Text style={styles.timelineWhen}>
                  {t('home.viewer.activityWhen', { at: entry.at, where: entry.where })}
                </Text>
                {/* ONE LINE. The redraw truncates every entry ("…fails spec in Sec…"); the string
                    kept here is the whole one, and the clamp is what does the truncating — so a
                    screen reader still reads the sentence the register holds. */}
                <Text style={styles.timelineWhat} numberOfLines={1} ellipsizeMode="tail">
                  {t(`home.viewer.activity.${entry.key}`, {
                    who: 'who' in entry ? entry.who : '',
                    quote: 'quote' in entry ? entry.quote : '',
                  })}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={18} color={p.muted} />
            </Pressable>
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
    tileHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    tileFoot: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    tileAction: {
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
    },
    chevronPlate: {
      width: 32,
      height: 32,
      borderRadius: plateRadius(PLATE),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.surfaceBright,
    },

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
    wideAsideRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
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
    // UPPERCASE IN THE STYLE, NOT IN THE COPY. The redraw sets these headings in capitals; doing
    // it with `textTransform` keeps one string per language, and Thai — which has no case — renders
    // unchanged rather than being shouted at in a script that cannot shout.
    sectionTitle: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.title.fontSize,
      lineHeight: typography.title.lineHeight,
      textTransform: 'uppercase',
    },
    viewAllPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs / 2,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.accent,
    },
    viewAll: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    liveFeed: {
      color: p.muted,
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
    projectNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
    projectName: {
      flexShrink: 1,
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
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
      paddingLeft: spacing.md,
      paddingBottom: spacing.md,
      borderLeftWidth: 1,
      borderLeftColor: p.border,
    },
    timelineBody: { flex: 1, gap: spacing.xs / 2 },
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
