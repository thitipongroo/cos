// Incidents screen — SAFETY_OFFICER: report safety incidents offline + reactive list.
// Read: local_incidents (populated by delta-sync + local creates), shown via useCollection.
// Create: writes a local_incidents row (sync_status PENDING) for instant display AND enqueues a
// 'safety' sync_queue item → SyncManager pushes it to /sync/push → SafetyService.createIncident.
// (PENDING→SYNCED reconciliation / delta-dedup is the same known limitation as the issues screen.)

import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { db, newLocalId } from '../../db/database';
import type { Incident } from '../../db/database';
import { localIncidents } from '../../db/schema';
import { enqueue } from '../../db/sync-queue';
import { useCollection } from '../../hooks/useCollection';
import { StatusChip } from '../../components/StatusChip';
import { ProjectPicker } from '../../components/ProjectPicker';
import { useT } from '../../i18n';
import { colors, fontFamily, radius, spacing, typography } from '../../theme/tokens';
import { screen } from '../../theme/screenStyles';

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
type Severity = (typeof SEVERITIES)[number];

export default function IncidentsScreen() {
  const incidents = useCollection<Incident>('local_incidents');
  const [projectId, setProjectId] = useState('');
  const [incidentType, setIncidentType] = useState('');
  const [severity, setSeverity] = useState<Severity>('MEDIUM');
  const t = useT();

  const canSubmit = projectId.trim() !== '' && incidentType.trim() !== '';

  const onCreate = async (): Promise<void> => {
    const payload = {
      project_id: projectId.trim(),
      incident_type: incidentType.trim(),
      severity,
    };
    await db.insert(localIncidents).values({
      id: newLocalId(),
      incidentId: '',
      projectId: payload.project_id,
      incidentType: payload.incident_type,
      severity: payload.severity,
      status: 'OPEN',
      createdAt: new Date().toISOString(),
      offlineSyncStatus: 'PENDING',
    });
    enqueue('safety', payload.project_id, 'CREATE', payload); // SyncManager → /sync/push (entity_type 'safety')
    setIncidentType('');
  };

  return (
    <View testID="incidents-screen" style={screen.container}>
      <ProjectPicker selectedId={projectId} onSelect={setProjectId} />
      <TextInput
        testID="incident-type-input"
        style={screen.input}
        placeholder={t('safety.incidents.typePlaceholder')}
        placeholderTextColor={colors.textSecondary}
        value={incidentType}
        onChangeText={setIncidentType}
      />
      <View testID="severity-picker" style={styles.severityRow}>
        {SEVERITIES.map((s) => (
          <TouchableOpacity
            key={s}
            testID={`severity-${s}`}
            style={[styles.severityChip, severity === s && styles.severityChipActive]}
            onPress={() => setSeverity(s)}
          >
            <Text style={[styles.severityText, severity === s && styles.severityTextActive]}>
              {t(`status.${s}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        testID="create-incident-button"
        style={[screen.primaryButton, !canSubmit && screen.buttonDisabled]}
        onPress={onCreate}
        disabled={!canSubmit}
      >
        <Text style={screen.primaryButtonText}>{t('safety.incidents.submit')}</Text>
      </TouchableOpacity>

      <FlatList
        testID="incident-list"
        style={styles.list}
        data={incidents}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={screen.empty}>{t('safety.incidents.empty')}</Text>}
        renderItem={({ item }) => (
          <View testID="incident-item" style={screen.item}>
            <Text style={screen.itemTitle}>{item.incidentType}</Text>
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
  severityRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  severityChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.textSecondary,
  },
  severityChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  severityText: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },
  severityTextActive: { color: colors.bg },
  list: { marginTop: spacing.sm },
  chips: { flexDirection: 'row', gap: spacing.xs },
});
