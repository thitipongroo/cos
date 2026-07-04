// Issues screen — SITE_WORKER quick issue create + offline list (reads local_issues reactively).
// Creating writes a local_issues row (sync_status PENDING); SyncManager replays it on reconnect.

import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { database } from '../../db/database';
import Issue from '../../db/models/Issue';
import { useCollection } from '../../hooks/useCollection';
import { StatusChip } from '../../components/StatusChip';
import { ProjectPicker } from '../../components/ProjectPicker';
import { useT } from '../../i18n';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';

export default function IssuesScreen() {
  const issues = useCollection<Issue>('local_issues');
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const t = useT();

  const onCreate = async (): Promise<void> => {
    await database.write(async () => {
      await database.get<Issue>('local_issues').create((r) => {
        r.issueId = '';
        r.projectId = projectId.trim();
        r.title = title.trim();
        r.severity = 'MEDIUM';
        r.status = 'OPEN';
        r.offlineSyncStatus = 'PENDING';
      });
    });
    setTitle('');
  };

  return (
    <View testID="issues-screen" style={styles.container}>
      <Text style={styles.heading}>{t('site.issues.title')}</Text>

      <ProjectPicker selectedId={projectId} onSelect={setProjectId} />
      <TextInput
        testID="issue-title-input"
        style={styles.input}
        placeholder={t('site.issues.titlePlaceholder')}
        placeholderTextColor={colors.textSecondary}
        value={title}
        onChangeText={setTitle}
      />
      <TouchableOpacity
        testID="create-issue-button"
        style={[styles.button, (!projectId.trim() || !title.trim()) && styles.buttonDisabled]}
        onPress={onCreate}
        disabled={!projectId.trim() || !title.trim()}
      >
        <Text style={styles.buttonText}>{t('site.issues.submit')}</Text>
      </TouchableOpacity>

      <FlatList
        testID="issue-list"
        style={styles.list}
        data={issues}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>{t('site.issues.empty')}</Text>}
        renderItem={({ item }) => (
          <View testID="issue-item" style={styles.item}>
            <Text style={styles.itemTitle}>{item.title}</Text>
            <View style={styles.chips}>
              <StatusChip label={item.severity} />
              <StatusChip label={item.offlineSyncStatus} />
            </View>
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
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textPrimary,
  },
  button: {
    minHeight: 48,
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    color: colors.bg,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
  },
  list: { marginTop: spacing.sm },
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
  chips: { flexDirection: 'row', gap: spacing.xs },
  empty: { color: colors.textSecondary, fontFamily: fontFamily.regular, padding: spacing.md },
});
