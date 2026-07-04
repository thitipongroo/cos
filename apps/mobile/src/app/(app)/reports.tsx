// Reports screen — SITE_ENGINEER review of submitted site reports + record material consumption.
// Review list: GET /site/reports (online; offline shows the last fetched list).
// Material (PO ruling M1/M2 — embedded here, owned by SITE_ENGINEER): tap a report → record material
// against that report_id. Material is a child of a site report (server: createMaterialConsumption(
// reportId, dto)), so it attaches to an existing report. Create enqueues a 'material' sync_queue item
// → SyncManager pushes to /sync/push → SiteOpsService.createMaterialConsumption; the recorded row
// flows back into local_material_consumptions on the next delta pull (no local-write here, since the
// delta cache keys on project_id while creation keys on report_id).

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { get } from '../../api/client';
import { enqueue } from '../../db/sync-queue';
import { StatusChip } from '../../components/StatusChip';
import { ConflictBadge } from '../../components/ConflictBadge';
import { useI18n } from '../../i18n';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';

interface ReportRow {
  report_id: string;
  report_date: string;
  status: string;
  summary?: string | null;
}

export default function ReportsScreen() {
  const router = useRouter();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [matName, setMatName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');
  const [savedFor, setSavedFor] = useState<string | null>(null);
  const { t, formatDate } = useI18n();

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await get<{ items?: ReportRow[] } | ReportRow[]>('/site/reports');
      setReports(Array.isArray(res) ? res : (res.items ?? []));
    } catch {
      // offline / error — keep the last list
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const canRecord = matName.trim() !== '' && qty.trim() !== '' && unit.trim() !== '';

  const recordMaterial = (reportId: string): void => {
    enqueue('material', reportId, 'CREATE', {
      report_id: reportId,
      material_name: matName.trim(),
      quantity: qty.trim(),
      unit: unit.trim(),
      consumed_at: new Date().toISOString(),
    });
    setSavedFor(reportId);
    setMatName('');
    setQty('');
    setUnit('');
  };

  return (
    <View testID="reports-screen" style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>{t('site.reports.title')}</Text>
        <ConflictBadge onPress={() => router.push('/conflict-review')} />
      </View>
      <FlatList
        testID="reports-list"
        data={reports}
        keyExtractor={(r) => r.report_id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={<Text style={styles.empty}>{t('site.reports.empty')}</Text>}
        renderItem={({ item }) => {
          const open = selectedReportId === item.report_id;
          return (
            <TouchableOpacity
              testID="report-item"
              style={styles.item}
              onPress={() => setSelectedReportId(open ? null : item.report_id)}
            >
              <Text style={styles.itemTitle}>{formatDate(item.report_date)}</Text>
              {item.summary ? <Text style={styles.sub}>{item.summary}</Text> : null}
              <StatusChip label={item.status} />

              {open ? (
                <View testID="material-form" style={styles.matForm}>
                  <Text style={styles.matHeading}>{t('site.reports.materialTitle')}</Text>
                  <TextInput
                    testID="material-name-input"
                    style={styles.input}
                    placeholder={t('site.reports.materialPlaceholder')}
                    placeholderTextColor={colors.textSecondary}
                    value={matName}
                    onChangeText={setMatName}
                  />
                  <View style={styles.qtyRow}>
                    <TextInput
                      testID="material-qty-input"
                      style={[styles.input, styles.qtyInput]}
                      placeholder={t('site.reports.qtyPlaceholder')}
                      placeholderTextColor={colors.textSecondary}
                      keyboardType="decimal-pad"
                      value={qty}
                      onChangeText={setQty}
                    />
                    <TextInput
                      testID="material-unit-input"
                      style={[styles.input, styles.qtyInput]}
                      placeholder={t('site.reports.unitPlaceholder')}
                      placeholderTextColor={colors.textSecondary}
                      value={unit}
                      onChangeText={setUnit}
                    />
                  </View>
                  <TouchableOpacity
                    testID="record-material-button"
                    style={[styles.button, !canRecord && styles.buttonDisabled]}
                    onPress={() => recordMaterial(item.report_id)}
                    disabled={!canRecord}
                  >
                    <Text style={styles.buttonText}>{t('site.reports.record')}</Text>
                  </TouchableOpacity>
                  {savedFor === item.report_id ? (
                    <Text testID="material-saved" style={styles.saved}>
                      {t('site.reports.recorded')}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.md, gap: spacing.sm },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
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
  sub: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  matForm: { marginTop: spacing.sm, gap: spacing.xs },
  matHeading: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textSecondary,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textPrimary,
  },
  qtyRow: { flexDirection: 'row', gap: spacing.xs },
  qtyInput: { flex: 1 },
  button: {
    minHeight: 44,
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
  saved: {
    color: colors.success,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
  },
  empty: { color: colors.textSecondary, fontFamily: fontFamily.regular, padding: spacing.md },
});
