// Orders screen — PROCUREMENT: PO list + detail (G-M13). Tap a PO → GET /procurement/purchase-orders/:poId
// shows its line items and the delivery-phase status (SENT/ACKNOWLEDGED/PARTIALLY_DELIVERED/…). Source:
// GET /procurement/purchase-orders (list) + /:poId (detail). Master 3125-3126.

import { memo, useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, ScrollView, StyleSheet } from 'react-native';
import { get } from '../../api/client';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { StatusChip } from '../../components/StatusChip';
import { useT } from '../../i18n';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';
import { screen } from '../../theme/screenStyles';

interface PoRow {
  po_id: string;
  po_number?: string;
  status: string;
}
interface PoLineItem {
  line_id: string;
  description: string;
  quantity: string;
  unit: string;
}
interface PoDetail {
  po: PoRow;
  line_items: PoLineItem[];
}

function asList<T>(res: { items?: T[] } | T[]): T[] {
  return Array.isArray(res) ? res : (res.items ?? []);
}

/**
 * One purchase order, memoized.
 *
 * The row's whole appearance comes from its own props, and `onOpen` takes the id so one callback
 * serves the entire list — which is what lets memo skip a row when the screen re-renders for
 * something else (the detail fetch, a refresh).
 */
const OrderItem = memo(function OrderItem({
  po,
  onOpen,
}: {
  po: PoRow;
  onOpen: (poId: string) => void;
}) {
  return (
    <TouchableOpacity testID="order-item" style={screen.item} onPress={() => onOpen(po.po_id)}>
      <Text style={screen.itemTitle}>{po.po_number ?? po.po_id.slice(0, 8)}</Text>
      <StatusChip label={po.status} />
    </TouchableOpacity>
  );
});

export default function OrdersScreen() {
  const [rows, setRows] = useState<PoRow[]>([]);
  const [loading, setLoading] = useState(true); // initial PO fetch is in flight on mount
  const [detail, setDetail] = useState<PoDetail | null>(null);
  const t = useT();

  useEffect(() => {
    get<{ items?: PoRow[] } | PoRow[]>('/procurement/purchase-orders')
      .then((res) => setRows(asList(res)))
      .catch(() => {
        /* offline — keep cached */
      })
      .finally(() => setLoading(false));
  }, []);

  const open = useCallback(async (poId: string): Promise<void> => {
    try {
      setDetail(await get<PoDetail>(`/procurement/purchase-orders/${poId}`));
    } catch {
      /* offline / error — stay on list */
    }
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: PoRow }) => <OrderItem po={item} onOpen={open} />,
    [open],
  );

  if (detail) {
    return (
      <ScrollView
        testID="order-detail-screen"
        style={screen.container}
        contentContainerStyle={styles.content}
      >
        <View style={styles.detailHead}>
          <Text style={screen.heading}>{detail.po.po_number ?? detail.po.po_id.slice(0, 8)}</Text>
          <StatusChip label={detail.po.status} />
        </View>
        <Text style={styles.linesHeading}>{t('procurement.orders.lineItems')}</Text>
        {detail.line_items.length === 0 ? (
          <Text style={screen.empty}>{t('procurement.orders.noLines')}</Text>
        ) : (
          detail.line_items.map((l) => (
            <View key={l.line_id} style={styles.lineRow}>
              <Text style={styles.lineDesc}>{l.description}</Text>
              <Text style={styles.lineQty}>
                {l.quantity} {l.unit}
              </Text>
            </View>
          ))
        )}
        <TouchableOpacity testID="order-back-button" onPress={() => setDetail(null)}>
          <Text style={styles.back}>{t('common.back')}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <View testID="orders-screen" style={screen.container}>
      <LoadingBoundary
        loading={loading && rows.length === 0}
        variant="list"
        theme="light"
        style={styles.boundary}
      >
        <FlatList
          testID="orders-list"
          data={rows}
          keyExtractor={(r, i) => r.po_id || String(i)}
          ListEmptyComponent={<Text style={screen.empty}>{t('procurement.orders.empty')}</Text>}
          renderItem={renderItem}
        />
      </LoadingBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  boundary: { flex: 1 },
  content: { gap: spacing.sm, paddingBottom: spacing.lg },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  linesHeading: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  lineDesc: {
    flex: 1,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textPrimary,
  },
  lineQty: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textSecondary,
  },
  back: { color: colors.primary, fontFamily: fontFamily.medium, marginTop: spacing.md },
});
