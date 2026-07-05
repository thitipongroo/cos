// Projects screen — PROJECT_MANAGER project status list. Reads the offline project cache
// (local_projects) and refreshes from GET /projects when online.

import { useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import type { Project } from '../../db/database';
import { useCollection } from '../../hooks/useCollection';
import { refreshProjectsCache } from '../../api/projects';
import { StatusChip } from '../../components/StatusChip';
import { useT } from '../../i18n';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';

export default function ProjectsScreen() {
  const projects = useCollection<Project>('local_projects');
  const t = useT();

  useEffect(() => {
    refreshProjectsCache().catch(() => {
      /* offline — show cached */
    });
  }, []);

  return (
    <View testID="projects-screen" style={styles.container}>
      <Text style={styles.heading}>{t('pm.projects.title')}</Text>
      <FlatList
        testID="projects-list"
        data={projects}
        keyExtractor={(p) => p.id}
        ListEmptyComponent={<Text style={styles.empty}>{t('pm.projects.empty')}</Text>}
        renderItem={({ item }) => (
          <View testID="project-item" style={styles.item}>
            <Text style={styles.itemTitle}>
              {item.projectCode} · {item.projectName}
            </Text>
            <StatusChip label={item.status} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.md, gap: spacing.sm },
  heading: {
    fontSize: typography.title.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textPrimary,
  },
  item: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
    gap: spacing.xs,
  },
  itemTitle: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.medium,
    color: colors.textPrimary,
  },
  empty: { color: colors.textSecondary, fontFamily: fontFamily.regular, padding: spacing.md },
});
