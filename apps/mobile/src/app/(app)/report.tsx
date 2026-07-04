// Report screen — SITE_WORKER daily site report (offline-first draft).
// Saving creates a local_site_reports row (sync_status PENDING); SyncManager replays it on reconnect.
// NOTE: projects are not cached offline yet (no local_projects table), so project_id is entered
// manually here — replace with a cached project picker once project master-data sync exists.

import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { db, newLocalId } from '../../db/database';
import { localSiteReports } from '../../db/schema';
import { ProjectPicker } from '../../components/ProjectPicker';
import { useT } from '../../i18n';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';

function todayIso(): string {
  // Avoid Date.now()-style nondeterminism concerns at module load; compute on render.
  return new Date().toISOString().slice(0, 10);
}

export default function ReportScreen() {
  const [projectId, setProjectId] = useState('');
  const [summary, setSummary] = useState('');
  const [saved, setSaved] = useState(false);
  const t = useT();

  const onSave = async (): Promise<void> => {
    await db.insert(localSiteReports).values({
      id: newLocalId(),
      reportId: '',
      projectId: projectId.trim(),
      reportDate: todayIso(),
      summary: summary.trim(),
      status: 'DRAFT',
      offlineSyncStatus: 'PENDING',
    });
    setSaved(true);
  };

  return (
    <View testID="report-screen" style={styles.container}>
      <Text style={styles.heading}>{t('site.report.title')}</Text>

      <ProjectPicker selectedId={projectId} onSelect={setProjectId} />
      <TextInput
        testID="report-summary-input"
        style={[styles.input, styles.multiline]}
        placeholder={t('site.report.summaryPlaceholder')}
        placeholderTextColor={colors.textSecondary}
        multiline
        value={summary}
        onChangeText={setSummary}
      />

      <TouchableOpacity
        testID="save-report-button"
        style={[styles.button, (!projectId.trim() || !summary.trim()) && styles.buttonDisabled]}
        onPress={onSave}
        disabled={!projectId.trim() || !summary.trim()}
      >
        <Text style={styles.buttonText}>{t('site.report.save')}</Text>
      </TouchableOpacity>

      {saved ? (
        <Text testID="report-saved" style={styles.saved}>
          {t('site.report.saved')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.md, gap: spacing.sm },
  heading: {
    fontSize: typography.title.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textPrimary,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  button: {
    minHeight: 52,
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
  saved: {
    color: colors.success,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
  },
});
