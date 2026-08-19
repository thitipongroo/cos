// FetchListScreen — reusable read-only list backed by a GET endpoint (online; offline shows the
// last fetched list). Used by the dashboard/status screens (payments, invoices, rfqs, orders,
// deliveries, CRM customers, etc.). Each row maps to { key, title, status }.
//
// Themed via usePalette (2026-08-04). This one component is the fastest step of the staged palette
// rollout: every screen listed above renders through it, so they all follow the user's mode without
// being touched individually.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { get } from '../api/client';
import { LoadingBoundary } from './LoadingBoundary';
import { StatusChip } from './StatusChip';
import { useT } from '../i18n';
import { fontFamily, spacing, typography } from '../theme/tokens';
import { usePalette, useIsDark } from '../theme/usePalette';
import type { Palette } from '../theme/palette';

interface FetchListScreenProps<T> {
  heading: string;
  endpoint: string;
  testID: string;
  itemTestID: string;
  mapItem: (row: T) => { key: string; title: string; status?: string };
  emptyText?: string;
  /** Optional testID for the FlatList itself (e.g. 'po-list'); omit to leave the list untagged. */
  listTestID?: string;
}

export function FetchListScreen<T>({
  heading,
  endpoint,
  testID,
  itemTestID,
  mapItem,
  emptyText,
  listTestID,
}: FetchListScreenProps<T>) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const t = useT();
  const p = usePalette();
  const dark = useIsDark();
  const styles = useMemo(() => makeStyles(p), [p]);

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
      {/* First load (no rows yet) shows an animated list skeleton that crossfades to the list; a
          pull-to-refresh on an already-populated list keeps the RefreshControl spinner instead. */}
      <LoadingBoundary
        loading={loading && rows.length === 0}
        variant="list"
        theme={dark ? 'dark' : 'light'}
        style={styles.boundary}
      >
        <FlatList
          testID={listTestID}
          data={rows}
          keyExtractor={(row, index) => mapItem(row).key || String(index)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          ListEmptyComponent={
            <Text style={styles.empty}>{emptyText ?? t('common.list.empty')}</Text>
          }
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
      </LoadingBoundary>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: p.bg, padding: spacing.md, gap: spacing.sm },
    boundary: { flex: 1 },
    heading: {
      fontSize: typography.title.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.text,
    },
    item: {
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: p.border,
      gap: spacing.xs,
    },
    itemTitle: {
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.medium,
      color: p.text,
    },
    empty: { color: p.muted, fontFamily: fontFamily.regular, padding: spacing.md },
  });
