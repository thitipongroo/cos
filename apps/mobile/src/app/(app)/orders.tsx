// Orders screen — PROCUREMENT: PO list + detail (G-M13). Tap a PO → GET /procurement/purchase-orders/:poId
// shows its line items and the delivery-phase status (SENT/ACKNOWLEDGED/PARTIALLY_DELIVERED/…). Source:
// GET /procurement/purchase-orders (list) + /:poId (detail). Master 3125-3126.

import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, ScrollView, StyleSheet } from 'react-native';
import { get } from '../../api/client';
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

export default function OrdersScreen() {
  const [rows, setRows] = useState<PoRow[]>([]);
  const [detail, setDetail] = useState<PoDetail | null>(null);
  const t = useT();

  useEffect(() => {
    get<{ items?: PoRow[] } | PoRow[]>('/procurement/purchase-orders')
      .then((res) => setRows(asList(res)))
      .catch(() => {
        /* offline — keep cached */
      });
  }, []);

  const open = async (poId: string): Promise<void> => {
    try {
      setDetail(await get<PoDetail>(`/procurement/purchase-orders/${poId}`));
    } catch {
      /* offline / error — stay on list */
    }
  };

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
      <FlatList
        testID="orders-list"
        data={rows}
        keyExtractor={(r, i) => r.po_id || String(i)}
        ListEmptyComponent={<Text style={screen.empty}>{t('procurement.orders.empty')}</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            testID="order-item"
            style={screen.item}
            onPress={() => open(item.po_id)}
          >
            <Text style={screen.itemTitle}>{item.po_number ?? item.po_id.slice(0, 8)}</Text>
            <StatusChip label={item.status} />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
