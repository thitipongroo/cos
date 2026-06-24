// Reports screen — SITE_ENGINEER review of submitted site reports.
// Fetches GET /site/reports (review is online; offline shows the last fetched list).

import { useEffect, useState } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { get } from '../../api/client';
import { StatusChip } from '../../components/StatusChip';
import { ConflictBadge } from '../../components/ConflictBadge';
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

  return (
    <View testID="reports-screen" style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Site Reports</Text>
        <ConflictBadge onPress={() => router.push('/conflict-review')} />
      </View>
      <FlatList
        testID="reports-list"
        data={reports}
        keyExtractor={(r) => r.report_id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={<Text style={styles.empty}>No reports</Text>}
        renderItem={({ item }) => (
          <View testID="report-item" style={styles.item}>
            <Text style={styles.itemTitle}>{item.report_date}</Text>
            {item.summary ? <Text style={styles.sub}>{item.summary}</Text> : null}
            <StatusChip label={item.status} />
          </View>
        )}
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
  empty: { color: colors.textSecondary, fontFamily: fontFamily.regular, padding: spacing.md },
});
