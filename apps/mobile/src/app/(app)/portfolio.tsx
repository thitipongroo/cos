// Portfolio screen — EXECUTIVE: project list with status (read-only, offline-cached).
// Reads local_projects (refreshed from GET /projects when online).

import { useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import Project from '../../db/models/Project';
import { useCollection } from '../../hooks/useCollection';
import { refreshProjectsCache } from '../../api/projects';
import { StatusChip } from '../../components/StatusChip';
import { useT } from '../../i18n';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';

export default function PortfolioScreen() {
  const projects = useCollection<Project>('local_projects');
  const t = useT();

  useEffect(() => {
    refreshProjectsCache().catch(() => {
      /* offline — show cached */
    });
  }, []);

  return (
    <View testID="portfolio-screen" style={styles.container}>
      <Text style={styles.heading}>{t('exec.portfolio.title')}</Text>
      <FlatList
        testID="portfolio-list"
        data={projects}
        keyExtractor={(p) => p.id}
        ListEmptyComponent={<Text style={styles.empty}>{t('exec.portfolio.empty')}</Text>}
        renderItem={({ item }) => (
          <View testID="portfolio-item" style={styles.item}>
            <Text style={styles.itemTitle}>{item.projectName}</Text>
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
