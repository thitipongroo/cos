// The PROC_MANAGER's Deliveries tab — what arrived, what is held, and what the yard can take.
//
// DRAWING: mockup/mobile/11_proc_manager/04_deliveries/01_pom_deliveries.
//
// REBUILT 2026-09-09 TO MATCH IT, after the product owner rejected the previous version for having
// the right data in the wrong shape. Plan: `.claude/impl-pending.md` PART 2.
//
// The route is `deliveries` for both procurement roles and shows two screens: the officer's
// receiving queue with its record form, and this — a manager's view of the same rows, where the
// questions are "what is waiting on a signature" and "what is in dispute" rather than "how much
// arrived".
//
// WHAT IS REAL: the delivery rows themselves (`GET /procurement/deliveries`), the count dated today,
// the value of today's arrivals summed in decimal.js, the purchase order each delivery was recorded
// against, its number, its vendor and its amount.
//
// WHAT IS DRAWN, AND WHY THERE IS SO MUCH OF IT. `procurement.deliveries` is
// `delivery_id, po_id, tenant_id, delivery_note, delivered_at, received_by, notes`. It records THAT
// something arrived. It cannot say a truck is on its way, that a load awaits inspection, that a count
// came up short, what material was delivered, or that anyone signed for it.
//
// THE DRAWING GIVES THE LIST FOUR CARD SHAPES — awaiting GRN · disputed · in transit · received —
// and the product owner's answer to escalation E2 on 2026-09-09 was "เหมือนแบบทุกตัวเลข": build all
// four as drawn. So the SHAPE and its detail come from `DELIVERY_CARD_KIND`, assigned by the row's
// position in the list, and the row underneath it is a real delivery. Deleting the register block
// leaves the real half standing. Nothing here invents a delivery the server did not return.
//
// ONE CONSEQUENCE WORTH STATING PLAINLY: on the DISPUTED card the amount shown is the drawn credit
// note, not the order's real value, because the drawing shows a negative number there. Every other
// card shows the order's real amount.
//
// THE CONFIDENCE IS IN THE FOOT, not the drawing's header chip. The drawing puts a "CONFIDENCE: 96%"
// chip beside the advisor's title; the project standard of 2026-09-08 (spec §32.7, `<AiCardFooter />`)
// puts confidence in the foot beside the source. Asked which wins on 2026-09-09, the product owner
// said the standard. Deliberate deviation, recorded here.
//
// EVERY ACTION ON THIS SCREEN IS DRAWN. §20.7.3 defines `/procurement/grn` and nothing implements it;
// there is no chat, no photo pipeline on a delivery, no GPS and no driver record. All of them open
// the coming-soon dialog rather than failing or sitting dead (PO convention 2026-09-04).

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
import { ProjectContextBar } from '../ProjectContextBar';
import { useComingSoon } from '../useComingSoon';
import { spacedMoney } from '../../lib/compactMoney';
import {
  DELIVERY_CARD_KIND,
  DELIVERY_DISPUTES,
  DELIVERY_DISPUTE_REASON,
  DELIVERY_GRN_NUMBER,
  DELIVERY_INSPECTION,
  DELIVERY_RADAR,
  DELIVERY_STATUS,
  DELIVERY_STORAGE,
  DELIVERY_TELEMETRY,
  DELIVERY_TRANSIT,
  DELIVERY_VENDOR_TRUST,
  LOGISTICS_CONFIDENCE,
  LOGISTICS_ETA,
  WAREHOUSE_CAPACITY,
} from '../../lib/mockupFigures';
import { useT } from '../../i18n';
import { usePalette, useIsDark, type Palette } from '../../theme/usePalette';
import {
  fontFamily,
  plateRadius,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../theme/tokens';
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

type Kind = (typeof DELIVERY_CARD_KIND.value)[number]['kind'];

/** The drawing's pill wording and colour role, per card shape. */
const KIND_PILL: Record<
  Kind,
  { labelKey: string; tone: 'warning' | 'danger' | 'accent' | 'success' }
> = {
  AWAITING_GRN: { labelKey: 'procurement.managerDeliveries.pillAwaitingGrn', tone: 'warning' },
  DISPUTED: { labelKey: 'procurement.managerDeliveries.pillDisputed', tone: 'danger' },
  IN_TRANSIT: { labelKey: 'procurement.managerDeliveries.pillInTransit', tone: 'accent' },
  RECEIVED: { labelKey: 'procurement.managerDeliveries.pillReceived', tone: 'success' },
};

/** The drawing's filter row. `null` is its "ทั้งหมด" chip. */
const FILTERS: readonly { id: Kind | null; labelKey: string }[] = [
  { id: null, labelKey: 'procurement.managerDeliveries.all' },
  { id: 'AWAITING_GRN', labelKey: 'procurement.managerDeliveries.inspection' },
  { id: 'DISPUTED', labelKey: 'procurement.managerDeliveries.filterDisputed' },
  { id: 'IN_TRANSIT', labelKey: 'procurement.managerDeliveries.filterTransit' },
  { id: 'RECEIVED', labelKey: 'procurement.managerDeliveries.filterReceived' },
];

/** The advisor's and the radar row's glyph plates. */
const PLATE = 40;

export default function ManagerDeliveries(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(p), [p]);
  const soon = useComingSoon();

  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [pos, setPos] = useState<Map<string, PurchaseOrderRow>>(new Map());
  const [vendors, setVendors] = useState<Map<string, string>>(new Map());
  const [filter, setFilter] = useState<Kind | null>(null);
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

  const shapes = DELIVERY_CARD_KIND.value;
  // The card shape a row takes. Drawn — see the register — but DETERMINISTIC, so the filter chips
  // below can count honestly against what the list actually shows.
  const shapeOf = useCallback((index: number) => shapes[index % shapes.length]!, [shapes]);

  const counts = useMemo(() => {
    const by = new Map<Kind, number>();
    rows.forEach((_, i) => {
      const k = shapeOf(i).kind;
      by.set(k, (by.get(k) ?? 0) + 1);
    });
    return by;
  }, [rows, shapeOf]);

  const visible = useMemo(
    () =>
      rows
        .map((row, index) => ({ row, index }))
        .filter(({ index }) => filter === null || shapeOf(index).kind === filter),
    [rows, filter, shapeOf],
  );

  const toneOf = (k: Kind): string =>
    KIND_PILL[k].tone === 'warning'
      ? p.warning
      : KIND_PILL[k].tone === 'danger'
        ? p.danger
        : KIND_PILL[k].tone === 'accent'
          ? p.accent
          : p.success;

  return (
    <View testID="deliveries-screen" style={styles.page}>
      <QueueHeader
        title={t('procurement.managerDeliveries.title')}
        subtitle={t('procurement.managerDeliveries.subtitle')}
        styles={styles}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* The drawing's second header row. Renders nothing until a project is chosen. */}
        <ProjectContextBar />

        {/* THE THREE TILES, each with its own left accent as the drawing colours them. */}
        <View style={styles.tiles}>
          {/* REAL — the row count dated today, and what those orders are worth. */}
          <View testID="tile-arrivals" style={styles.tile}>
            <View style={[styles.tileAccent, { backgroundColor: p.accent }]} />
            <View style={styles.tileBody}>
              <View style={styles.tileHead}>
                <Text style={styles.tileLabel} numberOfLines={1}>
                  {t('procurement.managerDeliveries.arrivals')}
                </Text>
                <MaterialIcons name="local-shipping" size={16} color={p.accent} />
              </View>
              <View style={styles.tileValueRow}>
                <Text style={styles.tileValue}>
                  {loading && rows.length === 0 ? '—' : String(today.length)}
                </Text>
                <Text style={styles.tileUnit}>{t('procurement.managerDeliveries.items')}</Text>
              </View>
              <Text style={[styles.tileMeta, { color: p.text }]} numberOfLines={1}>
                {todayValue.isZero() ? '' : spacedMoney(todayValue, 'THB')}
              </Text>
            </View>
          </View>

          {/* DRAWN — there is no status column, so nothing can be "awaiting inspection". */}
          <View testID="tile-inspection" style={styles.tile}>
            <View style={[styles.tileAccent, { backgroundColor: p.warning }]} />
            <View style={styles.tileBody}>
              <View style={styles.tileHead}>
                <Text style={styles.tileLabel} numberOfLines={1}>
                  {t('procurement.managerDeliveries.inspection')}
                </Text>
                <MaterialIcons name="pending-actions" size={16} color={p.warning} />
              </View>
              <View style={styles.tileValueRow}>
                <Text style={styles.tileValue}>{String(DELIVERY_STATUS.value.due)}</Text>
                <Text style={styles.tileUnit}>{t('procurement.managerDeliveries.trucks')}</Text>
              </View>
              <Text style={[styles.tileMeta, { color: p.warning }]} numberOfLines={1}>
                {t('procurement.managerDeliveries.queueOver')}
              </Text>
            </View>
          </View>

          {/* DRAWN — an invoice can be DISPUTED, which is a status on an invoice, not a case with an
              amount held against it. Nothing withholds money. */}
          <View testID="tile-disputes" style={styles.tile}>
            <View style={[styles.tileAccent, { backgroundColor: p.danger }]} />
            <View style={styles.tileBody}>
              <View style={styles.tileHead}>
                <Text style={styles.tileLabel} numberOfLines={1}>
                  {t('procurement.managerDeliveries.disputes')}
                </Text>
                <MaterialIcons name="gavel" size={16} color={p.danger} />
              </View>
              <View style={styles.tileValueRow}>
                <Text style={styles.tileValue}>{String(DELIVERY_DISPUTES.value.cases)}</Text>
                <Text style={styles.tileUnit}>{t('procurement.managerDeliveries.cases')}</Text>
              </View>
              <Text style={[styles.tileMeta, { color: p.danger }]} numberOfLines={1}>
                {t('procurement.managerDeliveries.held', { amount: DELIVERY_DISPUTES.value.held })}
              </Text>
            </View>
          </View>
        </View>

        {/* THE LOGISTICS ADVISOR — drawn in full: no GPS feed, no carrier telemetry. */}
        <View testID="logistics-advisor" style={styles.advisor}>
          <View style={[styles.cardAccent, { backgroundColor: p.accent }]} />
          <View style={styles.advisorBody}>
            <View style={styles.advisorHead}>
              <View style={styles.advisorPlate}>
                <MaterialIcons name="auto-awesome" size={18} color={p.accent} />
              </View>
              <Text style={styles.advisorTitle} numberOfLines={1}>
                {t('procurement.managerDeliveries.advisor')}
              </Text>
            </View>

            <Text style={styles.body}>
              {t('procurement.managerDeliveries.advisorBody', {
                minutes: String(DELIVERY_TELEMETRY.value.delayMinutes),
                speed: DELIVERY_TELEMETRY.value.avgSpeed,
              })}
            </Text>

            <View style={styles.advisorActions}>
              <View style={styles.metricChip}>
                <MaterialIcons name="traffic" size={14} color={p.muted} />
                <Text style={styles.metricChipText} numberOfLines={1}>
                  {t('procurement.managerDeliveries.etaGain', {
                    minutes: String(DELIVERY_TELEMETRY.value.delayMinutes),
                    eta: LOGISTICS_ETA.value,
                  })}
                </Text>
              </View>
              <Pressable
                testID="advisor-adjust"
                accessibilityRole="button"
                accessibilityLabel={t('procurement.managerDeliveries.adjustSchedule')}
                onPress={() => soon('procurement.managerDeliveries.adjustSchedule')}
                style={styles.advisorAction}
              >
                <Text style={styles.advisorActionText} numberOfLines={1}>
                  {t('procurement.managerDeliveries.adjustSchedule')}
                </Text>
                <MaterialIcons name="arrow-forward" size={16} color={p.bg} />
              </Pressable>
            </View>

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
        </View>

        {/* THE YARD ROW — compact, as the drawing draws it: a plate, two lines, a percentage chip and
            a button. Drawn in full: §20.7.3 defines /procurement/warehouses and /procurement/inventory
            and nothing backs either. See WAREHOUSE_CAPACITY. */}
        <View testID="warehouse-capacity" style={styles.yard}>
          <View style={styles.yardPlate}>
            <MaterialIcons name="warehouse" size={20} color={p.accent} />
          </View>
          <View style={styles.yardText}>
            <View style={styles.yardTitleRow}>
              <Text style={styles.yardName} numberOfLines={1}>
                {WAREHOUSE_CAPACITY.value.name}
              </Text>
              <View style={styles.yardChip}>
                <Text style={styles.yardChipText}>{`${WAREHOUSE_CAPACITY.value.percent}%`}</Text>
              </View>
            </View>
            <Text style={styles.yardSub} numberOfLines={1}>
              {WAREHOUSE_CAPACITY.value.remaining}
            </Text>
          </View>
          <Pressable
            testID="warehouse-plan"
            accessibilityRole="button"
            accessibilityLabel={t('procurement.managerDeliveries.yardPlan')}
            onPress={() => soon('procurement.managerDeliveries.yard')}
            style={styles.yardBtn}
          >
            <Text style={styles.yardBtnText} numberOfLines={1}>
              {t('procurement.managerDeliveries.yardPlan')}
            </Text>
          </Pressable>
        </View>

        {/* THE FILTER ROW. The counts are honest against what the list shows — the shape is drawn,
            but it is assigned deterministically, so a chip saying 4 means four cards. */}
        <View style={styles.chipRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipContent}
          >
            {FILTERS.map(({ id, labelKey }) => (
              <QueueChip
                key={id ?? 'ALL'}
                testID={`delivery-filter-${id ?? 'ALL'}`}
                label={t(labelKey)}
                count={id === null ? rows.length : (counts.get(id) ?? 0)}
                on={filter === id}
                onPress={() => setFilter(id)}
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
            data={visible}
            keyExtractor={({ row }, i) => row.delivery_id || String(i)}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text testID="deliveries-empty" style={styles.empty}>
                {t('procurement.deliveries.empty')}
              </Text>
            }
            renderItem={({ item: { row, index } }) => {
              const shape = shapeOf(index);
              const kind = shape.kind;
              const tone = toneOf(kind);
              const po = pos.get(row.po_id ?? '');
              const vendor = po === undefined ? null : (vendors.get(po.vendor_id) ?? null);
              const id = row.delivery_id;
              return (
                <View testID={`delivery-item-${id}`} style={styles.deliveryCard}>
                  <View style={[styles.cardAccent, { backgroundColor: tone }]} />
                  <View style={styles.cardBody}>
                    {/* TOP META — pill and record number on one row, then the material, then the
                        detail line; the amount and its caption at the trailing edge. */}
                    <View style={styles.cardTop}>
                      <View style={styles.cardTopText}>
                        <View style={styles.pillRow}>
                          <View
                            style={[
                              styles.pill,
                              { borderColor: `${tone}55`, backgroundColor: `${tone}1A` },
                            ]}
                          >
                            <Text style={[styles.pillText, { color: tone }]} numberOfLines={1}>
                              {t(KIND_PILL[kind].labelKey)}
                            </Text>
                          </View>
                          {/* REAL — the delivery note the server returned. */}
                          <Text style={styles.recordNumber} numberOfLines={1}>
                            {row.delivery_note ?? id.slice(0, 8)}
                          </Text>
                        </View>
                        <Text style={styles.material} numberOfLines={1}>
                          {shape.material}
                        </Text>
                        <Text style={styles.detail} numberOfLines={1}>
                          {shape.detail}
                        </Text>
                      </View>
                      <View style={styles.amountBlock}>
                        {/* The disputed card shows the DRAWN credit note, as the drawing does; every
                            other card shows the order's real amount. */}
                        {kind === 'DISPUTED' ? (
                          <Text style={[styles.amount, { color: p.danger }]} numberOfLines={1}>
                            {DELIVERY_INSPECTION.value.creditNote}
                          </Text>
                        ) : po === undefined ? null : (
                          <Text style={styles.amount} numberOfLines={1}>
                            {spacedMoney(new Decimal(po.total_amount), 'THB')}
                          </Text>
                        )}
                        <Text style={styles.amountCaption} numberOfLines={1}>
                          {kind === 'DISPUTED'
                            ? t('procurement.managerDeliveries.creditNote')
                            : kind === 'AWAITING_GRN' && po !== undefined
                              ? `#${po.po_number}`
                              : shape.trailing}
                        </Text>
                      </View>
                    </View>

                    {/* THE INSET PANEL — a different one per card shape, as the drawing draws it. */}
                    {kind === 'AWAITING_GRN' ? (
                      <View style={styles.panel}>
                        <View style={styles.panelRow}>
                          <MaterialIcons name="verified" size={14} color={p.success} />
                          <Text style={styles.panelText} numberOfLines={1}>
                            {vendor ?? '—'}
                          </Text>
                          <Text style={[styles.panelTrail, { color: p.success }]}>
                            {t('procurement.managerDeliveries.trustScore', {
                              percent: DELIVERY_VENDOR_TRUST.value,
                            })}
                          </Text>
                        </View>
                        <View style={styles.panelRow}>
                          <MaterialIcons name="scale" size={14} color={p.muted} />
                          <Text style={styles.panelText} numberOfLines={1}>
                            {DELIVERY_INSPECTION.value.weighed}
                          </Text>
                          <Text style={[styles.panelTrail, { color: p.success }]}>
                            {DELIVERY_INSPECTION.value.verdict}
                          </Text>
                        </View>
                      </View>
                    ) : null}

                    {kind === 'DISPUTED' ? (
                      <View style={styles.panel}>
                        <View style={styles.panelRow}>
                          <MaterialIcons name="warning" size={14} color={p.danger} />
                          <Text style={styles.panelText} numberOfLines={1}>
                            {vendor ?? '—'}
                          </Text>
                          <Text style={[styles.panelTrail, { color: p.danger }]}>
                            {t('procurement.managerDeliveries.remedyWindow')}
                          </Text>
                        </View>
                        <Text style={styles.panelBody}>{DELIVERY_DISPUTE_REASON.value}</Text>
                      </View>
                    ) : null}

                    {kind === 'IN_TRANSIT' ? (
                      <View style={styles.panel}>
                        <View style={styles.panelRow}>
                          <Text style={styles.panelText} numberOfLines={1}>
                            {t('procurement.managerDeliveries.fleetStatus', {
                              arrived: String(DELIVERY_TRANSIT.value.arrived),
                              sent: String(DELIVERY_TRANSIT.value.sent),
                            })}
                          </Text>
                          <Text style={styles.panelTrail}>
                            {t('procurement.managerDeliveries.distanceAway', {
                              km: DELIVERY_TRANSIT.value.distanceKm,
                            })}
                          </Text>
                        </View>
                        {/* The drawing's segmented bar: what has arrived, then what is moving. */}
                        <View testID={`delivery-progress-${id}`} style={styles.track}>
                          <View
                            style={[
                              styles.trackDone,
                              {
                                flex: DELIVERY_TRANSIT.value.arrived,
                                backgroundColor: p.success,
                              },
                            ]}
                          />
                          <View
                            style={[
                              styles.trackDone,
                              {
                                flex: DELIVERY_TRANSIT.value.sent - DELIVERY_TRANSIT.value.arrived,
                                backgroundColor: `${p.accent}66`,
                              },
                            ]}
                          />
                        </View>
                        <View style={styles.legendRow}>
                          <View style={styles.legend}>
                            <View style={[styles.dot, { backgroundColor: p.success }]} />
                            <Text style={styles.legendText} numberOfLines={1}>
                              {DELIVERY_TRANSIT.value.legendDone}
                            </Text>
                          </View>
                          <View style={styles.legend}>
                            <View style={[styles.dot, { backgroundColor: p.accent }]} />
                            <Text style={styles.legendText} numberOfLines={1}>
                              {DELIVERY_TRANSIT.value.legendMoving}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ) : null}

                    {kind === 'RECEIVED' ? (
                      <View style={styles.panel}>
                        <View style={styles.panelRow}>
                          <MaterialIcons name="inventory-2" size={14} color={p.muted} />
                          <Text style={styles.panelText} numberOfLines={1}>
                            {t('procurement.managerDeliveries.shelfLine', {
                              shelf: DELIVERY_STORAGE.value.shelf,
                              inspector: DELIVERY_INSPECTION.value.inspector,
                            })}
                          </Text>
                          <Text style={styles.panelTrail}>{DELIVERY_STORAGE.value.time}</Text>
                        </View>
                      </View>
                    ) : null}

                    {/* THE ACTION ROW, which the drawing varies per card shape. */}
                    <View style={styles.btnRow}>
                      {kind === 'AWAITING_GRN' ? (
                        <>
                          <Pressable
                            testID={`delivery-weigh-${id}`}
                            accessibilityRole="button"
                            accessibilityLabel={t('procurement.managerDeliveries.weighIn')}
                            onPress={() => soon('procurement.managerDeliveries.weighIn')}
                            style={[styles.btn, styles.btnGhost]}
                          >
                            <MaterialIcons name="assignment" size={16} color={p.text} />
                            <Text style={styles.btnGhostText} numberOfLines={1}>
                              {t('procurement.managerDeliveries.weighIn')}
                            </Text>
                          </Pressable>
                          <Pressable
                            testID={`delivery-flag-${id}`}
                            accessibilityRole="button"
                            accessibilityLabel={t('procurement.managerDeliveries.flagItem')}
                            onPress={() => soon('procurement.managerDeliveries.flagItem')}
                            style={[styles.btn, styles.btnGhost]}
                          >
                            <MaterialIcons name="flag" size={16} color={p.text} />
                            <Text style={styles.btnGhostText} numberOfLines={1}>
                              {t('procurement.managerDeliveries.flagItem')}
                            </Text>
                          </Pressable>
                          <Pressable
                            testID={`delivery-grn-${id}`}
                            accessibilityRole="button"
                            accessibilityLabel={t('procurement.managerDeliveries.approveGrn')}
                            onPress={() => soon('procurement.managerDeliveries.approveGrn')}
                            style={[styles.btn, styles.btnPrimary]}
                          >
                            <MaterialIcons name="edit-document" size={16} color={p.onPrimary} />
                            <Text style={styles.btnPrimaryText} numberOfLines={1}>
                              {t('procurement.managerDeliveries.approveGrn')}
                            </Text>
                          </Pressable>
                        </>
                      ) : null}

                      {kind === 'DISPUTED' ? (
                        <>
                          <Pressable
                            testID={`delivery-chat-${id}`}
                            accessibilityRole="button"
                            accessibilityLabel={t('procurement.managerDeliveries.chatVendor')}
                            onPress={() => soon('procurement.managerDeliveries.chatVendor')}
                            style={[styles.btn, styles.btnGhost]}
                          >
                            <MaterialIcons name="chat" size={16} color={p.text} />
                            <Text style={styles.btnGhostText} numberOfLines={1}>
                              {t('procurement.managerDeliveries.chatVendor')}
                            </Text>
                          </Pressable>
                          <Pressable
                            testID={`delivery-photo-${id}`}
                            accessibilityRole="button"
                            accessibilityLabel={t('procurement.managerDeliveries.photoEvidence')}
                            onPress={() => soon('procurement.managerDeliveries.photoEvidence')}
                            style={[styles.btn, styles.btnDanger]}
                          >
                            <MaterialIcons name="photo-camera" size={16} color={p.onPrimary} />
                            <Text style={styles.btnPrimaryText} numberOfLines={1}>
                              {t('procurement.managerDeliveries.photoEvidence')}
                            </Text>
                          </Pressable>
                        </>
                      ) : null}

                      {kind === 'IN_TRANSIT' ? (
                        <>
                          <Pressable
                            testID={`delivery-gps-${id}`}
                            accessibilityRole="button"
                            accessibilityLabel={t('procurement.managerDeliveries.viewGps')}
                            onPress={() => soon('procurement.managerDeliveries.viewGps')}
                            style={[styles.btn, styles.btnGhost]}
                          >
                            <MaterialIcons name="near-me" size={16} color={p.accent} />
                            <Text style={styles.btnGhostText} numberOfLines={1}>
                              {t('procurement.managerDeliveries.viewGps')}
                            </Text>
                          </Pressable>
                          <Pressable
                            testID={`delivery-call-${id}`}
                            accessibilityRole="button"
                            accessibilityLabel={t('procurement.managerDeliveries.callDriver')}
                            onPress={() => soon('procurement.managerDeliveries.callDriver')}
                            style={[styles.btn, styles.btnGhost]}
                          >
                            <MaterialIcons name="phone" size={16} color={p.accent} />
                            <Text style={styles.btnGhostText} numberOfLines={1}>
                              {t('procurement.managerDeliveries.callDriver')}
                            </Text>
                          </Pressable>
                        </>
                      ) : null}

                      {kind === 'RECEIVED' ? (
                        <>
                          <Pressable
                            testID={`delivery-receipt-${id}`}
                            accessibilityRole="button"
                            accessibilityLabel={t('procurement.managerDeliveries.viewGrn')}
                            onPress={() => soon('procurement.managerDeliveries.viewGrn')}
                            style={[styles.btn, styles.btnGhost]}
                          >
                            <MaterialIcons name="receipt" size={16} color={p.text} />
                            <Text style={styles.btnGhostText} numberOfLines={1}>
                              {`${t('procurement.managerDeliveries.viewGrn')} · #${
                                DELIVERY_GRN_NUMBER.value[
                                  index % DELIVERY_GRN_NUMBER.value.length
                                ] ?? ''
                              }`}
                            </Text>
                          </Pressable>
                          <Pressable
                            testID={`delivery-share-${id}`}
                            accessibilityRole="button"
                            accessibilityLabel={t('procurement.managerDeliveries.share')}
                            onPress={() => soon('procurement.managerDeliveries.share')}
                            style={styles.btnSquare}
                          >
                            <MaterialIcons name="share" size={18} color={p.text} />
                          </Pressable>
                        </>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            }}
          />
        </LoadingBoundary>

        {/* THE TRAILING MAP ROW. Drawn in full — the same GPS feed DELIVERY_TELEMETRY names. */}
        <Pressable
          testID="delivery-radar"
          accessibilityRole="button"
          accessibilityLabel={t('procurement.managerDeliveries.radarTitle')}
          onPress={() => soon('procurement.managerDeliveries.radarTitle')}
          style={styles.radar}
        >
          <View style={styles.radarPlate}>
            <MaterialIcons name="route" size={20} color={p.accent} />
          </View>
          <View style={styles.radarText}>
            <Text style={styles.radarTitle} numberOfLines={1}>
              {t('procurement.managerDeliveries.radarTitle')}
            </Text>
            <Text style={styles.radarBody} numberOfLines={1}>
              {t('procurement.managerDeliveries.radarBody', {
                count: String(DELIVERY_RADAR.value),
              })}
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={p.muted} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

function makeStyles(p: Palette) {
  return StyleSheet.create({
    ...makeQueueStyles(p),
    scroll: { gap: spacing.sm, paddingBottom: spacing.xl },

    // ── The three tiles ──────────────────────────────────────────────────────────────────────
    tiles: { flexDirection: 'row', gap: spacing.xs },
    tile: {
      flex: 1,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      flexDirection: 'row',
      overflow: 'hidden',
    },
    tileAccent: { width: 3 },
    tileBody: { flex: 1, gap: 2, padding: spacing.xs },
    tileHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    tileLabel: {
      flex: 1,
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: 9,
      textTransform: 'uppercase',
    },
    tileValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
    tileValue: { color: p.text, fontFamily: fontFamily.bold, fontSize: typography.title.fontSize },
    tileUnit: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 10 },
    tileMeta: { fontFamily: fontFamily.semibold, fontSize: 10 },

    // ── The logistics advisor ────────────────────────────────────────────────────────────────
    advisor: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: `${p.accent}4D`,
      backgroundColor: p.surface,
      flexDirection: 'row',
      overflow: 'hidden',
    },
    advisorBody: { flex: 1, padding: spacing.sm, gap: spacing.xs },
    advisorHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    advisorPlate: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: plateRadius(32),
      backgroundColor: `${p.accent}26`,
    },
    advisorTitle: {
      flex: 1,
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: 11,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    advisorActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs,
    },
    metricChip: {
      flexShrink: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.xs,
      paddingVertical: 4,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.bg,
    },
    metricChipText: {
      flexShrink: 1,
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: 11,
    },
    advisorAction: {
      minHeight: touchTarget.secondaryButton,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: p.accent,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    advisorActionText: {
      color: p.bg,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },

    // ── The yard row ─────────────────────────────────────────────────────────────────────────
    yard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      padding: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    yardPlate: {
      width: PLATE,
      height: PLATE,
      borderRadius: plateRadius(PLATE),
      backgroundColor: `${p.accent}1A`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    yardText: { flex: 1, gap: 2 },
    yardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    yardName: {
      flexShrink: 1,
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    yardChip: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: radius.xl,
      backgroundColor: `${p.warning}26`,
    },
    yardChipText: { color: p.warning, fontFamily: fontFamily.bold, fontSize: 10 },
    yardSub: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 11 },
    yardBtn: {
      minHeight: touchTarget.secondaryButton,
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.bg,
    },
    yardBtnText: { color: p.text, fontFamily: fontFamily.medium, fontSize: 11 },

    // ── A delivery card ──────────────────────────────────────────────────────────────────────
    deliveryCard: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      flexDirection: 'row',
      overflow: 'hidden',
    },
    cardAccent: { width: 4 },
    cardBody: { flex: 1, padding: spacing.sm, gap: spacing.xs },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
    cardTopText: { flex: 1, gap: 2 },
    pillRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2, flexWrap: 'wrap' },
    pill: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
    },
    pillText: {
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.3,
    },
    recordNumber: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 11 },
    material: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.fontSize * 1.25,
    },
    detail: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 11 },
    amountBlock: { alignItems: 'flex-end', gap: 1 },
    amount: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.caption.fontSize,
    },
    amountCaption: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 10 },

    panel: {
      gap: spacing.xs / 2,
      padding: spacing.xs,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.bg,
    },
    panelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    panelText: {
      flex: 1,
      color: p.text,
      fontFamily: fontFamily.medium,
      fontSize: 11,
    },
    panelTrail: { color: p.muted, fontFamily: fontFamily.semibold, fontSize: 11 },
    panelBody: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: 11,
      lineHeight: 11 * 1.5,
    },

    track: {
      height: 6,
      borderRadius: 999,
      backgroundColor: p.elevated,
      overflow: 'hidden',
      flexDirection: 'row',
    },
    trackDone: { height: 6 },
    legendRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
    legend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    dot: { width: 6, height: 6, borderRadius: 999 },
    legendText: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 10 },

    btnRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
    btn: {
      flex: 1,
      minHeight: touchTarget.iconButton,
      borderRadius: radius.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingHorizontal: spacing.xs / 2,
    },
    btnGhost: { borderWidth: 1, borderColor: p.border, backgroundColor: p.bg },
    btnGhostText: {
      flexShrink: 1,
      color: p.text,
      fontFamily: fontFamily.medium,
      fontSize: 11,
    },
    btnPrimary: { backgroundColor: p.primary },
    btnDanger: { backgroundColor: p.danger },
    btnPrimaryText: {
      flexShrink: 1,
      color: p.onPrimary,
      fontFamily: fontFamily.semibold,
      fontSize: 11,
    },
    btnSquare: {
      width: touchTarget.iconButton,
      height: touchTarget.iconButton,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // ── The trailing map row ─────────────────────────────────────────────────────────────────
    radar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      padding: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    radarPlate: {
      width: PLATE,
      height: PLATE,
      borderRadius: plateRadius(PLATE),
      backgroundColor: `${p.accent}1A`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radarText: { flex: 1, gap: 1 },
    radarTitle: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    radarBody: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 11 },
  });
}
