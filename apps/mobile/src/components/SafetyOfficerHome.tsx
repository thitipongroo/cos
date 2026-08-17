// Safety Officer Home — the role's landing dashboard.
//
// Reference mockup: `mockup/mobile/07_safety_officer/01_home/01_sa_home_dashboard/` (screen.png +
// code.html). Rendered by `(app)/home.tsx` for CosRole.SAFETY_OFFICER; it lives here rather than
// under app/ because everything in app/ is a route, and this is the Home tab's CONTENT.
//
// Before 2026-08-13 this role fell through `home.tsx`'s `default:` case to <MinimalHome />, a single
// "pending sync" tile — master §Phase 10 enumerates no Home for it (spec `20 §20.7.7` says so in
// those words), so nothing had ever been built.
//
// THE DRAWING'S THREE KPI TILES, AND WHAT EACH ONE CAN ACTUALLY SAY:
//
//   OPEN INCIDENTS — real. `GET /safety/compliance` returns `open_incidents`, a COUNT(*) over
//     `site_ops.incidents` where status = 'OPEN', scoped to the tenant and optionally the project.
//     The drawing's "04" is printed here as the query answers it.
//   COMPLIANCE 94% — THERE IS NO COMPLIANCE SCORE IN THIS PLATFORM. The endpoint named "compliance"
//     returns four counts and no percentage; `docs/specifications/` contains no compliance-score
//     formula, and grepping the whole tree for one finds nothing. The tile is drawn with the
//     drawing's label and says so.
//   SAFE HOURS · SINCE LAST LTI — the same, harder. Nothing in this product records working hours
//     against a lost-time injury; "LTI" appears nowhere in `context/` or `docs/specifications/`.
//     Drawn, and honest.
//
// Both unavailable tiles follow the product owner's 2026-08-13 ruling for every unbacked zone on
// these screens: draw it with the mockup's own copy and state plainly that it is not ready — the
// same treatment the Site Worker's AI Safety Scan and the manager's COMING SOON tiles already get.
// A substitute figure was offered and NOT chosen: `high_critical_incidents` and `expired_permits`
// are real and would fit these two slots, but they are not what the tiles say they are.
//
// THE DAILY SAFETY CHECKLIST CARD is half real and drawn that way. The template rows come from
// `GET /safety/checklists` and are the project's actual items. The drawing's "6/8 TASKS" chip does
// not: `site_ops.inspections` records ONE result per checklist (PASSED/FAILED), not a per-item
// state, so nothing can count six of eight. The chip's place carries the explanation instead.
//
// THE FAB is the drawing's "+ REPORT NEW". It opens the Incidents tab, which is where an incident is
// created — the drawing's tooltip pill is not reproduced as a permanently-visible label, because a
// tooltip that never disappears is a caption, and the button already carries the same words to a
// screen reader.

import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { get } from '../api/client';
import {
  getCompliance,
  listIncidents,
  type ComplianceSummary,
  type IncidentRow,
} from '../api/safety';
import { sortIncidents } from '../lib/safetyOfficer';
import { IncidentCard } from './IncidentCard';
import { LoadingBoundary } from './LoadingBoundary';
import { loadProgress } from '../lib/loadingState';
import { ProjectContextBar } from './ProjectContextBar';
import { UnavailableNote } from './UnavailableNote';
import { useProjectStore } from '../store/projectStore';
import { useT } from '../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';
import { usePalette, useIsDark, type Palette } from '../theme/usePalette';

/** How many incidents the Home summary lists before "View all" is the way to the rest. */
const RECENT_LIMIT = 3;

/** How many checklist rows the summary card shows — the drawing lists two. */
const CHECKLIST_PREVIEW = 2;

/** One row of `GET /safety/checklists`; `items` is the JSONB template array. */
interface ChecklistRow {
  checklist_id: string;
  checklist_name: string;
  items?: unknown;
}

interface ChecklistItem {
  item_id?: string;
  id?: string;
  description?: string;
  label?: string;
}

/** The template array, whether the row arrived parsed (server) or as JSON text (local cache). */
function itemsOf(source: unknown): ChecklistItem[] {
  if (Array.isArray(source)) return source as ChecklistItem[];
  if (typeof source !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(source);
    return Array.isArray(parsed) ? (parsed as ChecklistItem[]) : [];
  } catch {
    // A malformed template is a server-side data problem — render no rows rather than crash the
    // screen a safety officer opens the app to.
    return [];
  }
}

function labelOf(item: ChecklistItem, index: number): string {
  return item.description ?? item.label ?? `#${index + 1}`;
}

/** A list endpoint that may answer `T[]` or `{ items: T[] }`. */
function asList<T>(res: { items?: T[] } | T[]): T[] {
  return Array.isArray(res) ? res : (res.items ?? []);
}

export default function SafetyOfficerHome(): React.JSX.Element {
  const router = useRouter();
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
  const styles = makeStyles(p);

  // The chosen site, from the store — the same value <ProjectContextBar /> names at the top of the
  // screen. The shell raises <SelectProjectSheet /> for this role until it has one (2026-08-13), so
  // there is no second picker here to disagree with the bar.
  const projectId = useProjectStore((s) => s.active?.projectId ?? '');

  const [compliance, setCompliance] = useState<ComplianceSummary | null>(null);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [checklist, setChecklist] = useState<ChecklistRow | null>(null);
  const [loading, setLoading] = useState(true);
  // Honest load progress: three independent fetches, counted as each lands (Rule 40).
  const [settled, setSettled] = useState(0);
  const LOAD_STEPS = 3;

  // ON FOCUS, not on mount — the same fix the manager Home needed. A load fired once immediately
  // after sign-in can lose the race with the session and leave the dashboard permanently empty with
  // no way to retry but killing the app; returning to the tab retries.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      setSettled(0); // a re-focus reloads, so the percentage restarts with it
      const scope = projectId ? { projectId } : undefined;

      const complianceFetch = getCompliance(projectId || undefined)
        .then((res) => {
          if (!cancelled) setCompliance(res);
        })
        .catch(() => {
          /* offline — keep the last figures rather than showing wrong ones */
        });

      const incidentsFetch = listIncidents(scope)
        .then((rows) => {
          if (!cancelled) setIncidents(rows);
        })
        .catch(() => {
          /* offline — keep last */
        });

      const checklistFetch = get<{ items?: ChecklistRow[] } | ChecklistRow[]>(
        '/safety/checklists',
        projectId ? { project_id: projectId } : {},
      )
        .then((res) => {
          if (!cancelled) setChecklist(asList(res)[0] ?? null);
        })
        .catch(() => {
          /* offline — keep last */
        });

      const step = <T,>(p: Promise<T>): Promise<T> => {
        void p.finally(() => {
          if (!cancelled) setSettled((n) => n + 1);
        });
        return p;
      };
      void Promise.allSettled([
        step(complianceFetch),
        step(incidentsFetch),
        step(checklistFetch),
      ]).then(() => {
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [projectId]),
  );

  const now = new Date();
  const recent = sortIncidents(incidents).slice(0, RECENT_LIMIT);
  const checklistItems = itemsOf(checklist?.items).slice(0, CHECKLIST_PREVIEW);

  return (
    <View testID="home-screen" style={styles.root}>
      <ScrollView contentContainerStyle={styles.page}>
        <ProjectContextBar />

        <LoadingBoundary
          loading={loading}
          variant="widget"
          theme={isDark ? 'dark' : 'light'}
          progress={loadProgress(settled, LOAD_STEPS) ?? undefined}
          style={styles.kpiRegion}
        >
          {/* OPEN INCIDENTS — the drawing's full-width danger card. A real count. */}
          <Pressable
            testID="kpi-open-incidents"
            accessibilityRole="button"
            accessibilityLabel={t('safety.home.openIncidents')}
            onPress={() => router.push('/incidents')}
            style={[styles.alertTile, { borderLeftColor: p.danger }]}
          >
            <View style={styles.tileHead}>
              <Text style={[styles.tileLabel, { color: p.danger }]}>
                {t('safety.home.openIncidents')}
              </Text>
              <MaterialIcons name="warning" size={20} color={p.danger} />
            </View>
            <View style={styles.valueRow}>
              {/* A dash, never a 0, until the request settles: "no open incidents" and "not loaded"
                  are different facts and must not print the same. */}
              <Text style={styles.tileValue}>
                {compliance === null ? '—' : String(compliance.open_incidents)}
              </Text>
              <Text style={styles.tileUnit}>{t('safety.home.activeCases')}</Text>
            </View>
          </Pressable>

          <View style={styles.tileRow}>
            {/* COMPLIANCE — drawn, and there is no score to draw. */}
            <View testID="kpi-compliance" style={styles.tile}>
              <Text style={styles.tileLabel}>{t('safety.home.compliance')}</Text>
              <UnavailableNote
                testID="kpi-compliance-unavailable"
                variant="inline"
                reason={t('safety.home.complianceUnavailable')}
              />
            </View>
            {/* SAFE HOURS · SINCE LAST LTI — the same. */}
            <View testID="kpi-safe-hours" style={styles.tile}>
              <Text style={styles.tileLabel}>{t('safety.home.safeHours')}</Text>
              <UnavailableNote
                testID="kpi-safe-hours-unavailable"
                variant="inline"
                reason={t('safety.home.safeHoursUnavailable')}
              />
            </View>
          </View>
        </LoadingBoundary>

        {/* DAILY SAFETY CHECKLIST — real rows, unreal progress. */}
        <Pressable
          testID="home-checklist-card"
          accessibilityRole="button"
          accessibilityLabel={t('safety.home.checklistTitle')}
          onPress={() => router.push('/inspections')}
          style={styles.card}
        >
          <View style={styles.cardHead}>
            <MaterialIcons name="assignment-turned-in" size={20} color={p.accent} />
            <Text style={[styles.cardTitle, styles.grow]}>{t('safety.home.checklistTitle')}</Text>
            <MaterialIcons name="chevron-right" size={20} color={p.muted} />
          </View>
          <UnavailableNote
            testID="home-checklist-progress-unavailable"
            reason={t('safety.home.checklistProgressUnavailable')}
          />
          {checklistItems.length === 0 ? (
            <Text testID="home-checklist-empty" style={styles.muted}>
              {t('safety.home.checklistEmpty')}
            </Text>
          ) : (
            checklistItems.map((item, index) => (
              <View key={item.item_id ?? item.id ?? String(index)} style={styles.checklistRow}>
                {/* Unticked, every one of them: nothing stores whether an item was done, so a tick
                    here would assert something no record supports. */}
                <MaterialIcons name="check-box-outline-blank" size={20} color={p.muted} />
                <Text style={styles.checklistText} numberOfLines={2}>
                  {labelOf(item, index)}
                </Text>
              </View>
            ))
          )}
        </Pressable>

        {/* RECENT INCIDENTS */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{t('safety.home.recentIncidents')}</Text>
          <TouchableOpacity
            testID="home-incidents-view-all"
            accessibilityRole="link"
            accessibilityLabel={t('safety.home.viewAll')}
            onPress={() => router.push('/incidents')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.viewAll}
          >
            <Text style={styles.viewAllText}>{t('safety.home.viewAll')}</Text>
            <MaterialIcons name="chevron-right" size={16} color={p.accent} />
          </TouchableOpacity>
        </View>

        <LoadingBoundary
          loading={loading}
          variant="list"
          theme={isDark ? 'dark' : 'light'}
          progress={loadProgress(settled, LOAD_STEPS) ?? undefined}
        >
          {recent.length === 0 ? (
            <Text testID="home-no-incidents" style={styles.muted}>
              {t('safety.home.noIncidents')}
            </Text>
          ) : (
            recent.map((incident) => (
              <View key={incident.incident_id} style={styles.cardGap}>
                <IncidentCard
                  testID={`home-incident-${incident.incident_id}`}
                  incident={incident}
                  now={now}
                  variant="compact"
                  onPress={() => router.push('/incidents')}
                />
              </View>
            ))
          )}
        </LoadingBoundary>
      </ScrollView>

      {/* The drawing's "+ REPORT NEW". Black elevation, never a coloured glow — §32.7 prohibits it. */}
      <TouchableOpacity
        testID="home-report-incident-fab"
        accessibilityRole="button"
        accessibilityLabel={t('safety.home.reportNew')}
        onPress={() => router.push('/incidents')}
        style={[styles.fab, { backgroundColor: p.primary }]}
      >
        <MaterialIcons name="add" size={28} color={p.onPrimary} />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: p.bg },
    page: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl * 3 },
    kpiRegion: { gap: spacing.sm },
    grow: { flex: 1 },
    // The drawing's full-width alert tile — danger tint + 4px leading strip.
    alertTile: {
      justifyContent: 'space-between',
      gap: spacing.sm,
      minHeight: 108,
      padding: spacing.md,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      backgroundColor: p.surface,
    },
    tileRow: { flexDirection: 'row', gap: spacing.sm },
    tile: {
      flex: 1,
      justifyContent: 'space-between',
      gap: spacing.xs,
      minHeight: 108,
      padding: spacing.md,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    tileHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    tileLabel: {
      flexShrink: 1,
      color: p.muted,
      fontSize: 11,
      fontFamily: fontFamily.medium,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
    // Hero-sized because it is a FIGURE, not the screen's name — `pageTitle.spec.ts` draws exactly
    // that distinction, and this element renders a value rather than a translated constant.
    tileValue: {
      color: p.text,
      fontSize: typography.hero.fontSize,
      lineHeight: typography.hero.lineHeight,
      fontFamily: fontFamily.bold,
    },
    tileUnit: {
      color: p.muted,
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
    },
    card: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    cardGap: { marginBottom: spacing.xs },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    cardTitle: {
      color: p.text,
      fontSize: typography.caption.fontSize,
      fontFamily: fontFamily.semibold,
    },
    checklistRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 32 },
    checklistText: {
      flex: 1,
      color: p.text,
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
    },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: touchTarget.iconButton,
    },
    sectionTitle: {
      color: p.muted,
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    viewAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    viewAllText: {
      color: p.accent,
      fontSize: 11,
      fontFamily: fontFamily.bold,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    muted: {
      color: p.muted,
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
    },
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
  });
