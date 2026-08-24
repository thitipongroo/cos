// Projects screen — PROJECT_MANAGER project status list. Reads the offline project cache
// (local_projects) and refreshes from GET /projects when online.

import { memo, useCallback, useEffect } from 'react';
import { View, Text, FlatList } from 'react-native';
import type { Project } from '../../db/database';
import { useCollection } from '../../hooks/useCollection';
import { refreshProjectsCache } from '../../api/projects';
import { StatusChip } from '../../components/StatusChip';
import { useT } from '../../i18n';
import { screen } from '../../theme/screenStyles';

/** One project, memoized — the row of a list read whole from the local cache. */
const ProjectItem = memo(function ProjectItem({ project }: { project: Project }) {
  return (
    <View testID="project-item" style={screen.item}>
      <Text style={screen.itemTitle}>
        {project.projectCode} · {project.projectName}
      </Text>
      <StatusChip label={project.status} />
    </View>
  );
});

export default function ProjectsScreen() {
  const projects = useCollection<Project>('local_projects');
  const t = useT();

  const renderProject = useCallback(
    ({ item }: { item: Project }) => <ProjectItem project={item} />,
    [],
  );

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
        renderItem={renderProject}
      />
    </View>
  );
}
