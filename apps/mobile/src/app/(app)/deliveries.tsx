// Deliveries screen — PROCUREMENT_OFFICER: the delivery queue, and recording a receipt against a PO.
//
// Implements mockup/mobile/10_proc_officer/04_deliveries/01_po_delivery.
//
// TWO VIEWS, ADDED 2026-09-08. The drawing is a queue — telemetry tiles, a logistics alert, a card
// per delivery — and this screen was the RECORD FORM alone, opening straight onto a PO picker.
//
// THE FORM STAYS, UNCHANGED AND UNSIMPLIFIED. It is 200 lines of reviewed, working, offline-queueing
// capability the drawing does not show: pick a purchase order, enter the quantity received per line,
// attach photos, submit through `mutate()` with one client id serving the payload, the queue key and
// the server's idempotency check. ADR-085 — a drawing does not remove reviewed working capability —
// so it moved BEHIND the drawing's own button rather than out of the app. `mode` chooses which view
// is on screen, and the list is where the screen opens.
//
// WHAT IS DRAWN ON THE LIST, and why there is so much of it: `procurement.deliveries` is
// `delivery_id, po_id, tenant_id, delivery_note, delivered_at, received_by, notes` and NOTHING
// ELSE. There is no status column, so every pill and two of the three tiles are drawn; no GRN
// table, so the receipt numbers are drawn; no telemetry, so the position, the driver and the ETA
// are drawn. Each is registered with the condition that would delete it (lib/mockupFigures.ts).
// What is real on that view is the row count, `delivered_at`, the delivery note, and the purchase
// order each delivery was recorded against.
//
// The original note follows.
//
// Deliveries screen — PROCUREMENT: list deliveries + record a delivery receipt with per-line
// quantities (G-M4). Pick a PO → GET /procurement/purchase-orders/:poId returns its line_items →
// enter quantity received per line → POST /procurement/deliveries (offline-queued via mutate();
// RecordDeliveryDto = { po_id, delivered_at, delivery_note?, items:[{ line_id, quantity_received }] }).
// PO line data is not cached offline (§17.4 — POs are online read-cache), so lines load online; the
// record submission itself still queues offline.

import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { get, mutate } from '../../api/client';
import { DELIVERY_STATUS, DELIVERY_GRN_NUMBER, DELIVERY_TELEMETRY } from '../../lib/mockupFigures';
import { usePalette, useIsDark, type Palette } from '../../theme/usePalette';
import { makeQueueStyles } from '../../components/procurement/QueueKit';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { PhotoCapture } from '../../components/PhotoCapture';
import { CosRole } from '@cos/types';
import { useAuthStore } from '../../store/authStore';
import ManagerDeliveries from '../../components/procurement/ManagerDeliveries';
import { canRenderWriteControls } from '../../lib/readOnlyRole';
import { useT } from '../../i18n';
import { colors, fontFamily, radius, spacing, typography } from '../../theme/tokens';
import { screen } from '../../theme/screenStyles';

interface DeliveryRow {
  delivery_id: string;
  po_id: string;
  /** What the receiver typed on the note. NULL where none was given. */
  delivery_note: string | null;
  /** The one timestamp this table carries. */
  delivered_at: string;
  notes: string | null;
  /**
   * NOT A COLUMN. `procurement.deliveries` has no status, and this field only ever arrives from a
   * caller that invented one — see the header. Kept optional so the read-only row below, which has
   * shown a chip since G-M4, keeps working rather than being silently dropped.
   */
  status?: string;
}
// `DeliveryItem` STOOD HERE — a memoized read-only row with a `<StatusChip />` on it. It went on
// 2026-09-08 with the screen's restructure: the list moved into the drawing's own view above, whose
// card carries the delivery note, the date, the purchase order and the receipt number. The chip it
// rendered was reading `delivery.status`, WHICH IS NOT A COLUMN — see the header.

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

/**
 * The Deliveries tab, which is two screens.
 *
 * PROC_MANAGER sees the manager's view (`11_proc_manager/04_deliveries`) — arrivals, holds and yard
 * capacity. PROCUREMENT_OFFICER sees the receiving queue below (`10_proc_officer/04_deliveries`)
 * and the record form behind it. One route, two jobs.
 */
export default function DeliveriesRoute(): React.JSX.Element {
  const role = useAuthStore((s) => s.role);
  return role === CosRole.PROC_MANAGER ? <ManagerDeliveries /> : <OfficerDeliveries />;
}

function OfficerDeliveries() {
  // §20.7.9: a read-only role is shown no create control. VIEWER reaches this screen from the
  // drawer and falls to this branch, so the FAB that opens the record form is hidden for it.
  const canWrite = useAuthStore((s) => canRenderWriteControls(s.role));
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [pos, setPos] = useState<PoRow[]>([]);
  const [poId, setPoId] = useState('');
  const [lines, setLines] = useState<PoLineItem[]>([]);
  const [received, setReceived] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [linesError, setLinesError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true); // initial deliveries + PO fetch is in flight on mount
  // Which of the two views is on screen. The drawing's list is where it opens.
  const [mode, setMode] = useState<'list' | 'record'>('list');
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
  const listStyles = useMemo(() => makeListStyles(p), [p]);
  // `po_id` -> `po_number`, from the list this screen already fetches for its picker. One index,
  // no extra request.
  const poNumbers = useMemo(
    () => new Map(pos.map((o) => [o.po_id, o.po_number ?? o.po_id.slice(0, 8)] as const)),
    [pos],
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

  // ── The drawing's queue, and the form behind it ───────────────────────────────────────────────
  //
  // `mode` is which of the two this screen shows. It opens on the LIST, which is what
  // `04_deliveries/01_po_delivery` draws; the record form — the PO picker, the per-line quantities,
  // the photo capture and the offline queue below it — is reached from a card's own button or from
  // the FAB. That form is not new and was not simplified: see the header note.
  if (mode === 'list') {
    return (
      <View testID="deliveries-screen" style={listStyles.page}>
        {/* NO TITLE AND NO SUBTITLE (PO decision 2026-09-08). The tab bar already names this
            screen, and the three tiles under it say what is arriving and what has been received
            better than a sentence does. Two rows of a phone, returned to the queue. */}
        {/* The drawing's three telemetry tiles. RECEIVED IS REAL — it is how many delivery rows
            this tenant holds. THE OTHER TWO ARE DRAWN, and so is the on-time rate:
            `procurement.deliveries` has no status column, so the table can say "this arrived" and
            cannot say "this is on its way", and nothing records a promised arrival to measure
            against. See DELIVERY_STATUS in the register. */}
        <View style={listStyles.tiles}>
          <View testID="delivery-tile-received" style={listStyles.tile}>
            <View style={listStyles.tileHead}>
              <MaterialIcons name="inventory-2" size={18} color={p.accent} />
              <Text style={listStyles.tileLabel}>{t('procurement.deliveries.tiles.received')}</Text>
            </View>
            <Text style={listStyles.tileValue}>
              {loading && rows.length === 0 ? '—' : String(rows.length)}
            </Text>
          </View>
          <View testID="delivery-tile-transit" style={listStyles.tile}>
            <View style={listStyles.tileHead}>
              <MaterialIcons name="local-shipping" size={18} color={p.muted} />
              <Text style={listStyles.tileLabel}>{t('procurement.deliveries.tiles.transit')}</Text>
            </View>
            <Text style={listStyles.tileValue}>{String(DELIVERY_STATUS.value.inTransit)}</Text>
          </View>
          <View testID="delivery-tile-ontime" style={listStyles.tile}>
            <View style={listStyles.tileHead}>
              <MaterialIcons name="verified" size={18} color={p.success} />
              <Text style={listStyles.tileLabel}>{t('procurement.deliveries.tiles.onTime')}</Text>
            </View>
            <Text style={listStyles.tileValue}>{DELIVERY_STATUS.value.onTimePercent}</Text>
          </View>
        </View>

        {/* DRAWN in full — no GPS feed, no carrier telemetry, no driver record. See
            DELIVERY_TELEMETRY in the register. */}
        {/* THE DRAWING'S SHAPE, ELEMENT FOR ELEMENT (`04_deliveries/01_po_delivery`): a tinted
            square plate holding the warning glyph, the title beside it, the alert level as a pill at
            the trailing edge, the sentence, then a footer rule carrying the average speed on the
            left and the route control on the right.

            EVERY FIGURE ON IT IS DRAWN and is registered — there is no GPS feed, no carrier
            telemetry and no promised arrival to be late against. See DELIVERY_TELEMETRY. */}
        <View testID="delivery-alert" style={listStyles.alert}>
          <View style={listStyles.alertHead}>
            <View style={listStyles.alertPlate}>
              <MaterialIcons name="warning" size={16} color={p.warning} />
            </View>
            <Text style={[listStyles.alertTitle, listStyles.alertTitleFlex]} numberOfLines={1}>
              {t('procurement.deliveries.logistics')}
            </Text>
            <View style={listStyles.alertChip}>
              <Text style={listStyles.alertChipText}>{t('procurement.deliveries.highAlert')}</Text>
            </View>
          </View>
          <Text style={listStyles.alertBody}>
            {t('procurement.deliveries.logisticsBody', {
              minutes: DELIVERY_TELEMETRY.value.delayMinutes,
              speed: DELIVERY_TELEMETRY.value.avgSpeed,
            })}
          </Text>
          <View style={listStyles.alertFoot}>
            <View style={listStyles.alertSpeed}>
              <View style={listStyles.alertDot} />
              <Text style={listStyles.alertSpeedText} numberOfLines={1}>
                {t('procurement.deliveries.avgSpeed', {
                  speed: DELIVERY_TELEMETRY.value.avgSpeed,
                })}
              </Text>
            </View>
            <Pressable
              testID="delivery-route"
              accessibilityRole="button"
              accessibilityLabel={t('procurement.deliveries.route')}
              onPress={() => setMode('list')}
              style={listStyles.alertAction}
            >
              <MaterialIcons name="navigation" size={14} color={p.accent} />
              <Text style={listStyles.alertActionText}>{t('procurement.deliveries.route')}</Text>
              <MaterialIcons name="arrow-forward" size={14} color={p.accent} />
            </Pressable>
          </View>
        </View>

        <LoadingBoundary
          loading={loading && rows.length === 0}
          variant="list"
          theme={isDark ? 'dark' : 'light'}
          style={listStyles.listRegion}
        >
          <FlatList
            testID="delivery-list"
            data={rows}
            keyExtractor={(r, i) => r.delivery_id || String(i)}
            contentContainerStyle={listStyles.listContent}
            ListEmptyComponent={
              <Text testID="deliveries-empty" style={listStyles.empty}>
                {t('procurement.deliveries.empty')}
              </Text>
            }
            renderItem={({ item, index }) => (
              <View testID={`delivery-item-${item.delivery_id}`} style={listStyles.card}>
                <View style={listStyles.cardHead}>
                  <View style={listStyles.cardHeadText}>
                    {/* REAL: the delivery note the receiver typed, falling back to the id. */}
                    <Text style={listStyles.deliveryNumber} numberOfLines={1}>
                      {item.delivery_note ?? item.delivery_id.slice(0, 8)}
                    </Text>
                    {/* REAL: `delivered_at`, the one timestamp this table carries. */}
                    {/* `delivered_at` is NOT NULL in the schema, so this guard is not about the
                        database — it is about a response that reaches the client without it. A
                        missing date renders no line rather than "Invalid Date". */}
                    {item.delivered_at === undefined || item.delivered_at === null ? null : (
                      <Text style={listStyles.deliveryWhen}>
                        {t('procurement.deliveries.receivedAt', {
                          when: new Date(item.delivered_at).toLocaleDateString(),
                        })}
                      </Text>
                    )}
                  </View>
                  {/* DRAWN — the status pill. There is no status column at all. */}
                  <View style={listStyles.statusPill}>
                    <Text style={listStyles.statusText}>
                      {DELIVERY_STATUS.value.pills[index % DELIVERY_STATUS.value.pills.length]}
                    </Text>
                  </View>
                </View>
                <View style={listStyles.meta}>
                  {/* REAL: the order this delivery was recorded against, named from the PO list
                      this screen already fetches for its picker. */}
                  <Text style={listStyles.metaText} numberOfLines={1}>
                    {poNumbers.get(item.po_id ?? '') ?? (item.po_id ?? '').slice(0, 8)}
                  </Text>
                  {/* DRAWN — goods-receipt notes have no table. §20.7.3 defines `/procurement/grn`
                      and nothing backs it yet. See DELIVERY_GRN_NUMBER. */}
                  <Text style={listStyles.metaGrn}>
                    {`#${DELIVERY_GRN_NUMBER.value[index % DELIVERY_GRN_NUMBER.value.length]}`}
                  </Text>
                </View>
                <Pressable
                  testID={`delivery-open-record-${item.delivery_id}`}
                  accessibilityRole="button"
                  accessibilityLabel={t('procurement.deliveries.record')}
                  onPress={() => setMode('record')}
                  style={listStyles.cardAction}
                >
                  <MaterialIcons name="receipt-long" size={18} color={p.onPrimary} />
                  <Text style={listStyles.cardActionText}>
                    {t('procurement.deliveries.record')}
                  </Text>
                </Pressable>
              </View>
            )}
          />
        </LoadingBoundary>

        {/* The FAB opens the RECORD FORM, not a "coming soon" dialog: recording a delivery against
            a purchase order is a real action this app has performed since G-M4, and it queues
            offline.

            §20.7.9: NOT FOR A READ-ONLY ROLE. This screen is one of VIEWER's drawer rows and the
            FAB is the only way into the form, so hiding it closes the whole create path while
            leaving the list — which is what that role is here to read — untouched. */}
        {canWrite ? (
          <Pressable
            testID="delivery-fab"
            accessibilityRole="button"
            accessibilityLabel={t('procurement.deliveries.record')}
            onPress={() => setMode('record')}
            style={listStyles.fab}
          >
            <MaterialIcons name="add" size={28} color={p.onPrimary} />
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View testID="delivery-record-screen" style={screen.container}>
      <Pressable
        testID="delivery-record-back"
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        onPress={() => setMode('list')}
        style={listStyles.backPlate}
      >
        <MaterialIcons name="chevron-left" size={26} color={p.text} />
      </Pressable>

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

/** The list view's own styles — the record form below keeps the flat `screen` set it always had. */
function makeListStyles(p: Palette) {
  return StyleSheet.create({
    // The chrome every queue screen wears — see components/procurement/QueueKit.tsx.
    ...makeQueueStyles(p),
    tiles: { flexDirection: 'row', gap: spacing.xs },
    tile: {
      flex: 1,
      gap: spacing.xs,
      padding: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    tileHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    tileLabel: {
      flex: 1,
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: 9,
      textTransform: 'uppercase',
    },
    tileValue: { color: p.text, fontFamily: fontFamily.bold, fontSize: typography.title.fontSize },
    alert: {
      gap: spacing.xs,
      padding: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: `${p.warning}55`,
      borderLeftWidth: 4,
      borderLeftColor: p.warning,
      backgroundColor: p.surface,
    },
    alertHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    alertTitleFlex: { flex: 1 },
    alertTitle: {
      color: p.warning,
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    alertPlate: {
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
      // A 24px square plate: `plateRadius(24)` is below the 28px floor, so it takes `md`.
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: `${p.warning}55`,
      backgroundColor: `${p.warning}26`,
    },
    alertChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: `${p.warning}55`,
    },
    alertChipText: { color: p.warning, fontFamily: fontFamily.semibold, fontSize: 10 },
    alertBody: { color: p.text, fontFamily: fontFamily.regular, fontSize: 11 },
    alertFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs,
      borderTopWidth: 1,
      borderTopColor: `${p.border}`,
      paddingTop: spacing.xs,
    },
    alertSpeed: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
    // A 6px dot: a circle, half its width, which is what 999 marks.
    alertDot: { width: 6, height: 6, borderRadius: 999, backgroundColor: p.warning },
    alertSpeedText: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 10 },
    alertAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: `${p.accent}66`,
    },
    alertActionText: { color: p.accent, fontFamily: fontFamily.semibold, fontSize: 10 },
    listContent: { gap: spacing.sm, paddingBottom: spacing.xl },
    deliveryNumber: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    deliveryWhen: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 10, marginTop: 2 },
    meta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      padding: spacing.xs,
      borderRadius: radius.md,
      backgroundColor: p.elevated,
    },
    metaText: { flex: 1, color: p.text, fontFamily: fontFamily.medium, fontSize: 11 },
    metaGrn: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 10 },
    cardAction: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      minHeight: 44,
      borderRadius: radius.md,
      backgroundColor: p.primary,
      marginTop: spacing.xs,
    },
    cardActionText: {
      color: p.onPrimary,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
    },
  });
}
