// Issues screen — SITE_WORKER quick issue create (+ photo) & offline list; SITE_ENGINEER escalate.
// Create (G-M11): generates a client UUID (expo-crypto) used as BOTH the local/issue id AND the
// PhotoCapture entity_id, then writes local_issues (PENDING) and enqueues an 'issue' sync item
// (client_id → server issue_id) so the issue actually pushes and the attached photo links on sync.
// Escalate (G-M12): POST /site/issues/:id/escalate → notifies the PM (online-only).

import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import * as Crypto from 'expo-crypto';
import { db, newLocalId } from '../../db/database';
import type { Issue } from '../../db/database';
import { localIssues } from '../../db/schema';
import { enqueue } from '../../db/sync-queue';
import { post } from '../../api/client';
import { useCollection } from '../../hooks/useCollection';
import { StatusChip } from '../../components/StatusChip';
import { ProjectPicker } from '../../components/ProjectPicker';
import { PhotoCapture } from '../../components/PhotoCapture';
import { OptimisticList } from '../../components/OptimisticList';
import { useT } from '../../i18n';
import { colors, fontFamily, radius, spacing, typography } from '../../theme/tokens';
import { screen } from '../../theme/screenStyles';

export default function IssuesScreen() {
  const issues = useCollection<Issue>('local_issues');
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [draftId, setDraftId] = useState(() => Crypto.randomUUID()); // id for the issue + its photo
  const [escalated, setEscalated] = useState<Record<string, boolean>>({});
  const t = useT();

  const onCreate = async (): Promise<void> => {
    await db.insert(localIssues).values({
      id: newLocalId(),
      issueId: draftId, // client UUID becomes the server issue_id on sync (G-M11)
      projectId: projectId.trim(),
      title: title.trim(),
      severity: 'MEDIUM',
      status: 'OPEN',
      offlineSyncStatus: 'PENDING',
    });
    enqueue('issue', draftId, 'CREATE', {
      client_id: draftId,
      project_id: projectId.trim(),
      title: title.trim(),
      severity: 'MEDIUM',
    });
    setTitle('');
    setDraftId(Crypto.randomUUID()); // fresh id (and photo scope) for the next issue
  };

  const onEscalate = (issueId: string): void => {
    // Online-only notify (post() throws offline rather than queuing a bogus escalate).
    post(`/site/issues/${issueId}/escalate`, {})
      .then(() => setEscalated((e) => ({ ...e, [issueId]: true })))
      .catch(() => {
        /* offline/error — leave un-escalated; user can retry */
      });
  };

  return (
    <View testID="issues-screen" style={screen.container}>
      <ProjectPicker selectedId={projectId} onSelect={setProjectId} />
      <TextInput
        testID="issue-title-input"
        style={screen.input}
        placeholder={t('site.issues.titlePlaceholder')}
        placeholderTextColor={colors.textSecondary}
        value={title}
        onChangeText={setTitle}
      />
      <PhotoCapture entityType="issue" entityId={draftId} />
      <TouchableOpacity
        testID="create-issue-button"
        style={[
          screen.primaryButton,
          (!projectId.trim() || !title.trim()) && screen.buttonDisabled,
        ]}
        onPress={onCreate}
        disabled={!projectId.trim() || !title.trim()}
      >
        <Text style={screen.primaryButtonText}>{t('site.issues.submit')}</Text>
      </TouchableOpacity>

      <View style={styles.list}>
        <OptimisticList<Issue>
          testID="issue-list"
          data={issues}
          keyExtractor={(item) => item.id}
          isPending={(item) => item.offlineSyncStatus === 'PENDING'}
          emptyText={t('site.issues.empty')}
          renderItem={(item) => (
            <View testID="issue-item" style={screen.item}>
              <Text style={screen.itemTitle}>{item.title}</Text>
              <View style={styles.chips}>
                <StatusChip label={item.severity} />
                <StatusChip label={item.offlineSyncStatus} />
                {/* Escalate only a synced issue (has a server id) that isn't already escalated. */}
                {item.issueId && item.offlineSyncStatus === 'SYNCED' ? (
                  <TouchableOpacity
                    testID={`escalate-${item.issueId}`}
                    style={[styles.escalate, escalated[item.issueId] && styles.escalateDone]}
                    onPress={() => onEscalate(item.issueId)}
                    disabled={escalated[item.issueId]}
                  >
                    <Text style={styles.escalateText}>
                      {escalated[item.issueId]
                        ? t('site.issues.escalated')
                        : t('site.issues.escalate')}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: spacing.sm },
  chips: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  escalate: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.warning,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  escalateDone: { backgroundColor: colors.warning },
  escalateText: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.medium,
    color: colors.textPrimary,
  },
});
