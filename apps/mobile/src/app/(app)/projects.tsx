// Projects screen — PROJECT_MANAGER project status list. Reads the offline project cache
// (local_projects) and refreshes from GET /projects when online.

import { useEffect } from 'react';
import { View, Text, FlatList } from 'react-native';
import type { Project } from '../../db/database';
import { useCollection } from '../../hooks/useCollection';
import { refreshProjectsCache } from '../../api/projects';
import { StatusChip } from '../../components/StatusChip';
import { useT } from '../../i18n';
import { screen } from '../../theme/screenStyles';

export default function ProjectsScreen() {
  const projects = useCollection<Project>('local_projects');
  const t = useT();

  useEffect(() => {
    refreshProjectsCache().catch(() => {
      /* offline — show cached */
    });
  }, []);

  return (
    <View testID="projects-screen" style={screen.container}>
      <FlatList
        testID="projects-list"
        data={projects}
        keyExtractor={(p) => p.id}
        ListEmptyComponent={<Text style={screen.empty}>{t('pm.projects.empty')}</Text>}
        renderItem={({ item }) => (
          <View testID="project-item" style={screen.item}>
            <Text style={screen.itemTitle}>
              {item.projectCode} · {item.projectName}
            </Text>
            <StatusChip label={item.status} />
          </View>
        )}
      />
    </View>
  );
}
