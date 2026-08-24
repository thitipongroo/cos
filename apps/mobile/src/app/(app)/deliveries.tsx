// Deliveries screen — PROCUREMENT: list deliveries + record a delivery receipt with per-line
// quantities (G-M4). Pick a PO → GET /procurement/purchase-orders/:poId returns its line_items →
// enter quantity received per line → POST /procurement/deliveries (offline-queued via mutate();
// RecordDeliveryDto = { po_id, delivered_at, delivery_note?, items:[{ line_id, quantity_received }] }).
// PO line data is not cached offline (§17.4 — POs are online read-cache), so lines load online; the
// record submission itself still queues offline.

import { memo, useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import * as Crypto from 'expo-crypto';
import { get, mutate } from '../../api/client';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { PhotoCapture } from '../../components/PhotoCapture';
import { StatusChip } from '../../components/StatusChip';
import { useT } from '../../i18n';
import { colors, fontFamily, radius, spacing, typography } from '../../theme/tokens';
import { screen } from '../../theme/screenStyles';

interface DeliveryRow {
  delivery_id: string;
  status: string;
}
/**
 * One recorded delivery, memoized.
 *
 * This row is read-only, which is exactly why memo pays here: the screen above it re-renders on
 * every keystroke in the delivery-note field and on every PO the picker selects, and none of that
 * changes a single row.
 */
const DeliveryItem = memo(function DeliveryItem({ delivery }: { delivery: DeliveryRow }) {
  return (
    <View testID="delivery-item" style={screen.item}>
      <Text style={screen.itemTitle}>{delivery.delivery_id.slice(0, 8)}</Text>
      <StatusChip label={delivery.status} />
    </View>
  );
});

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

function asList<T>(res: { items?: T[] } | T[]): T[] {
  return Array.isArray(res) ? res : (res.items ?? []);
}

export default function DeliveriesScreen() {
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [pos, setPos] = useState<PoRow[]>([]);
  const [poId, setPoId] = useState('');
  const [lines, setLines] = useState<PoLineItem[]>([]);
  const [received, setReceived] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [linesError, setLinesError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true); // initial deliveries + PO fetch is in flight on mount
  const t = useT();

  // Created once: the row takes nothing but its own record, so this never has to be rebuilt.
  const renderDelivery = useCallback(
    ({ item }: { item: DeliveryRow }) => <DeliveryItem delivery={item} />,
    [],
  );

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await get<{ items?: DeliveryRow[] } | DeliveryRow[]>('/procurement/deliveries');
      setRows(asList(res));
    } catch {
      /* offline — keep cached */
    }
    try {
      const res = await get<{ items?: PoRow[] } | PoRow[]>('/procurement/purchase-orders');
      setPos(asList(res));
    } catch {
      /* offline — PO picker empty */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selectPo = async (id: string): Promise<void> => {
    setPoId(id);
    setReceived({});
    setLines([]);
    setLinesError(false);
    setSaved(false);
    try {
      const detail = await get<{ po: PoRow; line_items: PoLineItem[] }>(
        `/procurement/purchase-orders/${id}`,
      );
      setLines(detail.line_items ?? []);
    } catch {
      setLinesError(true); // offline / error — lines unavailable; note-only record still possible
    }
  };

  const record = async (): Promise<void> => {
    const items = lines
      .map((l) => ({ line_id: l.line_id, quantity_received: (received[l.line_id] ?? '').trim() }))
      .filter((it) => it.quantity_received !== '');
    // ONE CLIENT ID for the payload, the queue key and the server's delivery_id (ADR-051 / G-M11).
    //
    // The queue key used to be the PO id, which meant two deliveries against the same order shared
    // one identity in the outbox — and, worse, that the server had no way to recognise a replay.
    // Replaying a delivery does not merely duplicate a record: `delivery_items` are the quantities
    // `sumDeliveredQuantity` adds up to decide whether a PO line is fulfilled, so a double-applied
    // delivery can close a purchase order on goods that arrived once. `RecordDeliveryDto` gained
    // `client_id` on 2026-08-19 and `recordDelivery` is idempotent on it.
    const clientId = Crypto.randomUUID();
    await mutate(
      'POST',
      '/procurement/deliveries',
      {
        client_id: clientId,
        po_id: poId,
        delivered_at: new Date().toISOString(),
        delivery_note: note.trim() || undefined,
        items,
      },
      'delivery',
      clientId,
    );
    setSaved(true);
    setNote('');
    setReceived({});
  };

  return (
    <View testID="deliveries-screen" style={screen.container}>
      {/* PO picker */}
      <Text style={styles.label}>{t('procurement.deliveries.selectPo')}</Text>
      <View testID="po-picker" style={styles.poRow}>
        {pos.map((po) => (
          <TouchableOpacity
            key={po.po_id}
            testID={`po-option-${po.po_id}`}
            style={[styles.poChip, poId === po.po_id && styles.poChipOn]}
            onPress={() => selectPo(po.po_id)}
            // One of a set, exactly one chosen — a radio, not a button, so a screen reader
            // announces which purchase order the form below belongs to.
            accessibilityRole="radio"
            accessibilityLabel={po.po_number ?? po.po_id.slice(0, 8)}
            accessibilityState={{ selected: poId === po.po_id }}
          >
            <Text style={[styles.poChipText, poId === po.po_id && styles.poChipTextOn]}>
              {po.po_number ?? po.po_id.slice(0, 8)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {poId ? (
        <>
          {linesError ? (
            <Text style={styles.notice}>{t('procurement.deliveries.linesOffline')}</Text>
          ) : null}
          {lines.map((l) => (
            <View key={l.line_id} testID={`delivery-line-${l.line_id}`} style={styles.lineRow}>
              <View style={styles.lineInfo}>
                <Text style={styles.lineDesc}>{l.description}</Text>
                <Text style={styles.lineOrdered}>
                  {t('procurement.deliveries.ordered', { qty: l.quantity, unit: l.unit })}
                </Text>
              </View>
              <TextInput
                testID={`delivery-qty-${l.line_id}`}
                style={styles.qtyInput}
                keyboardType="decimal-pad"
                placeholder={l.quantity}
                placeholderTextColor={colors.textSecondary}
                value={received[l.line_id] ?? ''}
                onChangeText={(v) => setReceived((r) => ({ ...r, [l.line_id]: v }))}
              />
            </View>
          ))}

          <TextInput
            testID="delivery-note-input"
            style={screen.input}
            placeholder={t('procurement.deliveries.notePlaceholder')}
            placeholderTextColor={colors.textSecondary}
            value={note}
            onChangeText={setNote}
          />
          <PhotoCapture entityType="inspection" entityId={poId} />
          <TouchableOpacity
            testID="record-delivery-button"
            style={screen.primaryButton}
            onPress={record}
            accessibilityRole="button"
            accessibilityLabel={t('procurement.deliveries.record')}
          >
            <Text style={screen.primaryButtonText}>{t('procurement.deliveries.record')}</Text>
          </TouchableOpacity>
          {saved ? (
            <Text testID="delivery-saved" style={styles.saved}>
              {t('procurement.deliveries.recorded')}
            </Text>
          ) : null}
        </>
      ) : null}

      <LoadingBoundary
        loading={loading && rows.length === 0}
        variant="list"
        theme="light"
        style={styles.list}
      >
        <FlatList
          testID="delivery-list"
          data={rows}
          keyExtractor={(r, i) => r.delivery_id || String(i)}
          ListEmptyComponent={<Text style={screen.empty}>{t('procurement.deliveries.empty')}</Text>}
          renderItem={renderDelivery}
        />
      </LoadingBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textSecondary,
  },
  poRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  poChip: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  poChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  poChipText: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },
  poChipTextOn: { color: colors.bg },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  lineInfo: { flex: 1, gap: 2 },
  lineDesc: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.medium,
    color: colors.textPrimary,
  },
  lineOrdered: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  qtyInput: {
    width: 88,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    textAlign: 'right',
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textPrimary,
  },
  notice: {
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
  },
  saved: {
    color: colors.success,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
  },
  list: { marginTop: spacing.md },
});
