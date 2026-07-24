// Procurement screen — PROJECT_MANAGER procurement status (read-only).
// Fetches GET /procurement/purchase-orders and lists POs with delivery status.

import { useEffect, useState } from 'react';
import { View, Text, FlatList, RefreshControl } from 'react-native';
import { get } from '../../api/client';
import { StatusChip } from '../../components/StatusChip';
import { useT } from '../../i18n';
import { screen } from '../../theme/screenStyles';

interface PoRow {
  po_id: string;
  po_number?: string;
  status: string;
}

export default function ProcurementScreen() {
  const [orders, setOrders] = useState<PoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const t = useT();

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
    <View testID="procurement-screen" style={screen.container}>
      <Text style={screen.heading}>{t('pm.procurement.title')}</Text>
      <FlatList
        testID="po-list"
        data={orders}
        keyExtractor={(p) => p.po_id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={<Text style={screen.empty}>{t('pm.procurement.empty')}</Text>}
        renderItem={({ item }) => (
          <View testID="po-item" style={screen.item}>
            <Text style={screen.itemTitle}>{item.po_number ?? item.po_id.slice(0, 8)}</Text>
            <StatusChip label={item.status} />
          </View>
        )}
      />
    </View>
  );
}
