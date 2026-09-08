// The PROC_MANAGER's Deliveries tab — what arrived, what is held, and what the yard can take.
//
// Implements mockup/mobile/11_proc_manager/04_deliveries/01_pom_deliveries. The route is
// `deliveries` for both procurement roles and shows two screens: the officer's receiving queue with
// its record form, and this — a manager's view of the same rows, where the questions are "what is
// waiting on a signature" and "what is in dispute" rather than "how much arrived".
//
// WHAT IS REAL: the delivery rows themselves (`GET /procurement/deliveries?limit=100`), the count
// dated today, the purchase order each was recorded against, its vendor and its value.
//
// WHAT IS DRAWN, AND WHY THERE IS SO MUCH OF IT. `procurement.deliveries` is
// `delivery_id, po_id, tenant_id, delivery_note, delivered_at, received_by, notes`. It records that
// something arrived. It cannot say a truck is on its way, that a load is awaiting inspection, that a
// count came up short, or that anyone signed for it — so every status pill, the awaiting-inspection
// and dispute tiles, the weighbridge reading, the credit note and the inspector are registered
// figures (lib/mockupFigures.ts, ADR-099).
//
// THE WAREHOUSE BAR IS THE LARGEST SINGLE ONE. §20.7.3 defines `/procurement/warehouses` and
// `/procurement/inventory` and ADR-060 specifies them; of the 24 schemas in this database not one
// holds a warehouse, a bin, a stock level or a quota. The bar draws what the drawing draws and the
// register says what would delete it.
//
// "APPROVE GRN" OPENS THE COMING-SOON DIALOG. §20.7.3 defines `/procurement/grn` as its own page and
// nothing implements it — there is no goods-receipt record to create, so a button that claimed to
// create one would be the worst kind of drawn control.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, FlatList, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Decimal from 'decimal.js';
import {
  listDeliveries,
  listPurchaseOrders,
  vendorIndex,
  type DeliveryRow,
  type PurchaseOrderRow,
} from '../../api/procurement';
import { LoadingBoundary } from '../LoadingBoundary';
import { AiCardFooter } from '../AiCardFooter';
import { useComingSoon } from '../useComingSoon';
import { spacedMoney } from '../../lib/compactMoney';
import {
  DELIVERY_STATUS,
  DELIVERY_DISPUTES,
  DELIVERY_TELEMETRY,
  DELIVERY_INSPECTION,
  DELIVERY_GRN_NUMBER,
  WAREHOUSE_CAPACITY,
  LOGISTICS_CONFIDENCE,
} from '../../lib/mockupFigures';
import { useT } from '../../i18n';
import { usePalette, useIsDark, type Palette } from '../../theme/usePalette';
import { fontFamily, radius, spacing, typography } from '../../theme/tokens';
import { makeQueueStyles, QueueChip, QueueHeader } from './QueueKit';

/** Same day in the device's own timezone — "today" is today where the reader is. */
function isToday(iso: string | undefined, now: Date): boolean {
  if (iso === undefined) return false;
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default function ManagerDeliveries(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(p), [p]);
  const soon = useComingSoon();

  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [pos, setPos] = useState<Map<string, PurchaseOrderRow>>(new Map());
  const [vendors, setVendors] = useState<Map<string, string>>(new Map());
  const [filter, setFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dels, orders, vend] = await Promise.all([
        listDeliveries(),
        listPurchaseOrders().catch(() => ({ items: [] as PurchaseOrderRow[], total: 0 })),
        vendorIndex().catch(() => new Map<string, string>()),
      ]);
      setRows(dels.items);
      setPos(new Map(orders.items.map((o) => [o.po_id, o] as const)));
      setVendors(vend);
    } catch {
      /* offline — the queue keeps what it has */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const now = new Date();
  const today = rows.filter((d) => isToday(d.delivered_at, now));
  // REAL: what today's arrivals are worth, summed in decimal.js over the orders they were recorded
  // against. A delivery whose order is not on the page contributes nothing rather than a guess.
  const todayValue = today.reduce((sum, d) => {
    const po = pos.get(d.po_id ?? '');
    return po === undefined ? sum : sum.plus(new Decimal(po.total_amount));
  }, new Decimal(0));

  return (
    <View testID="deliveries-screen" style={styles.page}>
      <QueueHeader
        title={t('procurement.managerDeliveries.title')}
        subtitle={t('procurement.managerDeliveries.subtitle')}
        styles={styles}
      />

      <View style={styles.tiles}>
        {/* REAL — the row count dated today, and what those orders are worth. */}
        <View testID="tile-arrivals" style={styles.tile}>
          <View style={styles.tileHead}>
            <MaterialIcons name="local-shipping" size={16} color={p.accent} />
            <Text style={styles.tileLabel}>{t('procurement.managerDeliveries.arrivals')}</Text>
          </View>
          <Text style={styles.tileValue}>
            {loading && rows.length === 0 ? '—' : String(today.length)}
          </Text>
          <Text style={styles.tileMeta} numberOfLines={1}>
            {todayValue.isZero() ? '' : spacedMoney(todayValue, 'THB')}
          </Text>
        </View>
        {/* DRAWN — there is no status column, so nothing can be "awaiting inspection". */}
        <View testID="tile-inspection" style={styles.tile}>
          <View style={styles.tileHead}>
            <MaterialIcons name="pending-actions" size={16} color={p.warning} />
            <Text style={styles.tileLabel}>{t('procurement.managerDeliveries.inspection')}</Text>
          </View>
          <Text style={styles.tileValue}>{String(DELIVERY_STATUS.value.due)}</Text>
          <Text style={styles.tileMeta} numberOfLines={1}>
            {t('procurement.managerDeliveries.trucks')}
          </Text>
        </View>
        {/* DRAWN — an invoice can be DISPUTED, which is a status on an invoice, not a case with an
            amount held against it. Nothing withholds money. */}
        <View testID="tile-disputes" style={styles.tile}>
          <View style={styles.tileHead}>
            <MaterialIcons name="gavel" size={16} color={p.danger} />
            <Text style={styles.tileLabel}>{t('procurement.managerDeliveries.disputes')}</Text>
          </View>
          <Text style={styles.tileValue}>{String(DELIVERY_DISPUTES.value.cases)}</Text>
          <Text style={styles.tileMeta} numberOfLines={1}>
            {t('procurement.managerDeliveries.held', { amount: DELIVERY_DISPUTES.value.held })}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* DRAWN in full — no GPS feed, no carrier telemetry. Standard AI-card foot, spec §32.7. */}
        <View testID="logistics-advisor" style={[styles.card, styles.advisor]}>
          <View style={styles.advisorHead}>
            <View style={styles.advisorPlate}>
              <MaterialIcons name="auto-awesome" size={16} color={p.warning} />
            </View>
            <Text style={styles.advisorTitle} numberOfLines={1}>
              {t('procurement.managerDeliveries.advisor')}
            </Text>
          </View>
          <Text style={styles.body}>
            {t('procurement.managerDeliveries.advisorBody', {
              minutes: DELIVERY_TELEMETRY.value.delayMinutes,
              speed: DELIVERY_TELEMETRY.value.avgSpeed,
            })}
          </Text>
          <AiCardFooter
            testID="logistics-advisor-foot"
            // A REGISTERED FIGURE, not an arithmetic coincidence. This read
            // `DELIVERY_STATUS.value.inTransit * 16` for one commit, which happens to be 96 and
            // looks like a calculation — the worst way to write a drawn number.
            percent={LOGISTICS_CONFIDENCE.value}
            source={t('procurement.managerDeliveries.advisorSource')}
            confLabel={t('insight.confShort')}
            sourceLabel={t('insight.sourceShort')}
            palette={p}
          />
        </View>

        {/* DRAWN in full — §20.7.3 defines /procurement/warehouses and /procurement/inventory and
            nothing backs either. See WAREHOUSE_CAPACITY. */}
        <Pressable
          testID="warehouse-capacity"
          accessibilityRole="button"
          accessibilityLabel={t('procurement.managerDeliveries.yard')}
          onPress={() => soon('procurement.managerDeliveries.yard')}
          style={styles.card}
        >
          <View style={styles.yardHead}>
            <MaterialIcons name="warehouse" size={16} color={p.accent} />
            <Text style={styles.yardName} numberOfLines={1}>
              {WAREHOUSE_CAPACITY.value.name}
            </Text>
            <Text style={styles.yardPercent}>{`${WAREHOUSE_CAPACITY.value.percent}%`}</Text>
          </View>
          <View style={styles.yardTrack}>
            <View style={[styles.yardFill, { width: `${WAREHOUSE_CAPACITY.value.percent}%` }]} />
          </View>
          <Text style={styles.tileMeta}>{WAREHOUSE_CAPACITY.value.remaining}</Text>
        </Pressable>

        <View style={styles.chipRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipContent}
          >
            <QueueChip
              testID="delivery-filter-ALL"
              label={t('procurement.managerDeliveries.all')}
              count={rows.length}
              on={filter === ''}
              onPress={() => setFilter('')}
              styles={styles}
            />
            {DELIVERY_STATUS.value.pills.map((pill) => (
              <QueueChip
                key={pill}
                testID={`delivery-filter-${pill}`}
                label={t(`procurement.deliveries.pill.${pill}`)}
                // DRAWN, like the pill itself — there is no status to count.
                count={null}
                on={filter === pill}
                onPress={() => setFilter(pill)}
                styles={styles}
              />
            ))}
          </ScrollView>
        </View>

        <LoadingBoundary
          loading={loading && rows.length === 0}
          variant="list"
          theme={isDark ? 'dark' : 'light'}
        >
          <FlatList
            testID="delivery-list"
            scrollEnabled={false}
            data={rows}
            keyExtractor={(r, i) => r.delivery_id || String(i)}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text testID="deliveries-empty" style={styles.empty}>
                {t('procurement.deliveries.empty')}
              </Text>
            }
            renderItem={({ item, index }) => {
              const po = pos.get(item.po_id ?? '');
              return (
                <View testID={`delivery-item-${item.delivery_id}`} style={styles.card}>
                  <View style={styles.cardHead}>
                    <View style={styles.cardHeadText}>
                      <Text style={styles.deliveryNumber} numberOfLines={1}>
                        {item.delivery_note ?? item.delivery_id.slice(0, 8)}
                      </Text>
                      {po === undefined ? null : (
                        <Text style={styles.deliveryMeta} numberOfLines={1}>
                          {`#${po.po_number} · ${vendors.get(po.vendor_id) ?? '—'}`}
                        </Text>
                      )}
                    </View>
                    {po === undefined ? null : (
                      <Text style={styles.amount}>
                        {spacedMoney(new Decimal(po.total_amount), 'THB')}
                      </Text>
                    )}
                  </View>

                  {/* DRAWN — nothing records how a load was measured or who signed for it. */}
                  <View style={styles.inspection}>
                    <MaterialIcons name="scale" size={14} color={p.muted} />
                    <Text style={styles.inspectionText} numberOfLines={1}>
                      {`${DELIVERY_INSPECTION.value.weighed} · ${DELIVERY_INSPECTION.value.verdict}`}
                    </Text>
                  </View>
                  <View style={styles.inspection}>
                    <MaterialIcons name="receipt-long" size={14} color={p.muted} />
                    <Text style={styles.inspectionText} numberOfLines={1}>
                      {`#${DELIVERY_GRN_NUMBER.value[index % DELIVERY_GRN_NUMBER.value.length]} · ${DELIVERY_INSPECTION.value.inspector}`}
                    </Text>
                  </View>

                  <Pressable
                    testID={`delivery-grn-${item.delivery_id}`}
                    accessibilityRole="button"
                    accessibilityLabel={t('procurement.managerDeliveries.approveGrn')}
                    onPress={() => soon('procurement.managerDeliveries.approveGrn')}
                    style={[styles.action, styles.actionPrimary]}
                  >
                    <MaterialIcons name="edit-document" size={18} color={p.onPrimary} />
                    <Text style={styles.actionPrimaryText}>
                      {t('procurement.managerDeliveries.approveGrn')}
                    </Text>
                  </Pressable>
                </View>
              );
            }}
          />
        </LoadingBoundary>
      </ScrollView>
    </View>
  );
}

function makeStyles(p: Palette) {
  return StyleSheet.create({
    ...makeQueueStyles(p),
    scroll: { gap: spacing.sm, paddingBottom: spacing.xl },
    tiles: { flexDirection: 'row', gap: spacing.xs },
    tile: {
      flex: 1,
      gap: 2,
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
    tileMeta: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 10 },
    advisor: { borderLeftColor: p.warning, borderColor: `${p.warning}55` },
    advisorHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    advisorPlate: {
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
      // A 24px square plate is below the 28px floor, so it takes `md`.
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: `${p.warning}55`,
      backgroundColor: `${p.warning}26`,
    },
    advisorTitle: {
      flex: 1,
      color: p.warning,
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    yardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    yardName: { flex: 1, color: p.text, fontFamily: fontFamily.medium, fontSize: 11 },
    yardPercent: { color: p.accent, fontFamily: fontFamily.bold, fontSize: 12 },
    yardTrack: { height: 6, borderRadius: 999, backgroundColor: p.elevated, overflow: 'hidden' },
    yardFill: { height: 6, borderRadius: 999, backgroundColor: p.accent },
    deliveryNumber: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    deliveryMeta: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 10, marginTop: 2 },
    amount: { color: p.accent, fontFamily: fontFamily.bold, fontSize: typography.label.fontSize },
    inspection: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    inspectionText: { flex: 1, color: p.muted, fontFamily: fontFamily.regular, fontSize: 10 },
  });
}
