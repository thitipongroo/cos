// Orders screen — PROCUREMENT_OFFICER: the purchase orders this role is running.
//
// Implements mockup/mobile/10_proc_officer/03_orders/01_po_order.
//
// REBUILT 2026-09-08 for that drawing. What was here was a plain list of PO numbers with a status
// chip, and a detail view behind it; the drawing is a working queue — search, filter chips, a card
// per order carrying the vendor, the money, the project and how far the delivery has got, and the
// approval action on the orders that are actually waiting for one. THE DETAIL VIEW STAYS: tapping a
// card still opens `GET /procurement/purchase-orders/:poId` and its line items, which the drawing
// does not show and which is reviewed working capability (ADR-085).
//
// WHAT IS REAL, AND WHERE FROM.
//   The rows          `GET /procurement/purchase-orders?limit=100` — 42 in the seeded tenant.
//   Vendor name       `GET /procurement/vendors/directory`, indexed by `vendor_id` ONCE for the
//                     screen. Not a backend join: unlike the FINANCE invoice case (ADR-100) this
//                     screen is procurement and that endpoint already returns every active vendor.
//   Project name      `GET /projects`, indexed by `project_id` — NOT `/projects/mine`, because
//                     this role is a member of no project. See `projectNameIndex`.
//   The money         `purchase_orders.total_amount`, through decimal.js and `spacedMoney`.
//   ETA               `purchase_orders.delivery_date` — a real date column. Absent where null; no
//                     ETA is invented for an order that carries none.
//   Delivery state    the order's OWN status, and the count of deliveries recorded against it from
//                     `GET /procurement/deliveries?limit=100`.
//   Approve           `POST /procurement/purchase-orders/:poId/approve`, offered only on
//                     PENDING_APPROVAL — the one state that endpoint accepts.
//
// THERE IS NO PERCENTAGE ON THESE CARDS, AND THAT IS DELIBERATE. The drawing prints "Delivery
// Progress 65%" with a bar. A real percentage needs quantity received against quantity ordered —
// `delivery_items.quantity_received` over `po_line_items.quantity` — and reaching both for a row
// costs two requests per order, 84 for this tenant, on a screen that renders in one. So the card
// shows the STAGE the order is genuinely at, from its own status and its own delivery count, and
// prints no number at all. A drawn 65% would have been the easy option and would have been a
// fabricated measurement on a purchasing screen. An aggregate endpoint returning received-vs-ordered
// per PO is what would put the percentage back.

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  FlatList,
  StyleSheet,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Decimal from 'decimal.js';
import { get } from '../../api/client';
import {
  listPurchaseOrders,
  listDeliveries,
  vendorIndex,
  projectNameIndex,
  approvePurchaseOrder,
  type PurchaseOrderRow,
} from '../../api/procurement';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { StatusChip } from '../../components/StatusChip';
import { PO_DELAY_ALERT } from '../../lib/mockupFigures';
import { spacedMoney } from '../../lib/compactMoney';
import { useAuthStore } from '../../store/authStore';
import { canRenderWriteControls } from '../../lib/readOnlyRole';
import { useT } from '../../i18n';
import { useComingSoon } from '../../components/useComingSoon';
import { usePalette, useIsDark, type Palette } from '../../theme/usePalette';
import { fontFamily, radius, spacing, typography } from '../../theme/tokens';
import { makeQueueStyles, QueueChip } from '../../components/procurement/QueueKit';

interface PoLineItem {
  line_id: string;
  description: string;
  quantity: string;
  unit: string;
}
interface PoDetail {
  po: PurchaseOrderRow;
  line_items: PoLineItem[];
}

/** The chips, in the order an order moves through them. Every one is a real `status` value. */
const STATUSES = ['PENDING_APPROVAL', 'ACKNOWLEDGED', 'INVOICED', 'PAID'] as const;
type Status = (typeof STATUSES)[number];

const TONE: Record<string, keyof Pick<Palette, 'warning' | 'accent' | 'success' | 'muted'>> = {
  DRAFT: 'muted',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'accent',
  SENT: 'accent',
  ACKNOWLEDGED: 'accent',
  PARTIALLY_DELIVERED: 'accent',
  FULLY_DELIVERED: 'success',
  INVOICED: 'success',
  PAID: 'success',
  DISPUTED: 'warning',
};

/**
 * Which of the three stages the order has genuinely reached, from its own status.
 *
 * ORDINAL, NOT A PERCENTAGE — see the header. `null` where the status is one this map has no
 * opinion about, and the card then draws no stepper rather than guessing a stage.
 */
const STAGE: Record<string, 0 | 1 | 2> = {
  DRAFT: 0,
  PENDING_APPROVAL: 0,
  APPROVED: 0,
  SENT: 0,
  ACKNOWLEDGED: 0,
  PARTIALLY_DELIVERED: 1,
  FULLY_DELIVERED: 1,
  INVOICED: 2,
  PAID: 2,
};

export default function OrdersScreen(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(p), [p]);

  const [rows, setRows] = useState<PurchaseOrderRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [vendors, setVendors] = useState<Map<string, string>>(new Map());
  const [projects, setProjects] = useState<Map<string, string>>(new Map());
  const [deliveryCount, setDeliveryCount] = useState<Map<string, number>>(new Map());
  const [detail, setDetail] = useState<PoDetail | null>(null);
  const [filter, setFilter] = useState<'' | Status>('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const soon = useComingSoon();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orders, dels, vend, mine] = await Promise.all([
        listPurchaseOrders(),
        listDeliveries().catch(() => ({ items: [], total: 0 })),
        vendorIndex().catch(() => new Map<string, string>()),
        projectNameIndex().catch(() => new Map<string, string>()),
      ]);
      setRows(orders.items);
      setTotal(orders.total);
      setVendors(vend);
      setProjects(mine);
      const counted = new Map<string, number>();
      for (const d of dels.items) counted.set(d.po_id, (counted.get(d.po_id) ?? 0) + 1);
      setDeliveryCount(counted);
    } catch {
      setTotal(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = useCallback(async (poId: string) => {
    setDetail(await get<PoDetail>(`/procurement/purchase-orders/${poId}`));
  }, []);

  /**
   * Approve, then reload.
   *
   * NOT OPTIMISTIC and not offline-queued: a PO approval is a financial mutation and §17.4 puts
   * those in the online-required set, so the honest redraw is the one the server agrees with.
   */
  const approve = useCallback(
    async (po: PurchaseOrderRow) => {
      setBusy(po.po_id);
      try {
        await approvePurchaseOrder(po.po_id, 'TENANT_ADMIN');
        await load();
      } catch {
        Alert.alert(t('procurement.orders.approve'), t('procurement.orders.approveFailed'));
      } finally {
        setBusy(null);
      }
    },
    [load, t],
  );

  const counts = useMemo(() => {
    const tally: Record<string, number> = { '': rows.length };
    for (const s of STATUSES) tally[s] = rows.filter((r) => r.status === s).length;
    return tally;
  }, [rows]);

  const visible = rows.filter((r) => {
    if (filter !== '' && r.status !== filter) return false;
    if (query.trim() === '') return true;
    const needle = query.trim().toLowerCase();
    return (
      r.po_number.toLowerCase().includes(needle) ||
      (vendors.get(r.vendor_id) ?? '').toLowerCase().includes(needle)
    );
  });

  if (detail) {
    return (
      <ScrollView testID="order-detail-screen" contentContainerStyle={styles.detail}>
        <Pressable
          testID="order-detail-back"
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => setDetail(null)}
          style={styles.backPlate}
        >
          <MaterialIcons name="chevron-left" size={26} color={p.text} />
        </Pressable>
        <View style={styles.detailHead}>
          <Text style={styles.detailTitle}>{detail.po.po_number}</Text>
          <StatusChip label={detail.po.status} />
        </View>
        {detail.line_items.length === 0 ? (
          <Text style={styles.empty}>{t('procurement.orders.noLines')}</Text>
        ) : (
          detail.line_items.map((l) => (
            <View key={l.line_id} testID="order-line" style={styles.line}>
              <Text style={styles.lineText} numberOfLines={2}>
                {l.description}
              </Text>
              <Text style={styles.lineQty}>{`${l.quantity} ${l.unit}`}</Text>
            </View>
          ))
        )}
      </ScrollView>
    );
  }

  return (
    <View testID="orders-screen" style={styles.page}>
      {/* NO TITLE AND NO COUNT ROW (PO decision 2026-09-08). The tab bar already names this screen
          "Orders", and the All chip already carries the count — a heading and a total above them
          said both things a second time and cost two rows of a phone. The count is still fetched
          and is still the SERVER's, not the page's; it prints inside the All chip. */}
      <View style={styles.search}>
        <MaterialIcons name="search" size={20} color={p.muted} />
        <TextInput
          testID="order-search"
          value={query}
          onChangeText={setQuery}
          placeholder={t('procurement.orders.searchPlaceholder')}
          placeholderTextColor={p.muted}
          style={styles.searchInput}
          accessibilityLabel={t('procurement.orders.searchPlaceholder')}
        />
      </View>

      <View style={styles.chipRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipContent}
        >
          {(['', ...STATUSES] as const).map((s) => (
            <QueueChip
              key={s === '' ? 'ALL' : s}
              testID={`order-filter-${s === '' ? 'ALL' : s}`}
              label={s === '' ? t('procurement.orders.all') : t(`procurement.orders.status.${s}`)}
              // The All chip carries the SERVER's total, which is the tenant; the rest count the
              // rows on screen. That difference is why `total` is still fetched at all.
              count={s === '' ? (total ?? counts[s] ?? 0) : (counts[s] ?? 0)}
              on={filter === s}
              onPress={() => setFilter(s)}
              styles={styles}
            />
          ))}
        </ScrollView>
      </View>

      <LoadingBoundary
        loading={loading && rows.length === 0}
        variant="list"
        theme={isDark ? 'dark' : 'light'}
        style={styles.listRegion}
      >
        <FlatList
          testID="orders-list"
          data={visible}
          keyExtractor={(r) => r.po_id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            /* DRAWN in full — no logistics risk model exists and nothing here knows about a port.
               See PO_DELAY_ALERT in the register. */
            <View testID="orders-alert" style={[styles.card, styles.alert]}>
              <View style={styles.alertHead}>
                <MaterialIcons name="auto-awesome" size={16} color={p.accent} />
                <Text style={styles.alertTitle}>{t('procurement.orders.delayAlert')}</Text>
              </View>
              <Text style={styles.body}>
                {t('procurement.orders.delayBody', {
                  count: PO_DELAY_ALERT.value.count,
                  hours: PO_DELAY_ALERT.value.hours,
                  place: PO_DELAY_ALERT.value.place,
                })}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <Text testID="orders-empty" style={styles.empty}>
              {t('procurement.orders.empty')}
            </Text>
          }
          renderItem={({ item }) => (
            <OrderCard
              po={item}
              vendorName={vendors.get(item.vendor_id) ?? null}
              projectName={projects.get(item.project_id) ?? null}
              deliveries={deliveryCount.get(item.po_id) ?? 0}
              busy={busy === item.po_id}
              onOpen={openDetail}
              onApprove={approve}
              onSoon={soon}
              styles={styles}
              palette={p}
              t={t}
            />
          )}
        />
      </LoadingBoundary>

      {/* Drawn — `POST /procurement/purchase-orders` exists, a create sheet does not. */}
      <Pressable
        testID="order-fab"
        accessibilityRole="button"
        accessibilityLabel={t('procurement.orders.create')}
        onPress={() => soon('procurement.orders.create')}
        style={styles.fab}
      >
        <MaterialIcons name="add" size={28} color={p.onPrimary} />
      </Pressable>
    </View>
  );
}

const OrderCard = memo(function OrderCard({
  po,
  vendorName,
  projectName,
  deliveries,
  busy,
  onOpen,
  onApprove,
  onSoon,
  styles,
  palette,
  t,
}: {
  po: PurchaseOrderRow;
  vendorName: string | null;
  projectName: string | null;
  deliveries: number;
  busy: boolean;
  onOpen: (poId: string) => void;
  onApprove: (po: PurchaseOrderRow) => void;
  onSoon: (labelKey: string) => void;
  styles: ReturnType<typeof makeStyles>;
  palette: Palette;
  t: (key: string, params?: Record<string, string | number>) => string;
}): React.JSX.Element {
  // §20.7.9: a read-only role is shown no approve control. Read inside the CARD, not passed in:
  // the rule is about the signed-in session, and a prop would let one caller forget it.
  const canWrite = useAuthStore((s) => canRenderWriteControls(s.role));
  const tone = palette[TONE[po.status] ?? 'muted'];
  const stage = STAGE[po.status];
  return (
    <Pressable
      testID={`order-item-${po.po_id}`}
      accessibilityRole="button"
      accessibilityLabel={po.po_number}
      onPress={() => onOpen(po.po_id)}
      style={[styles.card, { borderLeftColor: tone }]}
    >
      {/* TWO FULL-WIDTH ROWS, not a left column beside a right one (PO 2026-09-08). The status had
          to sit against the CARD's trailing edge, and inside a `flex: 1` text column its right edge
          is the middle of the card. So the head is two rows that each span the whole width:
            number ............................. amount  ›
            vendor · project ................... STATUS
          ONE LINE FOR THE NUMBER, at the label step. `#PO-SKV45-FORMWORK` wrapped onto two rows
          beside the amount and left the card ragged; the type steps down but NOT below the amount
          beside it, which is the floor the instruction set — an order is identified by its number,
          so it may not read as fine print. */}
      <View style={styles.headRow}>
        <Text style={styles.number} numberOfLines={1} ellipsizeMode="middle">
          {`#${po.po_number}`}
        </Text>
        <Text style={styles.amount}>{spacedMoney(new Decimal(po.total_amount), 'THB')}</Text>
        <MaterialIcons name="chevron-right" size={20} color={palette.muted} />
      </View>
      <View style={styles.headRow}>
        <View style={styles.whoRow}>
          {/* REAL — the vendor index, one request for the screen. Nothing is drawn where a vendor
              record is missing; the line simply does not render. */}
          {vendorName === null ? null : (
            <Text style={styles.vendor} numberOfLines={1}>
              {vendorName}
            </Text>
          )}
          {projectName === null ? null : (
            <Text style={styles.project} numberOfLines={1}>
              {projectName}
            </Text>
          )}
        </View>
        <View style={[styles.statusPill, { borderColor: `${tone}66` }]}>
          <Text style={[styles.statusText, { color: tone }]}>
            {t(`procurement.orders.status.${po.status}`)}
          </Text>
        </View>
      </View>

      {/* THE STAGE, NOT A PERCENTAGE — see the header note. Three segments, filled to where the
          order's own status says it has got. Nothing renders for a status this map has no
          opinion about, rather than a bar at an invented position. */}
      {stage === undefined ? null : (
        <View testID={`order-stage-${po.po_id}`} style={styles.stageRow}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[styles.stageSeg, { backgroundColor: i <= stage ? tone : palette.border }]}
            />
          ))}
          <Text style={styles.stageText}>
            {t(`procurement.orders.stage.${stage}`)}
            {deliveries === 0
              ? ''
              : ` · ${t('procurement.orders.recorded', { count: deliveries })}`}
          </Text>
        </View>
      )}

      {/* §20.7.9: a VIEWER is shown no approve control. The status test says whether the PO
          CAN be decided; `canWrite` says whether this reader may be offered the decision. */}
      {canWrite && po.status === 'PENDING_APPROVAL' ? (
        <View style={styles.actions}>
          <Pressable
            testID={`order-approve-${po.po_id}`}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            accessibilityLabel={t('procurement.orders.approve')}
            disabled={busy}
            onPress={() => onApprove(po)}
            style={[styles.action, styles.actionPrimary]}
          >
            <MaterialIcons name="check-circle" size={18} color={palette.onPrimary} />
            <Text style={styles.actionPrimaryText}>{t('procurement.orders.approve')}</Text>
          </Pressable>
          <Pressable
            testID={`order-decline-${po.po_id}`}
            accessibilityRole="button"
            accessibilityLabel={t('procurement.orders.decline')}
            onPress={() => onSoon('procurement.orders.decline')}
            style={[styles.action, styles.actionGhost]}
          >
            <Text style={styles.actionGhostText}>{t('procurement.orders.decline')}</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
});

function makeStyles(p: Palette) {
  return StyleSheet.create({
    // The chrome every queue screen wears — see components/procurement/QueueKit.tsx.
    ...makeQueueStyles(p),
    // The LABEL step, one down from body — and the amount beside it is `typography.label` too, so
    // this is the floor the instruction set: never smaller than the money.
    number: {
      flex: 1,
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
    },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    // The two names share what the status pill leaves; the vendor gives way first.
    whoRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    vendor: { flexShrink: 1, color: p.muted, fontFamily: fontFamily.regular, fontSize: 12 },
    amount: { color: p.text, fontFamily: fontFamily.bold, fontSize: typography.label.fontSize },
    project: { flexShrink: 1, color: p.muted, fontFamily: fontFamily.regular, fontSize: 10 },
    stageRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
    // 4px high, radius half its height. `badgeRadius.spec.ts` lists it: its NAME contains "tag"
    // (s-TAG-e) so the guard's pattern matches it, and it is not a badge.
    stageSeg: { flex: 1, height: 4, borderRadius: 999 },
    stageText: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: 10,
      marginLeft: spacing.xs,
    },
    actionGhostText: {
      color: p.text,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    alert: { borderLeftColor: p.accent, borderColor: p.accent },
    alertHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    alertTitle: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    detail: { padding: spacing.md, gap: spacing.sm, backgroundColor: p.bg, flexGrow: 1 },
    detailHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    detailTitle: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.title.fontSize,
    },
    line: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    lineText: { flex: 1, color: p.text, fontFamily: fontFamily.regular, fontSize: 12 },
    lineQty: { color: p.muted, fontFamily: fontFamily.semibold, fontSize: 12 },
  });
}
