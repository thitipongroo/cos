// Procurement screen — PROJECT_MANAGER procurement status (read-only).
// Fetches GET /procurement/purchase-orders and lists POs with delivery status.

import { useEffect, useState } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { get } from '../../api/client';
import { StatusChip } from '../../components/StatusChip';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';

interface PoRow {
  po_id: string;
  po_number?: string;
  status: string;
}

export default function ProcurementScreen() {
  const [orders, setOrders] = useState<PoRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await get<{ items?: PoRow[] } | PoRow[]>('/procurement/purchase-orders');
      setOrders(Array.isArray(res) ? res : (res.items ?? []));
    } catch {
      /* offline — keep cached */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <View testID="procurement-screen" style={styles.container}>
      <Text style={styles.heading}>Procurement</Text>
      <FlatList
        testID="po-list"
        data={orders}
        keyExtractor={(p) => p.po_id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={<Text style={styles.empty}>No purchase orders</Text>}
        renderItem={({ item }) => (
          <View testID="po-item" style={styles.item}>
            <Text style={styles.itemTitle}>{item.po_number ?? item.po_id.slice(0, 8)}</Text>
            <StatusChip label={item.status} />
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
  empty: { color: colors.textSecondary, fontFamily: fontFamily.regular, padding: spacing.md },
});
