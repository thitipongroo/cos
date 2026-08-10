// Which site am I on today — the Site Worker's first screen
// (mockup 05_site_worker/01_home/00_sw_project_selection, added to that set on 2026-08-10).
//
// THE FLOW IT OPENS. Every screen in that role's corrected mockups now prints the project the worker
// is on, so one answer has to be given before the rest mean anything. This screen collects it, the
// store remembers it across launches, and `<ProjectContextBar />` both shows it and comes back here
// to change it.
//
// ONLY THE WORKER'S OWN PROJECTS. `GET /projects/mine` is JWT-scoped to `project_members`, so the
// list is the sites this person is actually assigned to — not every site in the tenant. A picker
// offering a project someone cannot open would be a list of doors that do not turn.
//
// THE STATUS CHIP IS THE PROJECT'S OWN, not a decoration: `ProjectStatus` is DRAFT · ACTIVE ·
// ON_HOLD · COMPLETED · CANCELLED, and the tone comes from lib/projectStatusTone.ts so this screen,
// the manager's project cards and StatusChip cannot disagree about what green means.
//
// The drawing's location line under each name is the project's BUILDING (PO decision 2026-08-11).
// There is no zone field on a project or a membership; the building is the narrowest real location
// the data has, and a project without one shows its code instead of an invented place.

import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { getMyProjects, type MyProject } from '../../api/projects';
import { projectStatusTone } from '../../lib/projectStatusTone';
import { useProjectStore } from '../../store/projectStore';
import { useI18n } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette, type Palette } from '../../theme/usePalette';

export default function SelectProjectScreen(): React.JSX.Element {
  // `statusLabel` is the same helper StatusChip uses, so a status reads one way across the app —
  // and never as the raw enum, which is what this screen printed at first ("ON_HOLD").
  const { t, statusLabel } = useI18n();
  const p = usePalette();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(p), [p]);

  const active = useProjectStore((s) => s.active);
  const select = useProjectStore((s) => s.select);

  const [projects, setProjects] = useState<MyProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setFailed(false);
      getMyProjects()
        .then((rows) => {
          if (!cancelled) setProjects(rows);
        })
        .catch(() => {
          // The list is the whole screen, so a failure must not read as "you are on no sites".
          if (!cancelled) setFailed(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // Name or code, case-insensitively — a worker searching types either.
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === '') return projects;
    return projects.filter(
      (row) =>
        row.project_name.toLowerCase().includes(needle) ||
        row.project_code.toLowerCase().includes(needle),
    );
  }, [projects, query]);

  const choose = useCallback(
    (row: MyProject) => {
      void select({
        projectId: row.project_id,
        projectCode: row.project_code,
        projectName: row.project_name,
        buildingName: row.building_name ?? null,
      });
      // `replace`, not `push`: this screen is the answer to a question, and once answered there is
      // nothing to come back to. Changing project later re-enters it from the context bar.
      router.replace('/home');
    },
    [select, router],
  );

  const toneColor = (status: string): string => {
    const tone = projectStatusTone(status);
    return tone === 'success' ? p.success : tone === 'warning' ? p.warning : p.muted;
  };

  return (
    <ScrollView
      testID="select-project-screen"
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={styles.page}
    >
      <View style={styles.heading}>
        <Text style={styles.title}>{t('project.select.title')}</Text>
        <Text style={styles.subtitle}>{t('project.select.subtitle')}</Text>
      </View>

      <View style={styles.search}>
        <MaterialIcons name="search" size={20} color={p.muted} />
        <TextInput
          testID="select-project-search"
          value={query}
          onChangeText={setQuery}
          placeholder={t('project.select.searchPlaceholder')}
          placeholderTextColor={p.muted}
          style={styles.searchInput}
          accessibilityLabel={t('project.select.searchPlaceholder')}
        />
      </View>

      {loading ? <ActivityIndicator testID="select-project-loading" color={p.primary} /> : null}

      {!loading && failed ? (
        <Text testID="select-project-failed" style={styles.notice}>
          {t('project.select.loadFailed')}
        </Text>
      ) : null}

      {!loading && !failed && projects.length === 0 ? (
        <Text testID="select-project-empty" style={styles.notice}>
          {t('project.select.none')}
        </Text>
      ) : null}

      {!loading && !failed && projects.length > 0 && shown.length === 0 ? (
        <Text testID="select-project-no-match" style={styles.notice}>
          {t('project.select.noMatch', { query: query.trim() })}
        </Text>
      ) : null}

      {shown.map((row) => {
        const current = active?.projectId === row.project_id;
        return (
          <Pressable
            key={row.project_id}
            testID={`select-project-${row.project_id}`}
            accessibilityRole="button"
            accessibilityLabel={row.project_name}
            onPress={() => choose(row)}
            style={[styles.card, { borderLeftColor: current ? p.accent : p.border }]}
          >
            <View style={styles.cardBody}>
              <View style={styles.cardHead}>
                {current ? (
                  <View style={styles.currentChip}>
                    <Text style={styles.currentText}>{t('project.select.current')}</Text>
                  </View>
                ) : null}
                <Text style={styles.code}>{row.project_code}</Text>
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {row.project_name}
              </Text>
              <View style={styles.locationRow}>
                <MaterialIcons name="location-on" size={14} color={p.muted} />
                <Text style={styles.location} numberOfLines={1}>
                  {row.building_name ?? row.project_code}
                </Text>
              </View>
            </View>

            <View style={styles.statusBlock}>
              <Text style={styles.statusLabel}>{t('project.select.status')}</Text>
              <Text style={[styles.status, { color: toneColor(row.status) }]}>
                {statusLabel(row.status)}
              </Text>
            </View>
            <MaterialIcons name="arrow-forward" size={20} color={p.muted} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.sm },

    heading: { gap: 2, marginBottom: spacing.xs },
    title: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.title.fontSize,
      lineHeight: typography.title.lineHeight,
    },
    subtitle: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },

    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: touchTarget.secondaryButton,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    searchInput: {
      flex: 1,
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      paddingVertical: spacing.xs,
    },

    notice: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },

    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      backgroundColor: p.surface,
    },
    cardBody: { flex: 1, gap: spacing.xs / 2 },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    currentChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 1,
      borderRadius: radius.xl,
      backgroundColor: p.accent,
    },
    currentText: {
      color: p.bg,
      fontFamily: fontFamily.bold,
      fontSize: 9,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    code: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    name: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.body.fontSize,
    },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    location: {
      flex: 1,
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },

    statusBlock: { alignItems: 'flex-end', gap: 2 },
    statusLabel: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: 10,
    },
    status: {
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
  });
