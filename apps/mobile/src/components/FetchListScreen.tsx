// FetchListScreen — reusable read-only list backed by a GET endpoint (online; offline shows the
// last fetched list). Used by the dashboard/status screens (payments, invoices, rfqs, orders,
// deliveries, etc.). Each row maps to { key, title, status }.

import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { get } from '../api/client';
import { StatusChip } from './StatusChip';
import { useT } from '../i18n';
import { colors, fontFamily, spacing, typography } from '../theme/tokens';

interface FetchListScreenProps<T> {
  heading: string;
  endpoint: string;
  testID: string;
  itemTestID: string;
  mapItem: (row: T) => { key: string; title: string; status?: string };
  emptyText?: string;
}

export function FetchListScreen<T>({
  heading,
  endpoint,
  testID,
  itemTestID,
  mapItem,
  emptyText,
}: FetchListScreenProps<T>) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const t = useT();

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await get<{ items?: T[] } | T[]>(endpoint);
      setRows(Array.isArray(res) ? res : (res.items ?? []));
    } catch {
      /* offline — keep last list */
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View testID={testID} style={styles.container}>
      <Text style={styles.heading}>{heading}</Text>
      <FlatList
        data={rows}
        keyExtractor={(row, index) => mapItem(row).key || String(index)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={<Text style={styles.empty}>{emptyText ?? t('common.list.empty')}</Text>}
        renderItem={({ item }) => {
          const m = mapItem(item);
          return (
            <View testID={itemTestID} style={styles.item}>
              <Text style={styles.itemTitle}>{m.title}</Text>
              {m.status ? <StatusChip label={m.status} /> : null}
            </View>
          );
        }}
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
  empty: { color: colors.textSecondary, fontFamily: fontFamily.regular, padding: spacing.md },
});
