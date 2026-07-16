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

interface ProjectPickerProps {
  selectedId: string;
  onSelect: (projectId: string) => void;
  /** 'dark' for the §32.7 "Mobile Dark Surfaces" screens. Defaults to the light field-app palette. */
  variant?: 'light' | 'dark';
}

export function ProjectPicker({ selectedId, onSelect, variant = 'light' }: ProjectPickerProps) {
  const projects = useCollection<Project>('local_projects');
  const t = useT();
  const dark = variant === 'dark';

  useEffect(() => {
    refreshProjectsCache().catch(() => {
      // offline or transient — keep showing the cached list
    });
  }, []);

  return (
    <View testID="project-picker" style={styles.container}>
      <Text style={[styles.label, dark && styles.mutedDark]}>{t('common.project.label')}</Text>
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
                key={p.id}
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
