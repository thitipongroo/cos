// Conflict review — SITE_ENGINEER/PM manual resolution of sync conflicts (Phase 10).
// Lists GET /site/conflict-records and resolves via PATCH /site/conflict-records/:id/resolve.
// Reached from the ConflictBadge (not a bottom tab — registered href:null in (app)/_layout).

import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { get, mutate } from '../../api/client';
import { StatusChip } from '../../components/StatusChip';
import { useT } from '../../i18n';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';

interface ConflictRecord {
  conflict_id: string;
  entity_type: string;
  conflict_type: string;
}

export default function ConflictReviewScreen() {
  const [records, setRecords] = useState<ConflictRecord[]>([]);
  const t = useT();

  const load = async (): Promise<void> => {
    try {
      const res = await get<{ items?: ConflictRecord[] } | ConflictRecord[]>(
        '/site/conflict-records',
      );
      setRecords(Array.isArray(res) ? res : (res.items ?? []));
    } catch {
      /* offline — keep cached */
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const resolve = async (id: string): Promise<void> => {
    await mutate(
      'PATCH',
      `/site/conflict-records/${id}/resolve`,
      { resolution_note: 'resolved on device' },
      'conflict',
      id,
    );
    setRecords((prev) => prev.filter((r) => r.conflict_id !== id));
  };

  return (
    <View testID="conflict-review-screen" style={styles.container}>
      <Text style={styles.heading}>{t('sync.conflictReview.title')}</Text>
      <FlatList
        data={records}
        keyExtractor={(r) => r.conflict_id}
        ListEmptyComponent={<Text style={styles.empty}>{t('sync.conflictReview.empty')}</Text>}
        renderItem={({ item }) => (
          <View testID="conflict-record-item" style={styles.item}>
            <Text style={styles.itemTitle}>{item.entity_type}</Text>
            <StatusChip label={item.conflict_type} />
            <TouchableOpacity
              testID="resolve-conflict-button"
              style={styles.resolve}
              onPress={() => resolve(item.conflict_id)}
            >
              <Text style={styles.resolveText}>{t('sync.conflictReview.resolve')}</Text>
            </TouchableOpacity>
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
  resolve: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  resolveText: {
    color: colors.bg,
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
  },
  empty: { color: colors.textSecondary, fontFamily: fontFamily.regular, padding: spacing.md },
});
