// FetchListScreen — reusable read-only list backed by a GET endpoint (online; offline shows the
// last fetched list). Each row maps to { key, title, status }.
//
// WHO ACTUALLY USES IT: app/(app)/rfqs.tsx and app/(app)/customers.tsx — those two, verified by
// grep. The header here used to claim payments, invoices, orders and deliveries as well; each of
// those screens has since grown its own FlatList with per-screen columns and filters, and none of
// them imports this file any more. The stale list mattered: it made this component look like the
// hub of every status screen when it is a two-caller helper.
//
// Themed via usePalette (2026-08-04) — both callers follow the user's mode without being touched.

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { get } from '../api/client';
import { LoadingBoundary } from './LoadingBoundary';
import { StatusChip } from './StatusChip';
import { useT } from '../i18n';
import { fontFamily, spacing, typography } from '../theme/tokens';
import { usePalette, useIsDark } from '../theme/usePalette';
import type { Palette } from '../theme/palette';

/** What a caller's `mapItem` reduces one server row to — everything this list can draw. */
interface RowModel {
  key: string;
  title: string;
  status?: string;
}

type Styles = ReturnType<typeof makeStyles>;

interface FetchListScreenProps<T> {
  heading: string;
  endpoint: string;
  testID: string;
  itemTestID: string;
  mapItem: (row: T) => RowModel;
  emptyText?: string;
  /** Optional testID for the FlatList itself (e.g. 'po-list'); omit to leave the list untagged. */
  listTestID?: string;
}

/**
 * One row, memoized.
 *
 * Both callers pass `mapItem` as an inline arrow, so it is a new function on every render and no
 * amount of useCallback upstream can make the rows' props-producing chain stable. What CAN be made
 * stable is a row's own props — a title, an optional status, a testID and the memoized stylesheet —
 * and memo compares exactly those. A parent re-render then walks the list but re-renders no row
 * whose text did not change.
 */
const Row = memo(function Row({
  title,
  status,
  testID,
  styles,
}: {
  title: string;
  status?: string;
  testID: string;
  styles: Styles;
}) {
  return (
    <View testID={testID} style={styles.item}>
      <Text style={styles.itemTitle}>{title}</Text>
      {status ? <StatusChip label={status} /> : null}
    </View>
  );
});

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

  // Map ONCE per render. keyExtractor and renderItem both need the mapped shape, and calling
  // mapItem in each of them ran a caller's mapper twice for every row on every render.
  const items = useMemo(() => rows.map((row) => mapItem(row)), [rows, mapItem]);

  const renderRow = useCallback(
    ({ item }: { item: RowModel }) => (
      <Row title={item.title} status={item.status} testID={itemTestID} styles={styles} />
    ),
    [itemTestID, styles],
  );

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
          data={items}
          keyExtractor={(item, index) => item.key || String(index)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          ListEmptyComponent={
            <Text style={styles.empty}>{emptyText ?? t('common.list.empty')}</Text>
          }
          renderItem={renderRow}
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
