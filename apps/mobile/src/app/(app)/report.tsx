// Report screen — SITE_WORKER daily site report (offline-first) — G-M5a/G-M5b.
// Saving (1) writes a local_site_reports row (sync_status PENDING) for instant/offline display, and
// (2) enqueues a 'site_report' sync item → SyncManager POSTs /sync/push → syncSiteReports. The
// client-generated UUID (expo-crypto, ADR-051) is the idempotency key: it is stored as report_id and
// sent as the sync client_id (the server maps client_id → report_id). Captures manpower + blockers
// (spec 11 §472/§474; §20.7.6; QM-1 E2E #6).

import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import * as Crypto from 'expo-crypto';
import { db, newLocalId } from '../../db/database';
import { localSiteReports } from '../../db/schema';
import { enqueue } from '../../db/sync-queue';
import { ProjectPicker } from '../../components/ProjectPicker';
import { VoiceNoteButton } from '../../components/VoiceNoteButton';
import { useT } from '../../i18n';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';
import { screen } from '../../theme/screenStyles';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportScreen() {
  const [projectId, setProjectId] = useState('');
  const [summary, setSummary] = useState('');
  const [manpower, setManpower] = useState('');
  const [blockers, setBlockers] = useState('');
  const [saved, setSaved] = useState(false);
  const t = useT();

  const canSave = projectId.trim() !== '' && summary.trim() !== '';

  const onSave = async (): Promise<void> => {
    const clientId = Crypto.randomUUID(); // server idempotency key / report_id (ADR-051)
    const reportDate = todayIso();
    const manpowerCount = manpower.trim() ? Math.max(0, parseInt(manpower, 10) || 0) : null;

    await db.insert(localSiteReports).values({
      id: newLocalId(),
      reportId: clientId,
      projectId: projectId.trim(),
      reportDate,
      summary: summary.trim(),
      blockers: blockers.trim() || null,
      manpowerCount,
      status: 'DRAFT',
      offlineSyncStatus: 'PENDING',
    });

    // Enqueue for push (client_id = clientId; server maps client_id → report_id). Offline-safe: the
    // item stays in sync_queue until SyncManager flushes it on reconnect (§17.6).
    enqueue('site_report', clientId, 'CREATE', {
      project_id: projectId.trim(),
      report_date: reportDate,
      summary: summary.trim() || undefined,
      blockers: blockers.trim() || undefined,
      manpower_count: manpowerCount ?? undefined,
      client_submitted_at: new Date().toISOString(),
    });

    setSaved(true);
  };

  return (
    <View testID="report-screen" style={screen.container}>
      <ProjectPicker selectedId={projectId} onSelect={setProjectId} />
      <TextInput
        testID="report-manpower-input"
        style={styles.input}
        placeholder={t('site.report.manpowerPlaceholder')}
        placeholderTextColor={colors.textSecondary}
        keyboardType="number-pad"
        maxLength={5}
        value={manpower}
        onChangeText={setManpower}
      />
      <TextInput
        testID="report-summary-input"
        style={[styles.input, styles.multiline]}
        placeholder={t('site.report.summaryPlaceholder')}
        placeholderTextColor={colors.textSecondary}
        multiline
        value={summary}
        onChangeText={setSummary}
      />
      <VoiceNoteButton
        onTranscript={(text) => setSummary((s) => (s.trim() ? `${s} ${text}` : text))}
      />
      <TextInput
        testID="report-blockers-input"
        style={[styles.input, styles.multiline]}
        placeholder={t('site.report.blockersPlaceholder')}
        placeholderTextColor={colors.textSecondary}
        multiline
        value={blockers}
        onChangeText={setBlockers}
      />

      <TouchableOpacity
        testID="save-report-button"
        style={[styles.button, !canSave && screen.buttonDisabled]}
        onPress={onSave}
        disabled={!canSave}
      >
        <Text style={screen.primaryButtonText}>{t('site.report.save')}</Text>
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
  saved: {
    color: colors.success,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
  },
});
