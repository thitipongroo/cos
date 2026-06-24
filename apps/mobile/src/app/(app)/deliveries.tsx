// Deliveries screen — PROCUREMENT: list deliveries + record a delivery receipt offline.
// List: GET /procurement/deliveries. Record: POST /procurement/deliveries (offline-queued via
// mutate). RecordDeliveryDto = { po_id, delivered_at, delivery_note?, items[] }; item-level
// quantities need PO line data not cached here, so items is sent empty and confirmed server-side.

import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { get, mutate } from '../../api/client';
import { PhotoCapture } from '../../components/PhotoCapture';
import { StatusChip } from '../../components/StatusChip';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';

interface DeliveryRow {
  delivery_id: string;
  status: string;
}

export default function DeliveriesScreen() {
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [poId, setPoId] = useState('');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);

  const load = async (): Promise<void> => {
    try {
      const res = await get<{ items?: DeliveryRow[] } | DeliveryRow[]>('/procurement/deliveries');
      setRows(Array.isArray(res) ? res : (res.items ?? []));
    } catch {
      /* offline — keep cached */
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const record = async (): Promise<void> => {
    await mutate(
      'POST',
      '/procurement/deliveries',
      {
        po_id: poId.trim(),
        delivered_at: new Date().toISOString(),
        delivery_note: note.trim(),
        items: [],
      },
      'delivery',
      poId.trim(),
    );
    setSaved(true);
    setNote('');
  };

  return (
    <View testID="deliveries-screen" style={styles.container}>
      <Text style={styles.heading}>Deliveries</Text>

      <TextInput
        testID="delivery-po-input"
        style={styles.input}
        placeholder="PO ID"
        placeholderTextColor={colors.textSecondary}
        value={poId}
        onChangeText={setPoId}
      />
      <TextInput
        testID="delivery-note-input"
        style={styles.input}
        placeholder="Delivery note (optional)"
        placeholderTextColor={colors.textSecondary}
        value={note}
        onChangeText={setNote}
      />
      <PhotoCapture entityType="inspection" entityId={poId.trim() || 'delivery'} />
      <TouchableOpacity
        testID="record-delivery-button"
        style={[styles.button, !poId.trim() && styles.disabled]}
        onPress={record}
        disabled={!poId.trim()}
      >
        <Text style={styles.buttonText}>Record delivery</Text>
      </TouchableOpacity>
      {saved ? (
        <Text testID="delivery-saved" style={styles.saved}>
          Recorded — will sync when online
        </Text>
      ) : null}

      <FlatList
        testID="delivery-list"
        data={rows}
        keyExtractor={(r, i) => r.delivery_id || String(i)}
        ListEmptyComponent={<Text style={styles.empty}>No deliveries</Text>}
        renderItem={({ item }) => (
          <View testID="delivery-item" style={styles.item}>
            <Text style={styles.itemTitle}>{item.delivery_id.slice(0, 8)}</Text>
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
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textPrimary,
  },
  button: {
    minHeight: 48,
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
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
