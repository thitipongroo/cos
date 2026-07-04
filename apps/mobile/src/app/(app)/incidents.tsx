// Incidents screen — SAFETY_OFFICER: report safety incidents offline + reactive list.
// Read: local_incidents (populated by delta-sync + local creates), shown via useCollection.
// Create: writes a local_incidents row (sync_status PENDING) for instant display AND enqueues a
// 'safety' sync_queue item → SyncManager pushes it to /sync/push → SafetyService.createIncident.
// (PENDING→SYNCED reconciliation / delta-dedup is the same known limitation as the issues screen.)

import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { database } from '../../db/database';
import Incident from '../../db/models/Incident';
import { enqueue } from '../../db/sync-queue';
import { useCollection } from '../../hooks/useCollection';
import { StatusChip } from '../../components/StatusChip';
import { ProjectPicker } from '../../components/ProjectPicker';
import { useT } from '../../i18n';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';

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
    await database.write(async () => {
      await database.get<Incident>('local_incidents').create((r) => {
        r.incidentId = '';
        r.projectId = payload.project_id;
        r.incidentType = payload.incident_type;
        r.severity = payload.severity;
        r.status = 'OPEN';
        r.createdAt = new Date().toISOString();
        r.offlineSyncStatus = 'PENDING';
      });
    });
    enqueue('safety', payload.project_id, 'CREATE', payload); // SyncManager → /sync/push (entity_type 'safety')
    setIncidentType('');
  };

  return (
    <View testID="incidents-screen" style={styles.container}>
      <Text style={styles.heading}>{t('safety.incidents.title')}</Text>

      <ProjectPicker selectedId={projectId} onSelect={setProjectId} />
      <TextInput
        testID="incident-type-input"
        style={styles.input}
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
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        onPress={onCreate}
        disabled={!canSubmit}
      >
        <Text style={styles.buttonText}>{t('safety.incidents.submit')}</Text>
      </TouchableOpacity>

      <FlatList
        testID="incident-list"
        style={styles.list}
        data={incidents}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>{t('safety.incidents.empty')}</Text>}
        renderItem={({ item }) => (
          <View testID="incident-item" style={styles.item}>
            <Text style={styles.itemTitle}>{item.incidentType}</Text>
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
  severityRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  severityChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 16,
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
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
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
