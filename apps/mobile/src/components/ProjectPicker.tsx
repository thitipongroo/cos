// ProjectPicker — select a project from the offline cache (local_projects).
// Refreshes the cache from the server on mount (best-effort; ignored when offline). Replaces the
// manual project_id text inputs on Report/Issues/Home now that projects are cached (§17.4).

import { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import type { Project } from '../db/database';
import { useCollection } from '../hooks/useCollection';
import { refreshProjectsCache } from '../api/projects';
import { useT } from '../i18n';
import { colors, darkColors, fontFamily, spacing, typography } from '../theme/tokens';

/** The minimum a chip needs. The offline-cache Project satisfies it; so does a scoped server list. */
export interface PickerProject {
  projectId: string;
  projectCode: string;
}

interface ProjectPickerProps {
  selectedId: string;
  onSelect: (projectId: string) => void;
  /** 'dark' for the §32.7 "Mobile Dark Surfaces" screens. Defaults to the light field-app palette. */
  variant?: 'light' | 'dark';
  /**
   * An explicit project list to show instead of the whole-tenant offline cache — e.g. the
   * SITE_ENGINEER home passes the projects that engineer is a member of. When given, the cache is not
   * read or refreshed.
   */
  projects?: PickerProject[];
  /** Hide the "Project" heading above the chips (SITE_ENGINEER home shows only the chips). */
  hideLabel?: boolean;
}

export function ProjectPicker({
  selectedId,
  onSelect,
  variant = 'light',
  projects: scoped,
  hideLabel,
}: ProjectPickerProps) {
  const cached = useCollection<Project>('local_projects');
  const projects: PickerProject[] = scoped ?? cached;
  const t = useT();
  const dark = variant === 'dark';

  useEffect(() => {
    // Only the whole-tenant cache path refreshes; a scoped list is owned by the caller.
    if (scoped) return;
    refreshProjectsCache().catch(() => {
      // offline or transient — keep showing the cached list
    });
  }, [scoped]);

  return (
    <View testID="project-picker" style={styles.container}>
      {hideLabel ? null : (
        <Text style={[styles.label, dark && styles.mutedDark]}>{t('common.project.label')}</Text>
      )}
      {projects.length === 0 ? (
        <Text testID="project-picker-empty" style={[styles.empty, dark && styles.mutedDark]}>
          {t('common.project.empty')}
        </Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {projects.map((p) => {
            const active = p.projectId === selectedId;
            return (
              <TouchableOpacity
                key={p.projectId}
                testID={`project-option-${p.projectId}`}
                style={[
                  styles.chip,
                  dark && styles.chipDark,
                  active && styles.chipActive,
                  // The active chip is --mobile-primary on both palettes: a learned tap target
                  // never changes colour between screens (§32.7).
                ]}
                onPress={() => onSelect(p.projectId)}
              >
                <Text
                  style={[
                    styles.chipText,
                    dark && styles.chipTextDark,
                    active && styles.chipTextActive,
                  ]}
                >
                  {p.projectCode}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  row: { gap: spacing.xs },
  chip: {
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipDark: { borderColor: darkColors.border, backgroundColor: darkColors.surface },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.medium,
    color: colors.textPrimary,
  },
  chipTextDark: { color: darkColors.text },
  chipTextActive: { color: colors.bg },
  mutedDark: { color: darkColors.muted },
  empty: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
});
